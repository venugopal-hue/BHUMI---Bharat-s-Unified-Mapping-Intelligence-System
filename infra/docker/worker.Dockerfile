FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app:/worker:/ml \
    HF_HOME=/models/hf \
    TORCH_HOME=/models/torch

RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential libpq-dev \
      libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 \
      poppler-utils \
      tesseract-ocr tesseract-ocr-eng tesseract-ocr-hin tesseract-ocr-mar \
      tesseract-ocr-ben tesseract-ocr-tam tesseract-ocr-tel tesseract-ocr-kan \
      tesseract-ocr-mal tesseract-ocr-guj tesseract-ocr-pan tesseract-ocr-ori \
      tesseract-ocr-urd \
      gdal-bin libgdal-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /worker

COPY services/api/requirements.txt /tmp/api-requirements.txt
COPY services/worker/requirements.txt /tmp/worker-requirements.txt
RUN pip install --no-cache-dir -r /tmp/api-requirements.txt \
 && pip install --no-cache-dir -r /tmp/worker-requirements.txt

COPY services/api /app
COPY services/worker /worker
COPY ml /ml

CMD ["celery", "-A", "worker.celery_app", "worker", "--loglevel=INFO"]
