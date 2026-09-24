# Running YouTube Pro Downloader Locally (Without Docker)

To run the application locally without Docker, follow these steps:

### Global Terminal Commands (Run From Anywhere)

You can manage the server from any terminal directory using the dedicated CLI commands:

```bash
downloader-start     # Start the dev server in the background
downloader-status    # Check server status, health, and recent logs
downloader-stop      # Gracefully stop the server
downloader-restart   # Restart the server
downloader-logs      # Stream live server logs (tail -f)
```

Optional flags:
- `downloader-start --reload` : Start with hot-reloading enabled
- `downloader-start --foreground` : Run attached directly to the current terminal window
- `downloader-start --port 8080` : Run on a custom port (default: 8000)

---

### Quick Run (Inside Project Folder)

The virtual environment and dependencies are already installed in your project folder. You can also start the server directly:

```bash
cd /home/user/code/sideProjects/download
./venv/bin/python3 run.py
```

Then open your browser and go to:
👉 **[http://localhost:8000](http://localhost:8000)**

---

### Standard Step-by-Step (On Any New Computer)

If you copy this project to another machine or set it up from scratch:

#### 1. Navigate to the project directory
```bash
cd /path/to/download
```

#### 2. Create and activate a Python virtual environment
- **On Linux / macOS:**
  ```bash
  python3 -m venv venv
  source venv/bin/activate
  ```
- **On Windows (Command Prompt / PowerShell):**
  ```bat
  python -m venv venv
  venv\Scripts\activate
  ```

#### 3. Install the dependencies
```bash
pip install -r requirements.txt
```

#### 4. Launch the application
```bash
python3 run.py
```

---

### Optional Customizations

- **Run on a different port (e.g. 5000):**
  ```bash
  PORT=5000 ./venv/bin/python3 run.py
  ```

- **Run in the background (headless / daemon):**
  ```bash
  nohup ./venv/bin/python3 run.py > server.log 2>&1 &
  ```

- **Stop the server:**
  Press `Ctrl + C` in the terminal where `run.py` is running.

