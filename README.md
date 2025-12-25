# GemFlow - Chrome Extension

Streamline your Gemini workflow for AI image and video generation. A Chrome extension with a side panel interface for prompt management and image selection.

## Features

### 🖼️ Image Generation Tab
- **Pre-built prompt template** for product photography
- **Background scene selector** with common options (Studio, Sea View, Kitchen, etc.)
- **Additional details field** for customization
- **One-click paste** to Gemini chat

### 🎬 Video Generation Tab
- **Video prompt template** for vertical 9:16 video creation
- **Style/Atmosphere field** for customization
- **My Stuff Image Picker** - Select images from your Gemini gallery
- **Batch image capture** - Select multiple images and add them all to your prompt

## How It Works

### Image Generation Workflow
1. Click the extension icon to open the **Side Panel**
2. Stay on the **Image Gen** tab
3. Customize your prompt using the fields
4. Click **"Paste to Ask Gemini"**
5. Add your product image manually and submit

### Video Generation Workflow
1. Open the Side Panel
2. Switch to **Video Gen** tab
3. Click **"Open My Stuff Picker"** - a popup window opens
4. Click **"✓ Select"** on images you want to include
5. Click **"Send X Images"** button
6. Watch as images are captured and stored in the Side Panel
7. Add any prompt customizations
8. Click **"Paste to Ask Gemini"** - text and images are pasted together!

## Installation

1. Download or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (top right toggle)
4. Click **"Load unpacked"**
5. Select the extension folder
6. Pin the extension icon for easy access

## Files Structure

```
generate-prompt-extension/
├── manifest.json      # Extension configuration
├── background.js      # Service worker (Side Panel, capture logic)
├── content.js         # Gemini page integration
├── popup.html         # Side Panel UI
├── popup.js           # Side Panel logic
├── styles.css         # Styling
└── README.md          # This file
```

## Technical Details

### Permissions Used
- `activeTab` - Access current tab
- `scripting` - Inject content scripts
- `sidePanel` - Side Panel API
- `tabs` - Tab management
- `clipboardWrite` - Clipboard access
- `storage` - Store selected images
- `<all_urls>` - Screen capture

### Key Technologies
- **Chrome Side Panel API** - Persistent side panel interface
- **Screen Capture** - `captureVisibleTab` for image capture
- **DataTransfer API** - Paste images without clipboard focus issues
- **Chrome Storage** - Persist selected images between captures

### Capture Strategy
Due to CORS/CSP restrictions on Gemini, images cannot be fetched directly. Instead:
1. Images are displayed in a full-screen overlay
2. Window resizes to match image dimensions
3. Screenshot is taken of the visible tab
4. Image stored in `chrome.storage.local`
5. Pasted to Gemini chat using DataTransfer events

## Usage Tips

- **Clear button** clears both the Gemini chat field AND stored images
- **Click thumbnails** in the Side Panel to remove individual images
- Images are **captured at original dimensions** (capped at 1920×1080)
- Allow time between captures for reliable results

## Troubleshooting

### Side Panel doesn't open
- Make sure you're on `gemini.google.com`
- Try reloading the extension

### Images not pasting
- Ensure the Gemini chat field is visible
- Try clicking in the chat field first

### Capture shows black/incomplete
- Wait for the full capture sequence to complete
- Check console for errors

## License

This project is for personal use with Google Gemini.

---

**Made for streamlined Gemini workflows** 🚀
