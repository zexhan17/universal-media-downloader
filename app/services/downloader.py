import asyncio
import os
import re
import shutil
import time
import unicodedata
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import quote

import yt_dlp

try:
    import static_ffmpeg
    static_ffmpeg.add_paths()
except Exception as e:
    print(f"static-ffmpeg notice: {e}")

# Ensure node runtime is in PATH if available
node_candidates = [
    shutil.which("node"),
    shutil.which("deno"),
    str(Path.home() / ".nvm/versions/node/v22.20.0/bin/node"),
    str(Path.home() / ".nvm/versions/node/v20.18.0/bin/node"),
    "/usr/bin/node",
    "/usr/local/bin/node"
]
NODE_BIN = None
for candidate in node_candidates:
    if candidate and os.path.exists(candidate):
        NODE_BIN = candidate
        parent_dir = str(Path(candidate).parent)
        if parent_dir not in os.environ.get("PATH", ""):
            os.environ["PATH"] = f"{parent_dir}:{os.environ.get('PATH', '')}"
        break

# Base download storage directory
BASE_DIR = Path(__file__).resolve().parent.parent.parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)

# Common languages priority order for subtitles
POPULAR_LANG_PRIORITY = {
    "en": 1, "en-US": 2, "en-GB": 3, "es": 4, "fr": 5, "de": 6,
    "pt": 7, "it": 8, "ja": 9, "ko": 10, "zh": 11, "zh-Hans": 12,
    "zh-Hant": 13, "hi": 14, "ar": 15, "ru": 16, "id": 17, "tr": 18,
    "nl": 19, "pl": 20, "vi": 21, "th": 22, "sv": 23, "uk": 24
}


def sanitize_filename_clean(filename: str) -> str:
    """Sanitize filename to be safe across filesystems and ASCII/HTTP headers."""
    normalized = unicodedata.normalize('NFKD', filename)
    normalized = normalized.replace('–', '-').replace('—', '-').replace('−', '-')
    cleaned = re.sub(r'[\\/*?:"<>|]', '', normalized)
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    return cleaned if cleaned else "video"


class TaskStatus:
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    MERGING = "merging"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELED = "canceled"


class DownloadTask:
    def __init__(self, task_id: str, url: str, options: dict):
        self.task_id = task_id
        self.url = url
        self.options = options
        self.status = TaskStatus.QUEUED
        self.stage = "Queued"
        self.title = "Fetching info..."
        self.thumbnail = ""
        self.duration = 0
        self.channel = ""
        self.platform = "Universal"
        self.progress = 0.0
        self.speed = "0 B/s"
        self.eta = "--:--"
        self.downloaded_bytes = 0
        self.total_bytes = 0
        self.filename = ""
        self.filepath = ""
        self.file_size = 0
        self.file_size_str = "0 MB"
        self.error = None
        self.created_at = datetime.now().isoformat()
        self.completed_at = None
        self.subscribers: List[asyncio.Queue] = []
        self.save_mode = options.get("save_mode", "browser")
        self.custom_save_path = options.get("custom_save_path", "")
        self.final_dest_path = ""

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "url": self.url,
            "title": self.title,
            "thumbnail": self.thumbnail,
            "duration": self.duration,
            "channel": self.channel,
            "platform": self.platform,
            "status": self.status,
            "stage": self.stage,
            "progress": round(self.progress, 1),
            "speed": self.speed,
            "eta": self.eta,
            "downloaded_bytes": self.downloaded_bytes,
            "total_bytes": self.total_bytes,
            "filename": self.filename,
            "file_size_str": self.file_size_str,
            "save_mode": self.save_mode,
            "custom_save_path": self.custom_save_path,
            "final_dest_path": self.final_dest_path,
            "error": self.error,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
        }


def format_bytes(size: float) -> str:
    if not size or size <= 0:
        return "0 B"
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024.0:
            return f"{size:.1f} {unit}"
        size /= 1024.0
    return f"{size:.1f} PB"


def format_seconds(seconds: Optional[Any]) -> str:
    if not seconds:
        return "00:00"
    try:
        sec = int(float(seconds))
        m, s = divmod(sec, 60)
        h, m = divmod(m, 60)
        if h > 0:
            return f"{h:02d}:{m:02d}:{s:02d}"
        return f"{m:02d}:{s:02d}"
    except (ValueError, TypeError):
        return "00:00"


def detect_platform(url: str, extractor_key: str = "") -> dict:
    """Detect source platform and return info with icon badge."""
    u = url.lower()
    ek = extractor_key.lower() if extractor_key else ""
    
    if "youtube.com" in u or "youtu.be" in u or "youtube" in ek:
        return {"name": "YouTube", "icon": "youtube", "color": "text-red-500"}
    elif "instagram.com" in u or "instagram" in ek:
        return {"name": "Instagram", "icon": "instagram", "color": "text-pink-500"}
    elif "facebook.com" in u or "fb.watch" in u or "fb.me" in u or "facebook" in ek:
        return {"name": "Facebook", "icon": "facebook", "color": "text-blue-500"}
    elif "tiktok.com" in u or "tiktok" in ek:
        return {"name": "TikTok", "icon": "music", "color": "text-cyan-400"}
    elif "twitter.com" in u or "x.com" in u or "twitter" in ek:
        return {"name": "Twitter / X", "icon": "twitter", "color": "text-slate-200"}
    elif "reddit.com" in u or "reddit" in ek:
        return {"name": "Reddit", "icon": "message-square", "color": "text-orange-500"}
    elif "vimeo.com" in u or "vimeo" in ek:
        return {"name": "Vimeo", "icon": "video", "color": "text-blue-400"}
    elif "twitch.tv" in u or "twitch" in ek:
        return {"name": "Twitch", "icon": "tv", "color": "text-purple-500"}
    else:
        return {"name": "Web Video", "icon": "globe", "color": "text-emerald-400"}


class DownloaderService:
    def __init__(self):
        self.tasks: Dict[str, DownloadTask] = {}
        self.history: List[dict] = []
        self.executor = ThreadPoolExecutor(max_workers=6)

    def extract_info(self, url: str) -> dict:
        """Extract metadata, available resolutions, and subtitles from any supported video URL."""
        ydl_opts: Dict[str, Any] = {
            "quiet": True,
            "no_warnings": True,
            "skip_download": True,
            "extract_flat": False,
            "ignoreerrors": False,
        }
        if NODE_BIN:
            ydl_opts["js_runtimes"] = {"node": {"path": NODE_BIN}}

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise ValueError("Could not extract video information from this URL.")

        raw_title = info.get("title") or "Video Download"
        title = raw_title.replace("\n", " ").strip()
        duration = info.get("duration") or 0
        duration_str = format_seconds(duration)
        
        thumbnail = info.get("thumbnail") or ""
        if not thumbnail and info.get("thumbnails"):
            thumbnail = info["thumbnails"][-1].get("url", "")
            
        channel = info.get("uploader") or info.get("channel") or info.get("creator") or info.get("extractor_key") or "Creator"
        view_count = info.get("view_count")
        view_count_str = f"{view_count:,} views" if view_count is not None else ""
        webpage_url = info.get("webpage_url", url)
        extractor_key = info.get("extractor_key", "")
        platform_info = detect_platform(url, extractor_key)

        # Process formats (Filter out storyboards and dummy thumbnails)
        raw_formats = info.get("formats", [])
        video_resolutions = {}

        for f in raw_formats:
            vcodec = f.get("vcodec") or "none"
            format_id = str(f.get("format_id", ""))
            
            # Skip storyboard formats
            if format_id.startswith("sb") or "storyboard" in format_id or vcodec == "none":
                continue

            height = f.get("height")
            fps = f.get("fps") or 30
            filesize = f.get("filesize") or f.get("filesize_approx") or 0
            format_note = f.get("format_note", "")

            if not height and format_note:
                m = re.search(r'(\d+)p', format_note)
                if m:
                    height = int(m.group(1))

            if height and height >= 144:
                h_val = height
                res_key = f"{h_val}p"
                fps_str = f"{fps}fps" if fps and fps > 30 else ""
                
                if h_val >= 4320:
                    quality_label = "8K (4320p)"
                elif h_val >= 2160:
                    quality_label = "4K (2160p)"
                elif h_val >= 1440:
                    quality_label = "2K (1440p)"
                elif h_val >= 1080:
                    quality_label = "Full HD (1080p)"
                elif h_val >= 720:
                    quality_label = "HD (720p)"
                elif h_val >= 480:
                    quality_label = "SD (480p)"
                elif h_val >= 360:
                    quality_label = "360p"
                elif h_val >= 240:
                    quality_label = "240p"
                elif h_val >= 144:
                    quality_label = "144p"
                else:
                    quality_label = f"{h_val}p"

                if res_key not in video_resolutions or (filesize > video_resolutions[res_key]["raw_size"]):
                    video_resolutions[res_key] = {
                        "height": h_val,
                        "label": quality_label,
                        "res_key": res_key,
                        "fps": fps,
                        "fps_str": fps_str,
                        "format_id": format_id,
                        "raw_size": filesize,
                        "size_str": format_bytes(filesize) if filesize else "Dynamic",
                        "vcodec": vcodec,
                        "ext": f.get("ext", "mp4"),
                    }

        # Sort resolutions from highest to lowest
        sorted_resolutions = sorted(
            video_resolutions.values(),
            key=lambda x: x["height"],
            reverse=True
        )

        if not sorted_resolutions:
            sorted_resolutions.append({
                "height": 1080,
                "label": "Original Quality",
                "res_key": "best",
                "fps": 30,
                "fps_str": "",
                "format_id": "best",
                "raw_size": info.get("filesize", 0) or 0,
                "size_str": format_bytes(info.get("filesize", 0)),
                "vcodec": "auto",
                "ext": "mp4",
            })

        # Process subtitles with smart ordering
        manual_subs = info.get("subtitles") or {}
        auto_subs = info.get("automatic_captions") or {}
        
        manual_list = []
        popular_auto_list = []
        other_auto_list = []
        seen_langs = set()

        if isinstance(manual_subs, dict):
            for lang_code, subs in manual_subs.items():
                lang_name = subs[0].get("name") if subs and isinstance(subs, list) and len(subs) > 0 and subs[0].get("name") else lang_code
                manual_list.append({
                    "code": lang_code,
                    "name": lang_name,
                    "is_auto": False,
                    "display": f"{lang_name} ({lang_code})",
                    "priority": POPULAR_LANG_PRIORITY.get(lang_code, 100)
                })
                seen_langs.add(lang_code)

        if isinstance(auto_subs, dict):
            for lang_code, subs in auto_subs.items():
                if lang_code not in seen_langs:
                    lang_name = subs[0].get("name") if subs and isinstance(subs, list) and len(subs) > 0 and subs[0].get("name") else lang_code
                    prio = POPULAR_LANG_PRIORITY.get(lang_code, 999)
                    entry = {
                        "code": lang_code,
                        "name": lang_name,
                        "is_auto": True,
                        "display": f"{lang_name} [Auto] ({lang_code})",
                        "priority": prio
                    }
                    if prio < 999:
                        popular_auto_list.append(entry)
                    else:
                        other_auto_list.append(entry)

        manual_list.sort(key=lambda x: x["priority"])
        popular_auto_list.sort(key=lambda x: x["priority"])
        other_auto_list.sort(key=lambda x: x["name"])

        subtitles_list = manual_list + popular_auto_list + other_auto_list
        default_sub_lang = "en"
        if manual_list:
            default_sub_lang = manual_list[0]["code"]
        elif popular_auto_list:
            default_sub_lang = popular_auto_list[0]["code"]

        return {
            "title": title,
            "id": info.get("id") or str(uuid.uuid4())[:8],
            "url": webpage_url,
            "thumbnail": thumbnail,
            "duration": duration,
            "duration_str": duration_str,
            "channel": channel,
            "view_count": view_count_str,
            "platform": platform_info,
            "resolutions": sorted_resolutions,
            "subtitles": subtitles_list,
            "has_subtitles": len(subtitles_list) > 0,
            "default_sub_lang": default_sub_lang,
            "default_resolution": sorted_resolutions[0]["res_key"] if sorted_resolutions else "best",
        }

    def create_task(self, url: str, options: dict) -> DownloadTask:
        task_id = str(uuid.uuid4())
        task = DownloadTask(task_id, url, options)
        self.tasks[task_id] = task
        return task

    def start_download_async(self, task: DownloadTask, loop: asyncio.AbstractEventLoop):
        self.executor.submit(self._download_worker, task, loop)

    def _notify_subscribers(self, task: DownloadTask, loop: asyncio.AbstractEventLoop):
        data = task.to_dict()
        for sub in list(task.subscribers):
            try:
                loop.call_soon_threadsafe(sub.put_nowait, data)
            except Exception:
                pass

    def _progress_hook(self, d: dict, task: DownloadTask, loop: asyncio.AbstractEventLoop):
        status = d.get("status")
        if status == "downloading":
            task.status = TaskStatus.DOWNLOADING
            downloaded = d.get("downloaded_bytes", 0)
            total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
            
            task.downloaded_bytes = downloaded
            task.total_bytes = total
            
            if total > 0:
                task.progress = min(99.0, (downloaded / total) * 100.0)
            
            speed = d.get("speed")
            if speed:
                task.speed = f"{format_bytes(speed)}/s"
            
            eta = d.get("eta")
            if eta is not None:
                task.eta = format_seconds(eta)

            filename = d.get("filename", "")
            if filename:
                task.filename = os.path.basename(filename)
                task.stage = "Downloading high-quality streams..."

            self._notify_subscribers(task, loop)

        elif status == "finished":
            task.stage = "Processing & finalizing media file..."
            task.progress = 99.0
            self._notify_subscribers(task, loop)

    def _postprocessor_hook(self, d: dict, task: DownloadTask, loop: asyncio.AbstractEventLoop):
        status = d.get("status")
        postprocessor = d.get("postprocessor", "")
        if status == "started":
            if "EmbedSubtitle" in postprocessor:
                task.stage = "Embedding subtitles into video..."
            elif "Merger" in postprocessor:
                task.stage = "Merging highest quality video & audio streams (FFmpeg)..."
            elif "ExtractAudio" in postprocessor:
                task.stage = "Converting high-quality audio..."
            elif "MoveFiles" in postprocessor:
                task.stage = "Finalizing output file..."
            else:
                task.stage = f"Processing ({postprocessor})..."
            self._notify_subscribers(task, loop)

    def _execute_ytdlp_download(self, task: DownloadTask, loop: asyncio.AbstractEventLoop, with_subtitles: bool = True):
        opts = task.options
        quality = opts.get("quality", "best")
        container = opts.get("container", "mp4").lower()
        is_audio_only = (quality == "audio_only" or container in ["mp3", "m4a", "wav", "flac"])
        
        subtitles_enabled = opts.get("subtitles_enabled", False) and with_subtitles
        subtitle_langs = opts.get("subtitle_langs", []) or ["en"]
        subtitle_mode = opts.get("subtitle_mode", "embed")
        include_auto_subs = opts.get("include_auto_subs", True)

        save_mode = task.save_mode
        custom_save_path = task.custom_save_path

        if save_mode == "local_folder" and custom_save_path:
            target_dir = Path(os.path.expanduser(custom_save_path)).resolve()
            target_dir.mkdir(parents=True, exist_ok=True)
        else:
            target_dir = DOWNLOADS_DIR

        outtmpl = str(target_dir / f"%(title).120B [{quality} %(id)s {task.task_id[:6]}].%(ext)s")

        # Build format_spec and format_sort to guarantee true resolution
        if is_audio_only:
            format_spec = "bestaudio/best"
            format_sort = ["quality", "size", "br"]
        elif quality == "best":
            format_spec = "bestvideo*+bestaudio/best"
            format_sort = ["res", "fps", "size", "br", "quality"]
        else:
            height = quality.replace("p", "")
            if height.isdigit():
                h = int(height)
                # Match exact height first, then highest available under that height
                format_spec = f"bestvideo*[height={h}]+bestaudio/bestvideo*[height<={h}]+bestaudio/best[height<={h}]/best"
                format_sort = [f"res:{h}", "fps", "size", "br"]
            else:
                format_spec = "bestvideo*+bestaudio/best"
                format_sort = ["res", "fps", "size", "br"]

        ydl_opts: Dict[str, Any] = {
            "format": format_spec,
            "format_sort": format_sort,
            "outtmpl": outtmpl,
            "overwrites": True,
            "force_overwrites": True,
            "nooverwrites": False,
            "progress_hooks": [lambda d: self._progress_hook(d, task, loop)],
            "postprocessor_hooks": [lambda d: self._postprocessor_hook(d, task, loop)],
            "quiet": True,
            "no_warnings": True,
            "windowsfilenames": True,
            "restrictfilenames": False,
            "ignoreerrors": "only_download",
        }

        if NODE_BIN:
            ydl_opts["js_runtimes"] = {"node": {"path": NODE_BIN}}

        postprocessors = []

        if is_audio_only:
            audio_ext = "mp3" if container not in ["m4a", "wav", "flac"] else container
            postprocessors.append({
                "key": "FFmpegExtractAudio",
                "preferredcodec": audio_ext,
                "preferredquality": opts.get("audio_quality", "320"),
            })
            postprocessors.append({"key": "FFmpegMetadata", "add_metadata": True})
            postprocessors.append({"key": "EmbedThumbnail"})
            ydl_opts["writethumbnail"] = True
        else:
            merge_format = "mkv" if container == "mkv" else "mp4"
            ydl_opts["merge_output_format"] = merge_format

        if subtitles_enabled and subtitle_langs:
            ydl_opts["writesubtitles"] = True
            if include_auto_subs:
                ydl_opts["writeautomaticsub"] = True
            ydl_opts["subtitleslangs"] = subtitle_langs
            ydl_opts["subtitlesformat"] = "srt/vtt/best"

            if subtitle_mode == "embed":
                postprocessors.append({
                    "key": "FFmpegEmbedSubtitle",
                    "already_have_subtitle": False,
                })
            elif subtitle_mode == "burn":
                ydl_opts["postprocessor_args"] = {
                    "video": ["-vf", "subtitles=%(subtitle_file)s"]
                }

        if postprocessors:
            ydl_opts["postprocessors"] = postprocessors

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(task.url, download=True)
            raw_title = info.get("title", task.title)
            task.title = raw_title.replace("\n", " ").strip()
            task.thumbnail = info.get("thumbnail") or task.thumbnail
            task.duration = info.get("duration", 0)
            task.channel = info.get("uploader") or info.get("channel") or info.get("extractor_key") or ""
            task.platform = detect_platform(task.url, info.get("extractor_key", ""))["name"]

            downloaded_file = None
            if "requested_downloads" in info:
                for req in info["requested_downloads"]:
                    if req.get("filepath") and os.path.exists(req["filepath"]):
                        downloaded_file = req["filepath"]
                        break

            if not downloaded_file:
                for file_entry in target_dir.glob(f"*{task.task_id[:6]}*"):
                    if not file_entry.name.endswith(".temp") and not file_entry.name.endswith(".part"):
                        downloaded_file = str(file_entry)
                        break

            if not downloaded_file:
                vid_id = info.get("id")
                if vid_id:
                    for file_entry in target_dir.glob(f"*{vid_id}*"):
                        if not file_entry.name.endswith(".temp") and not file_entry.name.endswith(".part"):
                            downloaded_file = str(file_entry)
                            break

            if downloaded_file and os.path.exists(downloaded_file):
                task.filepath = downloaded_file
                task.filename = os.path.basename(downloaded_file)
                task.file_size = os.path.getsize(downloaded_file)
                task.file_size_str = format_bytes(task.file_size)
                task.final_dest_path = downloaded_file
                task.downloaded_bytes = task.file_size
                task.total_bytes = task.file_size
                task.speed = "Complete"
                task.eta = "00:00"
            else:
                raise FileNotFoundError("Could not locate final downloaded output file.")

    def _download_worker(self, task: DownloadTask, loop: asyncio.AbstractEventLoop):
        try:
            task.status = TaskStatus.DOWNLOADING
            task.stage = "Connecting to media source..."
            self._notify_subscribers(task, loop)

            try:
                self._execute_ytdlp_download(task, loop, with_subtitles=task.options.get("subtitles_enabled", False))
            except Exception as e:
                err_str = str(e).lower()
                if "subtitle" in err_str or "429" in err_str or "timedtext" in err_str:
                    print(f"Notice: Subtitle error ({e}), retrying download without subtitles...")
                    task.stage = "Captions rate-limited, downloading full video..."
                    self._notify_subscribers(task, loop)
                    self._execute_ytdlp_download(task, loop, with_subtitles=False)
                else:
                    raise e

            task.status = TaskStatus.COMPLETED
            task.stage = "Completed successfully!"
            task.progress = 100.0
            task.downloaded_bytes = task.file_size
            task.total_bytes = task.file_size
            task.speed = "Complete"
            task.eta = "00:00"
            task.completed_at = datetime.now().isoformat()
            
            self.history.insert(0, task.to_dict())
            if len(self.history) > 50:
                self.history = self.history[:50]

            self._notify_subscribers(task, loop)

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.stage = "Failed"
            task.error = str(e)
            self._notify_subscribers(task, loop)

    def get_system_directories(self) -> List[dict]:
        """Return common default user directories for local download destination."""
        home = Path.home()
        candidates = [
            {"label": "User Downloads Folder", "path": str(home / "Downloads")},
            {"label": "User Videos Folder", "path": str(home / "Videos")},
            {"label": "User Desktop Folder", "path": str(home / "Desktop")},
            {"label": "App Downloads Folder (Default)", "path": str(DOWNLOADS_DIR)},
        ]
        results = []
        for item in candidates:
            p = Path(item["path"])
            exists = p.exists()
            writable = os.access(p, os.W_OK) if exists else os.access(p.parent, os.W_OK)
            results.append({
                "label": item["label"],
                "path": item["path"],
                "exists": exists,
                "writable": writable
            })
        return results

    def validate_path(self, path_str: str) -> dict:
        """Validate if a local path can be used for saving."""
        if not path_str or not path_str.strip():
            return {"valid": False, "message": "Path cannot be empty"}
        try:
            expanded = Path(os.path.expanduser(path_str)).resolve()
            if expanded.exists():
                if not expanded.is_dir():
                    return {"valid": False, "message": "Path is a file, not a directory."}
                if not os.access(expanded, os.W_OK):
                    return {"valid": False, "message": "Directory is not writable (permission denied)."}
                return {"valid": True, "path": str(expanded), "message": "Valid writable directory"}
            else:
                parent = expanded.parent
                if parent.exists() and os.access(parent, os.W_OK):
                    return {"valid": True, "path": str(expanded), "message": "Directory will be created on download."}
                return {"valid": False, "message": "Cannot create directory in specified parent path (permission denied)."}
        except Exception as e:
            return {"valid": False, "message": f"Invalid path syntax: {e}"}


# Singleton service instance
downloader_service = DownloaderService()
