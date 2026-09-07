# 🎬 Universal Media Downloader Web Application

A modern, fast, full-stack web application to download videos from **YouTube, Instagram, Facebook, TikTok, Twitter/X, and any web page** in up to **4K/8K resolution with customizable subtitles, multi-language captions, audio extraction (MP3/M4A), real-time progress tracking, dual save modes, and automatic live request logging**.

---

## ✨ Key Features

- **🌐 Multi-Platform Video Support**:
  - **YouTube** (Videos, Shorts, Playlists, Streams)
  - **Instagram** (Reels, Posts, Stories)
  - **Facebook** (Reels, Watch, Videos)
  - **TikTok** (Videos, Slides)
  - **Twitter / X** (Video Posts)
  - **Reddit, Vimeo, Twitch, and generic Webpages with embedded video**
- **🎯 1-Click Quick Download**: Paste link $\rightarrow$ instantly downloads the highest available resolution merged with audio and subtitles.
- **📺 Highest Resolutions & Formats**: Supports 8K (4320p), 4K (2160p), 2K (1440p), Full HD (1080p60), 720p, etc. Automatic merging of DASH video + best audio stream via FFmpeg.
- **💬 Full Subtitles & Closed Captions Support**:
  - Auto-detects creator subtitles & auto-generated captions in any language.
  - **Embedded Soft Subtitles** (switchable in media players like VLC).
  - **Burned-In Hard Subtitles** (rendered directly into video frames).
  - **Separate Subtitle Files** (downloads `.srt` / `.vtt`).
  - Automatic fallback if subtitle timedtext APIs are rate-limited.
- **🎵 High-Quality Audio Extractor**: Convert videos to 320kbps MP3, M4A, or lossless WAV with embedded metadata and thumbnail album art.
- **💾 Dual Save Modes**:
  - **Browser Download (Cloud & Local)**: Sends file directly to your client browser, adhering to browser download settings.
  - **Local Folder Save (Local Machine)**: Directly writes to any folder on your machine (e.g., `~/Downloads`, `~/Videos`, or custom path) with instant path validation.
- **⚡ Real-Time Progress Tracker**: Live progress percentage, download speed (MB/s), ETA countdown, and stage status via Server-Sent Events (SSE).
- **📋 Automatic Live Request Logging (`server.log`)**:
  - Automatically records all incoming requests (with JSON request bodies), outgoing responses, status codes, and execution times.
  - Auto-cleans and refreshes every time the server starts.
- **🐳 Docker & Cloud Ready**: Includes `Dockerfile` and `docker-compose.yml` for 1-click cloud VPS deployment.

---

## 🚀 Quick Start (Running Locally)

### 1. Requirements
- Python 3.10+
- (Optional) System `ffmpeg` (the app automatically downloads and uses bundled `static-ffmpeg` if system ffmpeg is not found).

### 2. Setup and Run
```bash
cd /home/user/code/sideProjects/download

# Start the server (auto-initializes environment & server.log)
./venv/bin/python3 run.py
```

Open your browser and navigate to:
👉 **`http://localhost:8000`**

---

## 📋 Live Server Logs (`server.log`)

Every time `run.py` starts, `server.log` is automatically wiped fresh and logs all activity in real-time:
```
👉 [REQUEST] POST /api/info (from 127.0.0.1) | Body: {"url": "https://..."}
👈 [RESPONSE] POST /api/info | Status: 200 | Duration: 120.4ms
👉 [REQUEST] POST /api/download (from 127.0.0.1) | Body: {"quality": "2160p", ...}
👈 [RESPONSE] POST /api/download | Status: 200 | Duration: 2.1ms
```
You can inspect it anytime in your text editor or via terminal:
```bash
tail -f server.log
```

---

## 🐳 Running with Docker (For Cloud / VPS Hosting)

```bash
docker compose up -d --build
```
Your service will be available on `http://<your-server-ip>:8000`.

---

## 📄 License
MIT License. Free for personal and open-source use.
