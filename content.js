// ==========================================
// MAIN PAGE MESSAGE HANDLERS
// ==========================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "paste_prompt") {
    const text = request.text;
    pasteText(text, (res) => {
      if (request.open_media_picker) {
        setTimeout(() => openGoogleDrivePicker(), 500);
      }
      sendResponse(res);
    });
    return true;
  }

  if (request.action === "open_mystuff_picker") {
    chrome.runtime.sendMessage({ action: "open_picker_window" });
    return true;
  }

  if (request.action === "paste_image_data") {
    pasteImageFromDataUrl(request.dataUrl);
  }

  if (request.action === "paste_error") {
    alert("Error pasting image: " + request.message);
  }

  if (request.action === "clear_prompt") {
    // Clear the text editor
    const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
    if (editor) {
      editor.innerHTML = ""; // Use innerHTML to fully clear
      editor.focus();
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Also try to remove any attached images in the input area
    const attachedImages = document.querySelectorAll('[data-test-id="image-preview"], .attached-image, [aria-label*="Remove"]');
    attachedImages.forEach(el => {
      const removeBtn = el.querySelector('button') || el;
      if (removeBtn) removeBtn.click();
    });

    sendResponse({ status: "cleared" });
  }

  // Handler for Picker: Show Overlay Image
  if (request.action === "show_overlay_image") {
    showOverlayAndSignalReady(request.url);
  }

  // NEW: Paste text AND images together
  if (request.action === "paste_with_images") {
    pasteTextAndImages(request.text, request.images, sendResponse);
    return true; // Async response
  }

  return true;
});


// ==========================================
// PICKER MODE - ADD COPY BUTTONS TO IMAGES
// ==========================================
if (window.location.href.includes("/mystuff")) {
  console.log("Generative Prompt Ext: Adding Copy Buttons to Images");

  const selectedUrls = [];

  // Create floating "Send Selected" button
  const sendContainer = document.createElement('div');
  sendContainer.id = 'send-selected-container';
  sendContainer.style.cssText = `
        position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;
        display: none; flex-direction: column; gap: 10px;
    `;

  const sendBtn = document.createElement('button');
  sendBtn.id = 'send-selected-btn';
  sendBtn.style.cssText = `
        padding: 14px 28px; background: linear-gradient(135deg, #4285f4, #34a853); 
        color: white; border: none; border-radius: 28px; font-size: 16px; 
        font-weight: bold; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
    `;
  sendBtn.textContent = 'Send Selected';

  sendBtn.onclick = () => {
    if (selectedUrls.length === 0) return;
    sendBtn.textContent = "Processing...";
    sendBtn.disabled = true;

    chrome.runtime.sendMessage({
      action: "batch_process_images",
      urls: [...selectedUrls]
    });
  };

  sendContainer.appendChild(sendBtn);
  document.body.appendChild(sendContainer);

  function updateSendButton() {
    if (selectedUrls.length > 0) {
      sendContainer.style.display = 'flex';
      sendBtn.textContent = `Send ${selectedUrls.length} Image${selectedUrls.length > 1 ? 's' : ''}`;
      sendBtn.disabled = false;
    } else {
      sendContainer.style.display = 'none';
    }
  }

  // Poll for images and add buttons
  setInterval(() => {
    const images = document.querySelectorAll('img');

    images.forEach(img => {
      // Skip if already processed or too small
      if (img.dataset.copyBtnAdded || img.width < 80) return;
      if (!img.src || !img.src.includes('googleusercontent.com')) return;

      img.dataset.copyBtnAdded = "true";

      // Make parent position relative if needed
      const parent = img.parentElement;
      if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }

      // Create button container
      const btnContainer = document.createElement('div');
      btnContainer.style.cssText = `
                position: absolute; top: 8px; right: 8px; z-index: 99999;
                display: flex; gap: 6px;
            `;

      // SELECT button
      const selectBtn = document.createElement('button');
      selectBtn.textContent = '✓ Select';
      selectBtn.style.cssText = `
                padding: 8px 12px; background: rgba(66, 133, 244, 0.9); color: white;
                border: none; border-radius: 6px; font-size: 12px; font-weight: bold;
                cursor: pointer; backdrop-filter: blur(4px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;

      // Construct high-res URL
      let highResUrl = img.src;
      if (img.src.includes('=')) {
        highResUrl = img.src.replace(/=[a-zA-Z0-9_-]+$/, '=s0');
      }

      let isSelected = false;

      selectBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (isSelected) {
          // Deselect
          isSelected = false;
          selectBtn.textContent = '✓ Select';
          selectBtn.style.background = 'rgba(66, 133, 244, 0.9)';
          img.style.outline = 'none';
          img.style.filter = '';
          const idx = selectedUrls.indexOf(highResUrl);
          if (idx > -1) selectedUrls.splice(idx, 1);
        } else {
          // Select
          isSelected = true;
          selectBtn.textContent = '✗ Selected';
          selectBtn.style.background = 'rgba(52, 168, 83, 0.9)';
          img.style.outline = '4px solid #34a853';
          img.style.outlineOffset = '-4px';
          img.style.filter = 'brightness(0.85)';
          selectedUrls.push(highResUrl);
        }

        updateSendButton();
      };

      // COPY NOW button (single image)
      const copyBtn = document.createElement('button');
      copyBtn.textContent = '📋 Copy';
      copyBtn.style.cssText = `
                padding: 8px 12px; background: rgba(234, 67, 53, 0.9); color: white;
                border: none; border-radius: 6px; font-size: 12px; font-weight: bold;
                cursor: pointer; backdrop-filter: blur(4px);
                box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            `;

      copyBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();

        copyBtn.textContent = '⏳ Copying...';
        copyBtn.disabled = true;

        // Send single image for immediate processing
        chrome.runtime.sendMessage({
          action: "batch_process_images",
          urls: [highResUrl]
        });
      };

      btnContainer.appendChild(selectBtn);
      btnContainer.appendChild(copyBtn);

      // Insert buttons
      if (parent) {
        parent.appendChild(btnContainer);
      }
    });
  }, 1000);
}


// ==========================================
// OVERLAY FOR CAPTURE
// ==========================================
function showOverlayAndSignalReady(url) {
  // HIDE all extension UI elements before capture
  const elementsToHide = document.querySelectorAll('#picker-fab, #send-selected-container, [style*="position: absolute"][style*="z-index: 99999"]');
  elementsToHide.forEach(el => el.style.display = 'none');

  // Also hide the page content completely
  const pageContent = document.body.children;
  for (let i = 0; i < pageContent.length; i++) {
    if (pageContent[i].id !== 'capture-overlay') {
      pageContent[i].style.visibility = 'hidden';
    }
  }

  let overlay = document.getElementById('capture-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    document.body.appendChild(overlay);
  }

  // Reset overlay to loading state
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: #000; z-index: 2147483647; 
    display: flex; justify-content: center; align-items: center;
  `;
  overlay.innerHTML = '<div style="color:#888;font-size:24px;">Loading...</div>';

  const img = document.createElement('img');
  img.src = url;

  img.onload = () => {
    console.log(`Image loaded: ${img.naturalWidth}x${img.naturalHeight}`);

    // Make overlay exactly match image size
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; 
      width: ${img.naturalWidth}px; height: ${img.naturalHeight}px;
      background: transparent; z-index: 2147483647; 
      overflow: hidden;
    `;
    overlay.innerHTML = '';

    // Image at natural size
    img.style.cssText = `width: 100%; height: 100%;`;
    overlay.appendChild(img);

    // Tell background to resize window and capture
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: "resize_and_capture",
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    }, 500);
  };

  img.onerror = () => {
    console.error("Failed to load:", url);
    chrome.runtime.sendMessage({ action: "ready_for_capture" });
  };

  overlay.innerHTML = '';
  overlay.appendChild(img);
}


// ==========================================
// PASTE IMAGE
// ==========================================
async function pasteImageFromDataUrl(dataUrl) {
  try {
    console.log("Processing image...");
    const response = await fetch(dataUrl);
    const blob = await response.blob();

    // Try clipboard (may work if window focused)
    try {
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);

      const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
      if (editor) {
        editor.focus();
        document.execCommand('paste');
        console.log("Pasted via clipboard!");
        return;
      }
    } catch (clipErr) {
      console.log("Clipboard failed:", clipErr.message);
    }

    // Fallback: Download the image
    const filename = `gemini_image_${Date.now()}.png`;
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(downloadUrl);

    // Show notification
    const notif = document.createElement('div');
    notif.style.cssText = `
      position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
      background: #323232; color: white; padding: 16px 24px;
      border-radius: 8px; font-size: 14px; z-index: 2147483647;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notif.textContent = `Image downloaded! Drag "${filename}" from Downloads into this chat.`;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 6000);

  } catch (e) {
    console.error("Image processing failed:", e);
    alert("Failed: " + e.message);
  }
}


// ==========================================
// LEGACY FUNCTIONS
// ==========================================
async function openGoogleDrivePicker() {
  const clickByLabel = (label) => {
    const el = document.querySelector(`[aria-label*="${label}"]`);
    if (el) { el.click(); return true; }
    return false;
  };

  if (clickByLabel("Upload") || clickByLabel("Add")) {
    await new Promise(r => setTimeout(r, 800));
    const items = document.querySelectorAll('div, span, li, button');
    for (let el of items) {
      if (el.textContent.includes("My Stuff") && el.offsetParent) {
        el.click(); break;
      }
    }
  }
}

function pasteText(text, sendResponse) {
  const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
  if (editor) {
    editor.focus();
    if (!document.execCommand('insertText', false, text)) {
      editor.textContent = text;
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (typeof sendResponse === 'function') sendResponse({ status: "success" });
  } else {
    if (typeof sendResponse === 'function') sendResponse({ status: "error" });
  }
}


// ==========================================
// PASTE TEXT AND IMAGES TOGETHER
// ==========================================
async function pasteTextAndImages(text, images, sendResponse) {
  try {
    const editor = document.querySelector('div[contenteditable="true"][role="textbox"]');
    if (!editor) {
      sendResponse({ status: "error", message: "Editor not found" });
      return;
    }

    // Step 1: Paste the text
    if (text && text.length > 0) {
      editor.focus();
      if (!document.execCommand('insertText', false, text)) {
        editor.textContent = text;
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      }
      console.log("Text pasted");
    }

    // Step 2: Paste images using DataTransfer simulation
    if (images && images.length > 0) {
      for (let i = 0; i < images.length; i++) {
        const dataUrl = images[i];
        console.log(`Pasting image ${i + 1}/${images.length}...`);

        try {
          // Convert data URL to blob
          const response = await fetch(dataUrl);
          const blob = await response.blob();

          // Create a File object
          const file = new File([blob], `image_${i + 1}.png`, { type: blob.type });

          // Create DataTransfer with the file
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);

          // Create and dispatch paste event
          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dataTransfer
          });

          editor.focus();
          editor.dispatchEvent(pasteEvent);

          console.log(`Image ${i + 1} pasted via DataTransfer`);

          // Wait for Gemini to process
          await new Promise(r => setTimeout(r, 1000));
        } catch (imgErr) {
          console.error(`Failed to paste image ${i + 1}:`, imgErr);
        }
      }
    }

    sendResponse({ status: "success" });
  } catch (e) {
    console.error("pasteTextAndImages failed:", e);
    sendResponse({ status: "error", message: e.message });
  }
}

