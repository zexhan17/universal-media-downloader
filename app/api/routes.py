import asyncio
import json
import os
import re
import subprocess
import sys
import unicodedata
from typing import List, Optional
from urllib.parse import quote
from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from starlette.background import BackgroundTask
from pydantic import BaseModel

from app.services.downloader import downloader_service, TaskStatus

router = APIRouter(prefix="/api")


class VideoInfoRequest(BaseModel):
    url: str
    referer: Optional[str] = None
    user_agent: Optional[str] = None
    headers: Optional[dict] = None
    title: Optional[str] = None


class DownloadRequest(BaseModel):
    url: str
    quality: str = "best"
    container: str = "mp4"
    audio_quality: str = "320"
    subtitles_enabled: bool = False
    subtitle_langs: List[str] = []
    subtitle_mode: str = "embed"
    include_auto_subs: bool = True
    save_mode: str = "browser"  # 'browser' or 'local_folder'
    custom_save_path: Optional[str] = ""
    referer: Optional[str] = None
    user_agent: Optional[str] = None
    headers: Optional[dict] = None
    title: Optional[str] = None


class PathValidateRequest(BaseModel):
    path: str


def extract_media_url_and_referer(raw_text: str) -> tuple[str, Optional[str]]:
    """
    Extract clean URL and optional referer from input if user pasted HTML tag like
    <video src="..."><source src="..." ...></video>, markdown link, or structured JSON.
    """
    text = raw_text.strip()
    # 1. Check if structured JSON was pasted
    if text.startswith("{") and text.endswith("}"):
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                url = data.get("url") or data.get("streamUrl") or data.get("src")
                referer = data.get("referer") or data.get("origin") or data.get("pageUrl")
                if url:
                    return str(url).strip(), str(referer).strip() if referer else None
        except Exception:
            pass

    # 2. Check if raw HTML video / source / iframe tag was pasted
    if "<video" in text or "<source" in text or "<iframe" in text:
        src_matches = re.findall(r'src=["\']([^"\']+)["\']', text)
        page_origin = None
        valid_url = None
        for src in src_matches:
            if src.startswith("blob:"):
                m = re.match(r'blob:(https?://[^/]+)', src)
                if m:
                    page_origin = m.group(1) + "/"
            elif src.startswith("http://") or src.startswith("https://"):
                valid_url = src
        if valid_url:
            return valid_url, page_origin
    return text, None


def make_safe_download_filename(filename: str) -> str:
    """Return a clean ASCII-safe filename to prevent HTTP latin-1 header encoding errors."""
    # Normalize unicode to ASCII equivalents where possible
    norm = unicodedata.normalize('NFKD', filename)
    norm = norm.replace('–', '-').replace('—', '-').replace('−', '-')
    # Encode to ASCII bytes, ignoring non-convertible characters
    ascii_clean = norm.encode('ascii', 'ignore').decode('ascii')
    # Remove problematic characters
    clean = re.sub(r'[\\/*?:"<>|]', '', ascii_clean).strip()
    return clean if clean else "download.mp4"


@router.post("/info")
async def get_video_info(payload: VideoInfoRequest):
    """Fetch video metadata, resolutions, and subtitles from any platform."""
    url, auto_referer = extract_media_url_and_referer(payload.url)
    referer = payload.referer or auto_referer
    if not url:
        raise HTTPException(status_code=400, detail="Please enter a valid video or webpage URL.")

    try:
        loop = asyncio.get_running_loop()
        info = await loop.run_in_executor(
            downloader_service.executor,
            lambda: downloader_service.extract_info(
                url,
                referer=referer,
                user_agent=payload.user_agent,
                headers=payload.headers
            )
        )
        if payload.title and info.get("title") in ("Video Download", "Watch Swapped", "master", "index", "video", ""):
            info["title"] = payload.title
        if referer:
            info["referer"] = referer
        return info
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch video details: {str(e)}")


@router.post("/download")
async def start_download(payload: DownloadRequest, request: Request):
    """Initiate a download task in the background."""
    url, auto_referer = extract_media_url_and_referer(payload.url)
    if not url:
        raise HTTPException(status_code=400, detail="URL cannot be empty.")

    # Validate custom save path if local_folder mode is selected
    if payload.save_mode == "local_folder" and payload.custom_save_path:
        check = downloader_service.validate_path(payload.custom_save_path)
        if not check.get("valid"):
            raise HTTPException(status_code=400, detail=f"Invalid destination folder: {check.get('message')}")

    opts = payload.model_dump()
    opts["url"] = url
    if not opts.get("referer") and auto_referer:
        opts["referer"] = auto_referer

    task = downloader_service.create_task(url, opts)
    loop = asyncio.get_running_loop()
    downloader_service.start_download_async(task, loop)

    return {"task_id": task.task_id, "status": task.status}


@router.get("/tasks")
async def get_all_tasks():
    """Get all current and recent download tasks."""
    return downloader_service.get_all_tasks()


@router.get("/task/{task_id}")
async def get_task_status(task_id: str):
    """Get the current state of a task."""
    task = downloader_service.tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task.to_dict()


@router.post("/task/{task_id}/cancel")
async def cancel_task(task_id: str):
    """Cancel a running task immediately and remove all associated files."""
    loop = asyncio.get_running_loop()
    success = downloader_service.cancel_task(task_id, loop)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "canceled", "message": "Task canceled and all associated files deleted successfully"}


@router.delete("/task/{task_id}")
async def delete_task(task_id: str):
    """Dismiss/delete a task and clean up temporary or partial files."""
    success = downloader_service.delete_task(task_id, delete_files=True)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"status": "deleted", "message": "Task deleted"}


@router.get("/progress/{task_id}")
async def stream_task_progress(task_id: str):
    """Server-Sent Events (SSE) stream for real-time download progress."""
    task = downloader_service.tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    queue = asyncio.Queue()
    task.subscribers.append(queue)

    async def event_generator():
        try:
            # Yield initial state
            yield f"data: {json.dumps(task.to_dict())}\n\n"
            
            while True:
                # Wait for next event or check if done
                if task.status in [TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELED]:
                    yield f"data: {json.dumps(task.to_dict())}\n\n"
                    break

                try:
                    data = await asyncio.wait_for(queue.get(), timeout=20.0)
                    yield f"data: {json.dumps(data)}\n\n"
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            if queue in task.subscribers:
                task.subscribers.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


@router.get("/file/{task_id}")
async def download_file(task_id: str):
    """Stream downloaded file directly to client browser safely with RFC 5987 headers."""
    task = downloader_service.tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    if task.status != TaskStatus.COMPLETED or not task.filepath or not os.path.exists(task.filepath):
        raise HTTPException(status_code=400, detail="File is not ready or does not exist.")

    raw_filename = task.filename or os.path.basename(task.filepath)
    safe_ascii_filename = make_safe_download_filename(raw_filename)
    encoded_utf8_filename = quote(raw_filename.encode('utf-8'))
    
    # Determine media type
    ext = os.path.splitext(raw_filename)[1].lower()
    media_types = {
        ".mp4": "video/mp4",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".wav": "audio/wav",
        ".flac": "audio/flac",
    }
    media_type = media_types.get(ext, "application/octet-stream")

    # RFC 6266 / RFC 5987 compliant Content-Disposition with ASCII fallback + UTF-8 support
    content_disposition = f'attachment; filename="{safe_ascii_filename}"; filename*=UTF-8\'\'{encoded_utf8_filename}'

    return FileResponse(
        path=task.filepath,
        media_type=media_type,
        headers={"Content-Disposition": content_disposition}
    )


@router.get("/history")
async def get_history():
    """Retrieve download history."""
    return downloader_service.history


@router.delete("/history")
async def clear_history():
    """Clear download history."""
    downloader_service.history.clear()
    return {"message": "History cleared"}


@router.get("/system-paths")
async def get_system_paths():
    """Get common system folders for local storage mode."""
    return downloader_service.get_system_directories()


@router.post("/validate-path")
async def validate_path(payload: PathValidateRequest):
    """Validate a custom directory path for writing."""
    return downloader_service.validate_path(payload.path)


@router.post("/open-folder")
async def open_folder(payload: PathValidateRequest):
    """Attempt to open folder in host file manager (for local convenience)."""
    folder_path = os.path.expanduser(payload.path)
    if not os.path.exists(folder_path):
        raise HTTPException(status_code=404, detail="Folder does not exist")

    try:
        if sys.platform == "win32":
            os.startfile(folder_path)
        elif sys.platform == "darwin":
            subprocess.Popen(["open", folder_path])
        else:
            subprocess.Popen(["xdg-open", folder_path])
        return {"success": True, "message": "Opened folder in file manager"}
    except Exception as e:
        return {"success": False, "message": f"Could not launch file manager: {e}"}
