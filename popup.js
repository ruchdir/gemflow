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

            if (tab.getAttribute('data-tab') === 'tab-library') {
                renderLibrary();
            }
        });
    });

    const pasteBtn = document.getElementById('pasteBtn');
    const clearBtn = document.getElementById('clearBtn');
    const myStuffBtn = document.getElementById('myStuffBtn');
    const clearImagesBtn = document.getElementById('clearImagesBtn');
    const imagePreviewGrid = document.getElementById('imagePreviewGrid');
    const imageCountSpan = document.getElementById('imageCount');

    const favBtn = document.getElementById('favBtn');
    const favList = document.getElementById('favList');
    const historyList = document.getElementById('historyList');

    // Aspect Ratio Logic
    const ratioBtns = document.querySelectorAll('.ratio-btn');
    let selectedRatio = '9:16';

    ratioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            ratioBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedRatio = btn.getAttribute('data-ratio');
        });
    });

    // Shots / Variations Logic
    const addShotBtn = document.getElementById('addShotBtn');
    const shotsContainer = document.getElementById('shotsContainer');
    const batchModeToggle = document.getElementById('batchModeToggle');

    let shotCount = 1;

    addShotBtn.addEventListener('click', () => {
        shotCount++;
        let defaultValue = `Shot ${shotCount}: `;
        if (shotCount === 2) defaultValue = "Shot 2: Side View showing the product clearly";
        if (shotCount === 3) defaultValue = "Shot 3: Bottom View showing the product clearly";

        const wrapper = document.createElement('div');
        wrapper.className = 'shot-input-wrapper';
        wrapper.innerHTML = `
            <input type="text" class="shot-input" placeholder="Shot ${shotCount}: e.g. Side view" value="${defaultValue}">
            <button type="button" class="mini-icon-btn remove-shot-btn" title="Remove shot">−</button>
        `;
        shotsContainer.appendChild(wrapper);

        wrapper.querySelector('.remove-shot-btn').onclick = () => {
            wrapper.remove();
        };
    });

    // Load stored images on panel open
    loadStoredImages();
    renderLibrary();

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

    // Paste button - now supports Batch Sequence
    pasteBtn.addEventListener('click', async () => {
        const activeTab = document.querySelector('.tab-content.active').id;

        // 1. Collect everything to paste
        let commonText = ""; // Background, Ratio, etc.
        let shots = []; // Individual variations
        let images = [];

        if (activeTab === 'tab-image') {
            const coreInstruction = document.getElementById('prompt1').value.trim();
            const background = document.getElementById('bgSelect').value.trim();
            const additionalDetails = document.getElementById('prompt3').value.trim();

            commonText = coreInstruction;
            if (background) commonText += `\nBackground: ${background}`;
            if (selectedRatio) commonText += `\nAspect Ratio: ${selectedRatio}`;
            if (additionalDetails) commonText += `\nAdditional Details: ${additionalDetails}`;

            // Get all shots
            const shotInputs = document.querySelectorAll('.shot-input');
            shotInputs.forEach(input => {
                if (input.value.trim()) shots.push(input.value.trim());
            });
            if (shots.length === 0) shots.push(""); // Fallback if no shots defined
        } else if (activeTab === 'tab-video') {
            const videoInstruction = document.getElementById('videoPrompt').value.trim();
            const videoStyle = document.getElementById('videoStyle').value.trim();

            commonText = videoInstruction;
            if (videoStyle) commonText += `\nStyle/Atmosphere: ${videoStyle}`;
            shots = [""]; // No shots for video yet
        }

        // Get stored images
        const storageResult = await chrome.storage.local.get(['selectedImages']);
        images = storageResult.selectedImages || [];

        if (commonText.length === 0 && images.length === 0) {
            pasteBtn.textContent = "Add text or images!";
            setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2000);
            return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.includes("gemini.google.com")) {
            pasteBtn.textContent = "Open Gemini Tab!";
            setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2000);
            return;
        }

        const isBatch = batchModeToggle?.checked && shots.length > 1;

        try {
            if (isBatch) {
                runBatchGeneration(tab.id, commonText, shots, images);
            } else {
                // Normal Single Paste
                pasteBtn.innerHTML = '<span class="icon">⏳</span> Pasting...';
                const finalPrompt = shots[0] ? `${commonText}\n${shots[0]}` : commonText;

                const response = await chrome.tabs.sendMessage(tab.id, {
                    action: "paste_with_images",
                    text: finalPrompt,
                    images: images,
                    auto_submit: batchModeToggle?.checked // Single auto-submit if toggle is on
                });

                if (response && response.status === "success") {
                    pasteBtn.innerHTML = '<span class="icon">✅</span> Pasted!';
                    saveToHistory(finalPrompt);
                } else {
                    pasteBtn.textContent = "Failed";
                }
                setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2500);
            }
        } catch (err) {
            console.error(err);
            pasteBtn.textContent = "Error";
            setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2000);
        }
    });

    async function runBatchGeneration(tabId, commonText, shots, images) {
        pasteBtn.disabled = true;

        for (let i = 0; i < shots.length; i++) {
            let finalPrompt = "";
            if (i === 0) {
                finalPrompt = shots[i] ? `${commonText}\n${shots[i]}` : commonText;
            } else {
                finalPrompt = shots[i];
                if (!finalPrompt.trim()) continue; // Skip empty shots after the first one
            }

            pasteBtn.innerHTML = `<span class="icon">⏳</span> Shot ${i + 1}/${shots.length}...`;

            // 1. Paste and Auto-Submit
            await chrome.tabs.sendMessage(tabId, {
                action: "paste_with_images",
                text: finalPrompt,
                images: i === 0 ? images : [], // Only send images with the first shot to avoid re-uploading? 
                // Actually, if we want consistency, maybe Gemini needs the images every time? 
                // User said "อ้างอิงตามรูปแรก" - typically in Gemini you keep the conversation.
                // If we keep conversation, we don't need to re-upload images.
                images: i === 0 ? images : [],
                auto_submit: true
            });

            saveToHistory(finalPrompt);

            // 2. Wait for generation to finish
            if (i < shots.length - 1) {
                pasteBtn.innerHTML = `<span class="icon">⏳</span> Waiting for Gemini...`;
                const status = await chrome.tabs.sendMessage(tabId, { action: "monitor_generation" });
                console.log(`Shot ${i + 1} finished with status:`, status);

                // Extra pause for safety
                await new Promise(r => setTimeout(r, 3000));
            }
        }

        pasteBtn.disabled = false;
        pasteBtn.innerHTML = '<span class="icon">✅</span> Batch Done!';
        setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 3000);
    }

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

    // Library Logic
    favBtn.addEventListener('click', () => {
        const activeTabEl = document.querySelector('.tab-content.active');
        if (!activeTabEl) return;

        const activeTab = activeTabEl.id;
        let data = {};
        if (activeTab === 'tab-image') {
            data = {
                type: 'image',
                core: document.getElementById('prompt1').value,
                bg: document.getElementById('bgSelect').value,
                ratio: selectedRatio,
                details: document.getElementById('prompt3').value
            };
        } else if (activeTab === 'tab-video') {
            data = {
                type: 'video',
                prompt: document.getElementById('videoPrompt').value,
                style: document.getElementById('videoStyle').value
            };
        } else {
            return; // Can't favorite from Library tab
        }

        const name = prompt("Enter a name for this favorite:", "My Awesome Prompt");
        if (name) {
            chrome.storage.local.get(['favorites'], (result) => {
                const favorites = result.favorites || [];
                favorites.unshift({ name, data, timestamp: Date.now() });
                chrome.storage.local.set({ favorites }, () => {
                    favBtn.classList.add('active');
                    setTimeout(() => favBtn.classList.remove('active'), 1000);
                    renderLibrary();
                });
            });
        }
    });

    function saveToHistory(text) {
        chrome.storage.local.get(['history'], (result) => {
            let history = result.history || [];
            // Remove dups if identical
            history = history.filter(item => item.text !== text);
            history.unshift({ text, timestamp: Date.now() });
            if (history.length > 20) history.pop();
            chrome.storage.local.set({ history });
        });
    }

    function renderLibrary() {
        chrome.storage.local.get(['favorites', 'history'], (result) => {
            const favorites = result.favorites || [];
            const history = result.history || [];

            // Render Favorites
            if (favorites.length === 0) {
                favList.innerHTML = '<div class="empty-msg">No favorites yet.</div>';
            } else {
                favList.innerHTML = '';
                favorites.forEach((fav, index) => {
                    const item = createLibraryItem(fav.name, fav.data, fav.timestamp, index, 'fav');
                    favList.appendChild(item);
                });
            }

            // Render History
            if (history.length === 0) {
                historyList.innerHTML = '<div class="empty-msg">No history yet.</div>';
            } else {
                historyList.innerHTML = '';
                history.forEach((hist, index) => {
                    const item = createLibraryItem(null, { text: hist.text }, hist.timestamp, index, 'history');
                    historyList.appendChild(item);
                });
            }
        });
    }

    function createLibraryItem(name, data, timestamp, index, type) {
        const item = document.createElement('div');
        item.className = 'library-item';

        const date = new Date(timestamp);
        const dateStr = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        const previewText = type === 'fav'
            ? (data.type === 'image' ? data.core : data.prompt)
            : data.text;

        item.innerHTML = `
            <div class="lib-item-header">
                <span class="lib-item-name">${name || 'Recent Prompt'}</span>
                <span class="lib-item-date">${dateStr}</span>
            </div>
            <div class="lib-item-text">${previewText}</div>
            <div class="lib-item-actions">
                <button class="lib-action-btn load-btn">Load</button>
                <button class="lib-action-btn delete-btn delete">Delete</button>
            </div>
        `;

        item.querySelector('.load-btn').onclick = () => loadLibraryItem(data, type);
        item.querySelector('.delete-btn').onclick = () => deleteLibraryItem(index, type);

        return item;
    }

    function loadLibraryItem(data, type) {
        if (type === 'fav') {
            if (data.type === 'image') {
                document.querySelector('[data-tab="tab-image"]').click();
                document.getElementById('prompt1').value = data.core;
                document.getElementById('bgSelect').value = data.bg;
                document.getElementById('prompt3').value = data.details;
                selectedRatio = data.ratio;
                document.querySelectorAll('.ratio-btn').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-ratio') === selectedRatio);
                });
            } else if (data.type === 'video') {
                document.querySelector('[data-tab="tab-video"]').click();
                document.getElementById('videoPrompt').value = data.prompt;
                document.getElementById('videoStyle').value = data.style;
            }
        } else {
            // History item
            const activeTab = document.querySelector('.tab-content.active').id;
            if (activeTab === 'tab-video') {
                document.getElementById('videoPrompt').value = data.text;
            } else {
                document.querySelector('[data-tab="tab-image"]').click();
                document.getElementById('prompt1').value = data.text;
            }
        }
        // Temporary feedback
        pasteBtn.innerHTML = '<span class="icon">✨</span> Form Loaded!';
        setTimeout(() => pasteBtn.innerHTML = '<span class="icon">✨</span> Paste to Ask Gemini', 2000);
    }

    function deleteLibraryItem(index, type) {
        const key = type === 'fav' ? 'favorites' : 'history';
        chrome.storage.local.get([key], (result) => {
            const list = result[key] || [];
            list.splice(index, 1);
            chrome.storage.local.set({ [key]: list }, () => {
                renderLibrary();
            });
        });
    }

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
            } catch (e) { console.error(e); }
        });
    }
});
