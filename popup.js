document.addEventListener('DOMContentLoaded', () => {
    // TABS LOGIC
    const tabs = document.querySelectorAll('.tab-btn');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-tab')).classList.add('active');
        });
    });

    const pasteBtn = document.getElementById('pasteBtn');
    const clearBtn = document.getElementById('clearBtn');
    const myStuffBtn = document.getElementById('myStuffBtn');
    const clearImagesBtn = document.getElementById('clearImagesBtn');
    const imagePreviewGrid = document.getElementById('imagePreviewGrid');
    const imageCountSpan = document.getElementById('imageCount');

    // Load stored images on panel open
    loadStoredImages();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local' && changes.selectedImages) {
            loadStoredImages();
        }
    });

    function loadStoredImages() {
        chrome.storage.local.get(['selectedImages'], (result) => {
            const images = result.selectedImages || [];
            displayImages(images);
        });
    }

    function displayImages(images) {
        imageCountSpan.textContent = images.length;

        if (images.length === 0) {
            imagePreviewGrid.innerHTML = '<div class="no-images">No images selected. Click "Open My Stuff Picker" to add images.</div>';
            clearImagesBtn.style.display = 'none';
        } else {
            imagePreviewGrid.innerHTML = '';
            images.forEach((dataUrl, index) => {
                const img = document.createElement('img');
                img.src = dataUrl;
                img.title = `Image ${index + 1} - Click to remove`;
                img.onclick = () => removeImage(index);
                imagePreviewGrid.appendChild(img);
            });
            clearImagesBtn.style.display = 'block';
        }
    }

    function removeImage(index) {
        chrome.storage.local.get(['selectedImages'], (result) => {
            const images = result.selectedImages || [];
            images.splice(index, 1);
            chrome.storage.local.set({ selectedImages: images });
        });
    }

    // Clear all images
    if (clearImagesBtn) {
        clearImagesBtn.addEventListener('click', () => {
            chrome.storage.local.set({ selectedImages: [] });
        });
    }

    // Paste button - now sends text AND images
    pasteBtn.addEventListener('click', async () => {
        let combinedText = "";
        const activeTab = document.querySelector('.tab-content.active').id;

        if (activeTab === 'tab-image') {
            const coreInstruction = document.getElementById('prompt1').value.trim();
            const background = document.getElementById('bgSelect').value.trim();
            const additionalDetails = document.getElementById('prompt3').value.trim();

            combinedText = coreInstruction;
            if (background) combinedText += `\nBackground: ${background}`;
            if (additionalDetails) combinedText += `\nAdditional Details: ${additionalDetails}`;
        } else if (activeTab === 'tab-video') {
            const videoInstruction = document.getElementById('videoPrompt').value.trim();
            const videoStyle = document.getElementById('videoStyle').value.trim();

            combinedText = videoInstruction;
            if (videoStyle) combinedText += `\nStyle/Atmosphere: ${videoStyle}`;
        }

        // Get stored images
        const result = await chrome.storage.local.get(['selectedImages']);
        const images = result.selectedImages || [];

        if (combinedText.length === 0 && images.length === 0) {
            pasteBtn.textContent = "Add text or images!";
            setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2000);
            return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        if (!tab.url.includes("gemini.google.com")) {
            pasteBtn.textContent = "Not on Gemini!";
            setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2000);
            return;
        }

        try {
            pasteBtn.innerHTML = '<span class="icon">⏳</span> Pasting...';

            const response = await chrome.tabs.sendMessage(tab.id, {
                action: "paste_with_images",
                text: combinedText,
                images: images
            });

            if (response && response.status === "success") {
                pasteBtn.innerHTML = '<span class="icon">✅</span> Pasted!';
                // Clear images after successful paste (optional)
                // chrome.storage.local.set({ selectedImages: [] });
            } else {
                pasteBtn.textContent = "Failed";
            }
            setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2500);
        } catch (err) {
            console.error(err);
            pasteBtn.textContent = "Error";
            setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2000);
        }
    });

    // Clear button - clears Gemini chat AND stored images
    clearBtn.addEventListener('click', async () => {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && tab.url.includes("gemini.google.com")) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: "clear_prompt" });
            } catch (e) { console.error(e); }
        }
        // Also clear stored images
        chrome.storage.local.set({ selectedImages: [] });
    });

    // My Stuff Picker button
    if (myStuffBtn) {
        myStuffBtn.addEventListener('click', async () => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab || !tab.url.includes("gemini.google.com")) {
                alert("Please open gemini.google.com first!");
                return;
            }
            try {
                await chrome.tabs.sendMessage(tab.id, { action: "open_mystuff_picker" });
                // Don't close - Side Panel stays open
            } catch (e) { console.error(e); }
        });
    }
});
