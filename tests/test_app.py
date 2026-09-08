import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.services.downloader import downloader_service, format_bytes, format_seconds, TaskStatus

client = TestClient(app)

def test_static_index_html():
    """Test that frontend is served at root with multi-task downloads manager elements."""
    response = client.get("/")
    assert response.status_code == 200
    assert "Universal Media Downloader" in response.text
    assert "video-url" in response.text
    assert "downloads-manager" in response.text
    assert "tasks-list" in response.text
    assert "tasks-count-badge" in response.text
    assert "btn-clear-finished" in response.text


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


def test_unicode_filename_and_repeated_downloads(tmp_path):
    """Test downloading a file repeatedly (manual download buttons) and safe RFC headers."""
    # Create temporary dummy video file
    dummy_file = tmp_path / "Learn RAG – AI Tutorial 🎬.mp4"
    dummy_file.write_bytes(b"\x00\x00\x00\x18ftypmp42")

    task = downloader_service.create_task("https://example.com/test", {"save_mode": "browser"})
    task.status = TaskStatus.COMPLETED
    task.title = "Learn RAG – AI Tutorial 🎬"
    task.filepath = str(dummy_file)
    task.filename = dummy_file.name

    # First download (e.g. auto-download)
    response1 = client.get(f"/api/file/{task.task_id}")
    assert response1.status_code == 200
    assert "Content-Disposition" in response1.headers
    header_val = response1.headers["Content-Disposition"]
    assert "attachment" in header_val
    assert response1.content == b"\x00\x00\x00\x18ftypmp42"

    # Second download (e.g. user clicks manual download button)
    response2 = client.get(f"/api/file/{task.task_id}")
    assert response2.status_code == 200
    assert response2.content == b"\x00\x00\x00\x18ftypmp42"


def test_open_folder_endpoint():
    """Test open-folder endpoint with valid and non-existent folders."""
    # Non-existent folder
    resp = client.post("/api/open-folder", json={"path": "/nonexistent/folder/12345"})
    assert resp.status_code == 404


def test_task_cancellation_and_partial_file_cleanup(tmp_path):
    """Test that cancelling a task marks it as canceled and deletes all partial/temp files."""
    task = downloader_service.create_task("https://example.com/test", {"save_mode": "browser"})
    task.target_dir = tmp_path

    # Create dummy partial / temp files that yt-dlp might leave behind
    part_file = tmp_path / f"video [{task.task_id[:6]}].mp4.part"
    temp_file = tmp_path / f"video [{task.task_id[:6]}].temp"
    ytdl_file = tmp_path / f"video [{task.task_id[:6]}].ytdl"
    tracked_sub = tmp_path / f"video [{task.task_id[:6]}].en.srt"

    part_file.write_bytes(b"partial video data")
    temp_file.write_bytes(b"temporary data")
    ytdl_file.write_bytes(b"ytdl metadata")
    tracked_sub.write_bytes(b"1\n00:00:01 --> 00:00:02\nTest subtitle")

    task.tracked_files.add(str(tracked_sub))
    task.status = TaskStatus.DOWNLOADING

    assert part_file.exists()
    assert temp_file.exists()
    assert ytdl_file.exists()
    assert tracked_sub.exists()

    # Cancel task via API
    cancel_resp = client.post(f"/api/task/{task.task_id}/cancel")
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "canceled"

    # Verify task state
    status_resp = client.get(f"/api/task/{task.task_id}")
    assert status_resp.status_code == 200
    assert status_resp.json()["status"] == TaskStatus.CANCELED

    # Verify all partial and tracked files were cleanly deleted from disk
    assert not part_file.exists()
    assert not temp_file.exists()
    assert not ytdl_file.exists()
    assert not tracked_sub.exists()


def test_get_all_tasks_and_delete_task(tmp_path):
    """Test listing all tasks and deleting a task from memory and disk."""
    task1 = downloader_service.create_task("https://example.com/test1", {"save_mode": "browser"})
    task2 = downloader_service.create_task("https://example.com/test2", {"save_mode": "browser"})

    # Get all tasks
    tasks_resp = client.get("/api/tasks")
    assert tasks_resp.status_code == 200
    tasks_list = tasks_resp.json()
    task_ids = [t["task_id"] for t in tasks_list]
    assert task1.task_id in task_ids
    assert task2.task_id in task_ids

    # Delete task1
    del_resp = client.delete(f"/api/task/{task1.task_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["status"] == "deleted"

    # Verify task1 is gone
    get_del_resp = client.get(f"/api/task/{task1.task_id}")
    assert get_del_resp.status_code == 404
