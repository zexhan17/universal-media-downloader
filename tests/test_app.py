import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.downloader import downloader_service, format_bytes, format_seconds, TaskStatus

client = TestClient(app)

def test_static_index_html():
    """Test that frontend is served at root."""
    response = client.get("/")
    assert response.status_code == 200
    assert "Universal Media Downloader" in response.text
    assert "video-url" in response.text

def test_system_paths():
    """Test fetching system directory suggestions."""
    response = client.get("/api/system-paths")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) > 0
    assert "path" in data[0]

def test_validate_path():
    """Test path validation endpoint."""
    response = client.post("/api/validate-path", json={"path": "."})
    assert response.status_code == 200
    assert response.json()["valid"] is True

    response = client.post("/api/validate-path", json={"path": ""})
    assert response.status_code == 200
    assert response.json()["valid"] is False

def test_history_endpoints():
    """Test history fetch and delete."""
    response = client.get("/api/history")
    assert response.status_code == 200
    assert isinstance(response.json(), list)

    del_resp = client.delete("/api/history")
    assert del_resp.status_code == 200
    assert del_resp.json()["message"] == "History cleared"

def test_format_helpers():
    """Test byte and second formatting utility functions."""
    assert format_bytes(0) == "0 B"
    assert format_bytes(1024) == "1.0 KB"
    assert format_bytes(1048576) == "1.0 MB"
    assert format_bytes(1073741824) == "1.0 GB"

    assert format_seconds(0) == "00:00"
    assert format_seconds(45) == "00:45"
    assert format_seconds(125) == "02:05"
    assert format_seconds(3665) == "01:01:05"

def test_unicode_filename_download_response(tmp_path):
    """Test downloading a file with non-ASCII unicode characters in title (en-dash, emoji, etc.) to verify no UnicodeEncodeError."""
    # Create temporary dummy video file
    dummy_file = tmp_path / "Learn RAG – AI Tutorial 🎬.mp4"
    dummy_file.write_bytes(b"\x00\x00\x00\x18ftypmp42")

    task = downloader_service.create_task("https://example.com/test", {"save_mode": "browser"})
    task.status = TaskStatus.COMPLETED
    task.title = "Learn RAG – AI Tutorial 🎬"
    task.filepath = str(dummy_file)
    task.filename = dummy_file.name

    response = client.get(f"/api/file/{task.task_id}")
    assert response.status_code == 200
    assert "Content-Disposition" in response.headers
    # Ensure header was safely encoded without throwing UnicodeEncodeError
    header_val = response.headers["Content-Disposition"]
    assert "attachment" in header_val
    assert response.content == b"\x00\x00\x00\x18ftypmp42"
