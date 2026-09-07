# Production Dockerfile for YouTube Pro Downloader
FROM python:3.12-slim

# Install system dependencies & ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements & install python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source
COPY app/ ./app/
COPY static/ ./static/
COPY run.py .

# Create downloads volume directory
RUN mkdir -p /app/downloads

# Expose web port
EXPOSE 8000

ENV HOST=0.0.0.0
ENV PORT=8000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/api/system-paths || exit 1

# Start the application
CMD ["python3", "run.py"]

