#!/usr/bin/env python3
"""
Universal Media Downloader Launcher Script
Runs the FastAPI server locally on http://localhost:8000 and logs requests to server.log
"""

import os
import sys
from pathlib import Path

# Add project root to sys.path
BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

LOG_FILE = BASE_DIR / "server.log"

def main():
    print("=" * 60)
    print("🚀 Starting Universal Media Downloader Server...")
    print("=" * 60)

    # Initialize static ffmpeg
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
        print("✓ FFmpeg audio/video processing engine initialized.")
    except Exception as e:
        print(f"⚠️ FFmpeg note: {e}")

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    url = f"http://localhost:{port}"

    print(f"\n🌐 Web App URL: {url}")
    print(f"📁 Downloads Directory: {BASE_DIR / 'downloads'}")
    print(f"📋 Live Server Logs File: {LOG_FILE} (auto-cleaned on start)")
    print("💡 Press Ctrl+C to stop the server.\n")

    reload = os.getenv("RELOAD", "false").lower() in ("true", "1", "yes") or "--reload" in sys.argv

    # Start Uvicorn Server
    import uvicorn
    uvicorn.run("app.main:app", host=host, port=port, reload=reload, reload_dirs=[str(BASE_DIR)] if reload else None)

if __name__ == "__main__":
    main()
