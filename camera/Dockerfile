FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /camera
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY detector.py calibrate.py ./
CMD ["python", "detector.py", "--config", "/config/tables.json"]
