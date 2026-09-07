import json
import logging
import os
import sys
import time
import traceback
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import router as api_router

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"
DOWNLOADS_DIR = BASE_DIR / "downloads"
LOG_FILE = BASE_DIR / "server.log"

STATIC_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)


# --- Custom Tee Logger to mirror stdout/stderr to server.log ---
class TeeStream:
    def __init__(self, original_stream, log_filepath):
        self.original_stream = original_stream
        self.log_filepath = log_filepath

    def write(self, message):
        self.original_stream.write(message)
        self.original_stream.flush()
        if message and message.strip():
            try:
                with open(self.log_filepath, "a", encoding="utf-8") as f:
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    # Avoid double timestamps if already formatted
                    if not message.startswith("["):
                        f.write(f"[{timestamp}] [STDOUT] {message.strip()}\n")
                    else:
                        f.write(f"{message.strip()}\n")
            except Exception:
                pass

    def flush(self):
        self.original_stream.flush()


def init_logging():
    """Initialize clean log file on every server start and configure loggers."""
    try:
        with open(LOG_FILE, "w", encoding="utf-8") as f:
            f.write(f"============================================================\n")
            f.write(f"🚀 Universal Media Downloader Server Log\n")
            f.write(f"Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write(f"============================================================\n\n")
    except Exception as e:
        print(f"Log file init error: {e}")

    # File Handler
    file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    root_logger = logging.getLogger()
    root_logger.setLevel(logging.INFO)
    root_logger.addHandler(file_handler)

    for logger_name in ["uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"]:
        l = logging.getLogger(logger_name)
        l.addHandler(file_handler)


init_logging()
logger = logging.getLogger("app.server")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ensure static ffmpeg is available
    try:
        import static_ffmpeg
        static_ffmpeg.add_paths()
        logger.info("✓ Static FFmpeg initialized successfully.")
    except Exception as e:
        logger.warning(f"Static FFmpeg note: {e}")
    yield
    logger.info("Server shutting down.")


app = FastAPI(
    title="Universal Video Downloader",
    description="High-resolution Video & Subtitle Downloader Web Application",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local/remote access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- HTTP Request & Response Logging Middleware ---
@app.middleware("http")
async def log_requests_and_responses(request: Request, call_next):
    start_time = time.time()
    method = request.method
    path = request.url.path
    client_ip = request.client.host if request.client else "unknown"

    # Only log detailed bodies for API routes
    is_api = path.startswith("/api")
    req_body_str = ""

    if is_api and method in ["POST", "PUT", "PATCH", "DELETE"]:
        try:
            body_bytes = await request.body()
            if body_bytes:
                # Attempt to parse json or truncate if too large
                try:
                    parsed = json.loads(body_bytes.decode("utf-8"))
                    req_body_str = f" | Body: {json.dumps(parsed, ensure_ascii=False)}"
                except Exception:
                    req_body_str = f" | Body: {body_bytes.decode('utf-8', errors='replace')[:500]}"
            
            # Re-wrap receive so downstream endpoints can read request body
            async def receive():
                return {"type": "http.request", "body": body_bytes}
            
            request = Request(request.scope, receive)
        except Exception as e:
            req_body_str = f" | (Body read error: {e})"

    if is_api:
        logger.info(f"👉 [REQUEST] {method} {path} (from {client_ip}){req_body_str}")

    try:
        response = await call_next(request)
        duration_ms = (time.time() - start_time) * 1000.0

        if is_api:
            logger.info(f"👈 [RESPONSE] {method} {path} | Status: {response.status_code} | Duration: {duration_ms:.1f}ms")

        return response
    except Exception as exc:
        duration_ms = (time.time() - start_time) * 1000.0
        tb = traceback.format_exc()
        logger.error(f"💥 [ERROR] {method} {path} failed after {duration_ms:.1f}ms:\n{tb}")
        raise exc


# Include API Router
app.include_router(api_router)

# Mount static frontend
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
