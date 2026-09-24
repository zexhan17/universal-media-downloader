# Universal Media Downloader — Local Browser Extension

This Chrome/Chromium browser extension allows you to detect and download video and audio streams (`.m3u8`, `.mpd`, `.mp4`, YouTube, etc.) directly from any webpage using your local Universal Media Downloader server.

---

### How to Install in Your Browser (No Web Store Required)

1. Open **Google Chrome**, **Brave**, **Microsoft Edge**, or any Chromium browser.
2. In the URL address bar, navigate to:
   ```text
   chrome://extensions
   ```
   *(For Brave: `brave://extensions` | For Edge: `edge://extensions`)*
3. In the top right corner of the Extensions page, switch the **Developer mode** toggle to **ON**.
4. Click the **Load unpacked** button in the top left.
5. In the file picker dialog, select this folder:
   ```text
   /home/user/code/sideProjects/download/extension
   ```
6. **Done!** The extension icon will appear in your browser's toolbar. Click the puzzle icon 🧩 in Chrome and pin **Universal Media Downloader** to your toolbar for easy 1-click access.

---

### Features

- **Media Inspector & Bridge**:
  - **🚀 Open in Web App**: 1-click button to open `http://localhost:8000` with the stream, referer, and page title pre-populated, ready for download in full screen.
  - **📋 Copy JSON**: Copies structured media metadata (stream URL, referer, user-agent, headers) to your clipboard for inspection or pasting into the Web App.
  - **Copy All Streams**: When multiple playlist variants are detected, copy all of them in a single click.
- **Automatic Stream Sniffing**: Automatically intercepts background HLS (`.m3u8`), DASH (`.mpd`), and direct MP4/WebM video requests as you browse.
- **Hls.js / Player Cache Detection**: Scans performance resource timings to detect streams played in JavaScript players even when hidden behind `blob:` URLs.
- **Smart Referer Protection**: Automatically captures and forwards the exact player/page `Referer` and `Origin` headers to bypass CDN hotlink protections and 403 Forbidden errors.
- **HTML Snippet & JSON Paste Support**: The full Web App and extension accept raw URLs, HTML tags (`<video ...><source src="..."></video>`), or structured JSON objects.
- **SSL Verification Bypass**: Backend handles CDN self-signed / missing root certificates seamlessly.
- **Live Task Tracking**: Shows live progress, download speed, and ETA right inside the extension popup and the full Web App.

---

### How to Reload After Changes
If you make changes to background scripts or manifest:
1. Go to `chrome://extensions`
2. Click the **🔄 (Reload)** icon on the **Universal Media Downloader** card.
3. Refresh (`F5`) the video page.
*(Popup UI changes apply automatically whenever you close and re-open the popup!)*
