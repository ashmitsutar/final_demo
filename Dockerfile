# Use an official Python runtime as a parent image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1
ENV PIPER_PATH=/app/piper/piper
ENV PIPER_MODEL_PATH=/app/piper/voices/en_US-lessac-medium.onnx
ENV PIPER_CONFIG_PATH=/app/piper/voices/en_US-lessac-medium.onnx.json
ENV PIPER_ESPEAK_PATH=/app/piper/espeak-ng-data

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Install Piper TTS (Linux version)
RUN mkdir -p /app/piper/voices && \
    curl -L https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz | tar -xzC /app/piper --strip-components=1

# Download a default Piper voice model
RUN curl -L https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx -o /app/piper/voices/en_US-lessac-medium.onnx && \
    curl -L https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json -o /app/piper/voices/en_US-lessac-medium.onnx.json

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . .

# Create uploads directory and initialize database
RUN mkdir -p /app/uploads && python init_db.py

# Hugging Face Spaces requires port 7860
EXPOSE 7860

# Run the application on port 7860 (HF Spaces) or fallback to 7000 (local)
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}
