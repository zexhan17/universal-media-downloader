import json
import os
import subprocess
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.api.routes import extract_media_url_and_referer
from app.services.downloader import downloader_service, TaskStatus

client = TestClient(app)
BASE_DIR = Path(__file__).resolve().parent.parent
EXTENSION_DIR = BASE_DIR / "extension"


def test_extension_directory_exists():
    """Verify that extension directory and essential files exist and are not empty."""
    assert EXTENSION_DIR.exists()
    assert EXTENSION_DIR.is_dir()

    required_files = [
        "manifest.json",
        "background.js",
        "content.js",
        "popup.html",
        "popup.css",
        "popup.js",
        "README.md",
        "icons/icon16.png",
        "icons/icon48.png",
        "icons/icon128.png",
    ]

    for rel_path in required_files:
        file_path = EXTENSION_DIR / rel_path
        assert file_path.exists(), f"Missing extension file: {rel_path}"
        assert file_path.stat().st_size > 0, f"File is empty (0 bytes): {rel_path}"


def test_manifest_v3_structure():
    """Verify that manifest.json is valid JSON and complies with Manifest V3 requirements."""
    manifest_path = EXTENSION_DIR / "manifest.json"
    with open(manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    assert manifest.get("manifest_version") == 3
    assert "name" in manifest
    assert "version" in manifest
    assert "icons" in manifest
    assert "action" in manifest
    assert manifest["action"].get("default_popup") == "popup.html"
    assert "background" in manifest
    assert manifest["background"].get("service_worker") == "background.js"
    assert "content_scripts" in manifest
    assert len(manifest["content_scripts"]) > 0
    assert "content.js" in manifest["content_scripts"][0].get("js", [])
    assert "permissions" in manifest
    assert "activeTab" in manifest["permissions"]
    assert "host_permissions" in manifest


def test_html_and_js_file_references():
    """Verify that popup.html properly references popup.css and popup.js."""
    popup_html = (EXTENSION_DIR / "popup.html").read_text(encoding="utf-8")
    assert 'href="popup.css"' in popup_html or "popup.css" in popup_html
    assert 'src="popup.js"' in popup_html or "popup.js" in popup_html

    popup_js = (EXTENSION_DIR / "popup.js").read_text(encoding="utf-8")
    assert "/api/download" in popup_js
    assert "/api/tasks" in popup_js


def test_javascript_syntax_with_node():
    """Verify JavaScript files have valid syntax using node -c if node runtime exists."""
    node_bin = None
    for candidate in ["node", "/usr/bin/node", "/usr/local/bin/node"]:
        if os.path.exists(candidate) or subprocess.run(["which", candidate], capture_output=True).returncode == 0:
            node_bin = candidate
            break

    if node_bin:
        js_files = ["background.js", "content.js", "popup.js"]
        for js_file in js_files:
            file_path = EXTENSION_DIR / js_file
            res = subprocess.run([node_bin, "-c", str(file_path)], capture_output=True, text=True)
            assert res.returncode == 0, f"Syntax error in {js_file}: {res.stderr}"


def test_backend_extension_api_contract():
    """Verify that backend endpoints required by the extension respond as expected."""
    # 1. GET /api/tasks (Used by popup for server connection check and task tracking)
    tasks_res = client.get("/api/tasks")
    assert tasks_res.status_code == 200
    assert isinstance(tasks_res.json(), list)

    # 2. POST /api/download with referer support
    payload = {
        "url": "https://example.com/test-stream.m3u8",
        "quality": "best",
        "container": "mp4",
        "referer": "https://example.com/player",
        "save_mode": "browser"
    }
    dl_res = client.post("/api/download", json=payload)
    assert dl_res.status_code == 200
    data = dl_res.json()
    assert "task_id" in data
    assert data["status"] in ["queued", "downloading", "processing"]

    # Verify task stored referer in options
    task = downloader_service.tasks.get(data["task_id"])
    assert task is not None
    assert task.options.get("referer") == "https://example.com/player"


def test_html_tag_paste_handling():
    """Test full extraction of real stream URL and referer when user pastes raw HTML snippet."""
    # Real-world snippet as shared by user
    html_snippet = (
        '<video id="video" playsinline="" webkit-playsinline="" x-webkit-airplay="allow" '
        'crossorigin="anonymous" src="blob:https://cloudorchestranova.com/39337b74-19ed-4e01-87ca-29896668c97d">'
        '<source src="https://liminallabyrinth.space/pl/master.m3u8?token=xyz123" '
        'type="application/vnd.apple.mpegurl" data-airplay="1"></video>'
    )

    clean_url, referer = extract_media_url_and_referer(html_snippet)
    assert clean_url == "https://liminallabyrinth.space/pl/master.m3u8?token=xyz123"
    assert referer == "https://cloudorchestranova.com/"

    # Test through POST /api/download with the raw snippet
    dl_res = client.post("/api/download", json={"url": html_snippet, "save_mode": "browser"})
    assert dl_res.status_code == 200
    task_id = dl_res.json()["task_id"]
    task = downloader_service.tasks.get(task_id)
    assert task is not None
    assert task.url == "https://liminallabyrinth.space/pl/master.m3u8?token=xyz123"
    assert task.options.get("referer") == "https://cloudorchestranova.com/"


def test_structured_json_extension_contract():
    """Verify structured JSON object generated by extension is fully recognized by backend."""
    structured_stream = {
        "title": "Watch Swapped (Episode 1)",
        "url": "https://liminallabyrinth.space/pl/master.m3u8?token=secureToken",
        "referer": "https://cloudorchestranova.com/",
        "pageUrl": "https://cinehd.vc/watch/swapped",
        "type": "HLS Stream (.m3u8)",
        "userAgent": "Mozilla/5.0 Chrome/128",
        "headers": {"Referer": "https://cloudorchestranova.com/"}
    }
    raw_json = json.dumps(structured_stream)
    clean_url, referer = extract_media_url_and_referer(raw_json)
    assert clean_url == "https://liminallabyrinth.space/pl/master.m3u8?token=secureToken"
    assert referer == "https://cloudorchestranova.com/"

    # Test POST /api/download with structured stream
    dl_res = client.post("/api/download", json={
        "url": structured_stream["url"],
        "referer": structured_stream["referer"],
        "user_agent": structured_stream["userAgent"],
        "headers": structured_stream["headers"],
        "title": structured_stream["title"]
    })
    assert dl_res.status_code == 200
    task_id = dl_res.json()["task_id"]
    task = downloader_service.tasks.get(task_id)
    assert task is not None
    assert task.options.get("referer") == "https://cloudorchestranova.com/"
    assert task.options.get("user_agent") == "Mozilla/5.0 Chrome/128"
    assert task.options.get("title") == "Watch Swapped (Episode 1)"
    client.delete(f"/api/task/{task_id}")
