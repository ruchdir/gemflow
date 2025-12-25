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
    pasteTextAndImages(request.text, request.images, request.auto_submit, request.tool_type, sendResponse);
    return true; // Async response
  }

  // NEW: Monitor for generation completion
  if (request.action === "monitor_generation") {
    startGenerationMonitor(sendResponse);
    return true;
  }

  if (request.action === "reset_page_visibility") {
    const gemflowUI = document.querySelectorAll('.gemflow-ui');
    gemflowUI.forEach(el => el.style.visibility = 'visible');
    const bodyChildren = document.body.children;
    for (let i = 0; i < bodyChildren.length; i++) {
      bodyChildren[i].style.visibility = 'visible';
    }
    const overlay = document.getElementById('capture-overlay');
    if (overlay) overlay.style.display = 'none';
    sendResponse({ status: "reset" });
    return true;
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
      sendContainer.classList.add('gemflow-ui');
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
      btnContainer.classList.add('gemflow-ui');
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
  console.log("Overlay: Preparing capture for", url);

  // 1. HIDE ALL Extension UI and Page Content
  const gemflowUI = document.querySelectorAll('.gemflow-ui');
  gemflowUI.forEach(el => el.style.visibility = 'hidden');

  // Hide all direct children of body except overlay
  const bodyChildren = document.body.children;
  for (let i = 0; i < bodyChildren.length; i++) {
    const child = bodyChildren[i];
    if (child.id !== 'capture-overlay' && child.tagName !== 'SCRIPT') {
      child.style.visibility = 'hidden';
    }
  }

  let overlay = document.getElementById('capture-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'capture-overlay';
    document.body.appendChild(overlay);
  }

  // Overlay state: Black background while loading
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    background: #000; z-index: 2147483647; 
    display: flex; justify-content: center; align-items: center;
    visibility: visible;
  `;
  overlay.innerHTML = '<div style="color:#888;font-size:24px;">Loading Capture...</div>';

  const img = new Image();

  // Set onload BEFORE src to catch cached or fast-loading images
  img.onload = () => {
    console.log(`Overlay: Image loaded ${img.naturalWidth}x${img.naturalHeight}`);

    // Fit overlay to image
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; 
      width: ${img.naturalWidth}px; height: ${img.naturalHeight}px;
      background: transparent; z-index: 2147483647; 
      overflow: hidden; visibility: visible;
    `;
    overlay.innerHTML = '';

    img.style.cssText = `width: 100%; height: 100%; display: block;`;
    overlay.appendChild(img);

    // Give a small moment for rendering then signal background
    setTimeout(() => {
      chrome.runtime.sendMessage({
        action: "resize_and_capture",
        width: img.naturalWidth,
        height: img.naturalHeight
      });
    }, 400);
  };

  img.onerror = () => {
    console.error("Overlay: Failed to load image:", url);
    // Cleanup and tell background to skip
    if (overlay) overlay.style.display = 'none';
    const bodyChildren = document.body.children;
    for (let i = 0; i < bodyChildren.length; i++) {
      bodyChildren[i].style.visibility = 'visible';
    }
    chrome.runtime.sendMessage({ action: "ready_for_capture" }); // Forces move to next
  };

  img.src = url;
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
// TOOL SELECTION AUTOMATION
// ==========================================
async function selectGeminiTool(toolName) {
  try {
    // 1. Check if ANY tool is already selected
    const deselectBtn = document.querySelector('button.toolbox-drawer-item-deselect-button');
    if (deselectBtn) {
      const currentToolText = deselectBtn.innerText || "";
      if (currentToolText.toLowerCase().includes(toolName.toLowerCase().split(' ')[1])) {
        console.log(`Tool "${toolName}" is already active.`);
        return;
      }
    }

    // 2. Open Tools Menu
    const toolsBtn = document.querySelector('button.toolbox-drawer-button, button[aria-label="Tools"]');
    if (!toolsBtn) {
      console.warn("Tools button not found");
      return;
    }

    toolsBtn.click();
    await new Promise(r => setTimeout(r, 600)); // Wait for menu

    // 3. Find and click the specific tool
    const menuItems = document.querySelectorAll('button.toolbox-drawer-item-list-button');
    let targetBtn = null;
    for (const btn of menuItems) {
      if (btn.innerText.toLowerCase().includes(toolName.toLowerCase())) {
        targetBtn = btn;
        break;
      }
    }

    if (targetBtn) {
      console.log(`Clicking tool: ${toolName}`);
      targetBtn.click();
      await new Promise(r => setTimeout(r, 600));
    } else {
      console.warn(`Target tool "${toolName}" not found in menu`);
      // Close menu if it's still open
      toolsBtn.click();
    }
  } catch (err) {
    console.error("selectGeminiTool failed:", err);
  }
}


// ==========================================
// PASTE TEXT AND IMAGES TOGETHER
// ==========================================
async function pasteTextAndImages(text, images, autoSubmit, toolType, sendResponse) {
  try {
    // Stage 0: Select the Tool first
    if (toolType) {
      console.log(`Ensuring tool is selected: ${toolType}`);
      const toolName = toolType === 'video' ? 'Create videos' : 'Create images';
      await selectGeminiTool(toolName);
      // Small pause after tool selection to let UI settle
      await new Promise(r => setTimeout(r, 800));
    }

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
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          const file = new File([blob], `image_${i + 1}.png`, { type: blob.type });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);

          const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true, cancelable: true, clipboardData: dataTransfer
          });

          editor.focus();
          editor.dispatchEvent(pasteEvent);
          console.log(`Image ${i + 1} pasted`);

          await new Promise(r => setTimeout(r, 1000));
        } catch (imgErr) {
          console.error(`Failed image ${i + 1}:`, imgErr);
        }
      }
    }

    // Step 3: Auto-Submit if requested
    if (autoSubmit) {
      console.log("Auto-submitting - waiting for button to be enabled...");
      // Wait up to 10 seconds for the send button to become enabled (images might be uploading)
      let submitAttempts = 0;
      const submitInterval = setInterval(() => {
        const sendBtn = document.querySelector('button[aria-label*="Send"], [data-test-id="send-button"]');
        if (sendBtn && !sendBtn.disabled) {
          console.log("Send button enabled, clicking!");
          sendBtn.click();
          clearInterval(submitInterval);
        }
        submitAttempts++;
        if (submitAttempts > 100) {
          console.warn("Auto-submit timed out waiting for enabled button");
          clearInterval(submitInterval);
        }
      }, 100);
    }

    sendResponse({ status: "success" });
  } catch (e) {
    console.error("pasteTextAndImages failed:", e);
    sendResponse({ status: "error", message: e.message });
  }
}

// ==========================================
// GENERATION MONITOR
// ==========================================
let generationObserver = null;

function startGenerationMonitor(sendResponse) {
  if (generationObserver) generationObserver.disconnect();
  console.log("Generation monitor started...");

  let generationStarted = false;
  let pollCount = 0;
  let idleCounter = 0;

  const checkState = () => {
    // Gemini is generating if:
    // 1. There is a Stop/Interrupt button
    // 2. The Send button is disabled
    const sendBtn = document.querySelector('button[aria-label*="Send"], [data-test-id="send-button"]');
    const stopBtn = document.querySelector('button[aria-label*="Stop"], [aria-label*="Interrupt"], [aria-label*="Interrupt generation"]');

    const isGenerating = stopBtn || (sendBtn && sendBtn.disabled);

    if (isGenerating) {
      if (!generationStarted) {
        console.log("Monitor: Generation START detected.");
        generationStarted = true;
      }
      idleCounter = 0; // Reset counter whenever we see activity
    } else {
      // Not generating. 
      if (generationStarted) {
        // We saw it start, now it appears stopped.
        // We need it to stay stopped for 15 consecutive checks (1.5s)
        idleCounter++;
        if (idleCounter >= 15) {
          console.log("Monitor: Generation FINISH detected (sustained idle)!");
          clearInterval(timer);
          if (generationObserver) generationObserver.disconnect();
          generationObserver = null;
          sendResponse({ status: "finished" });
          return true;
        } else {
          if (idleCounter % 5 === 0) console.log(`Monitor: Idle for ${idleCounter / 10}s...`);
        }
      } else {
        // Haven't seen it start yet. Gemini might be slow.
        pollCount++;
        // Wait up to 10 seconds for it to start
        if (pollCount > 100) {
          console.log("Monitor: Never saw generation start. Safety timeout.");
          clearInterval(timer);
          if (generationObserver) generationObserver.disconnect();
          generationObserver = null;
          sendResponse({ status: "timeout_start" });
          return true;
        }
      }
    }
    return false;
  };

  // Poll every 100ms
  const timer = setInterval(() => {
    checkState();
  }, 100);

  // Backup global timeout (5 minutes for slow image gens)
  setTimeout(() => {
    if (timer) clearInterval(timer);
    if (generationObserver) {
      generationObserver.disconnect();
      generationObserver = null;
      sendResponse({ status: "timeout_global" });
    }
  }, 300000);
}
