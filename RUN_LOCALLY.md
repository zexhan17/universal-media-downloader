# Running YouTube Pro Downloader Locally (Without Docker)

To run the application locally without Docker, follow these steps:

### Quick Run (Using Existing Setup)

The virtual environment and dependencies are already installed in your project folder. You can start the server with a single command:

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

