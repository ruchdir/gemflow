// ==========================================
// SIDE PANEL SETUP
// ==========================================
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Side panel setup error:", error));


// ==========================================
// STATE
// ==========================================
let mainTabId = null;

let batchState = {
  urls: [],
  index: 0,
  pickerTabId: null,
  pickerWindowId: null,
  isProcessing: false
};


// ==========================================
// MESSAGE HANDLER
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  // Open Picker Window
  if (request.action === "open_picker_window") {
    if (sender.tab) {
      mainTabId = sender.tab.id;
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) mainTabId = tabs[0].id;
      });
    }

    chrome.windows.create({
      url: "https://gemini.google.com/mystuff",
      type: "popup",
      width: 1200,
      height: 900
    });

    sendResponse({ status: "opening" });
    return true;
  }

  // Batch Process Images - NOW STORES TO CHROME.STORAGE
  if (request.action === "batch_process_images") {
    if (batchState.isProcessing) {
      console.log("Batch already processing");
      return;
    }

    batchState = {
      urls: request.urls,
      index: 0,
      pickerTabId: sender.tab.id,
      pickerWindowId: sender.tab.windowId,
      isProcessing: true
    };

    console.log(`Starting batch capture of ${request.urls.length} images`);
    processNextInBatch();
  }

  // Ready for Capture
  if (request.action === "ready_for_capture") {
    if (!batchState.isProcessing) return;
    console.log("Overlay ready, capturing...");
    captureAndStore();
  }

  // Resize Window and Capture (for exact image dimensions)
  if (request.action === "resize_and_capture") {
    if (!batchState.isProcessing) return;

    const width = Math.min(request.width, 1920) + 16; // Add chrome border
    const height = Math.min(request.height, 1080) + 88; // Add title bar + border

    console.log(`Resizing window to ${width}x${height} for capture...`);

    chrome.windows.update(batchState.pickerWindowId, {
      width: width,
      height: height
    }, () => {
      // Wait for resize to complete, then capture
      setTimeout(() => {
        captureAndStore();
      }, 1000); // 1 second after resize
    });
  }
});


// ==========================================
// BATCH PROCESSING
// ==========================================
function processNextInBatch() {
  if (batchState.index >= batchState.urls.length) {
    console.log("Batch complete! Closing picker window.");
    batchState.isProcessing = false;
    chrome.windows.remove(batchState.pickerWindowId).catch(() => { });
    return;
  }

  const url = batchState.urls[batchState.index];
  console.log(`Capturing image ${batchState.index + 1}/${batchState.urls.length}`);

  chrome.tabs.sendMessage(batchState.pickerTabId, {
    action: "show_overlay_image",
    url: url
  }).catch(err => {
    console.error("Failed to send show_overlay_image:", err);
    batchState.index++;
    setTimeout(processNextInBatch, 500);
  });
}

function captureAndStore() {
  chrome.windows.update(batchState.pickerWindowId, { focused: true }, () => {
    // Longer delay to ensure window is focused and image is rendered
    setTimeout(() => {
      chrome.tabs.captureVisibleTab(batchState.pickerWindowId, { format: 'png' }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          console.error("Capture failed:", chrome.runtime.lastError.message);
          batchState.index++;
          setTimeout(processNextInBatch, 1000);
        } else {
          console.log("Capture successful, storing to chrome.storage...");

          // Store to chrome.storage.local
          chrome.storage.local.get(['selectedImages'], (result) => {
            const images = result.selectedImages || [];
            images.push(dataUrl);
            chrome.storage.local.set({ selectedImages: images }, () => {
              console.log(`Image ${batchState.index + 1} stored. Total: ${images.length}`);

              // Move to next image with longer delay
              batchState.index++;
              setTimeout(processNextInBatch, 2500); // 2.5 seconds between captures
            });
          });
        }
      });
    }, 800); // 800ms after focus before capture
  });
}
