FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONPATH=/app:/ml

# System deps: image processing, PDF, GDAL/geo, OCR
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      libpq-dev \
      libgl1 \
      libglib2.0-0 \
      libsm6 libxext6 libxrender1 \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-eng \
      tesseract-ocr-hin \
      tesseract-ocr-mar \
      tesseract-ocr-ben \
      tesseract-ocr-tam \
      tesseract-ocr-tel \
      tesseract-ocr-kan \
      tesseract-ocr-mal \
      tesseract-ocr-guj \
      tesseract-ocr-pan \
      tesseract-ocr-ori \
      tesseract-ocr-urd \
      gdal-bin libgdal-dev \
      curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/api/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt

COPY services/api /app
COPY ml /ml

EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "bhumi.main:app", "--host", "0.0.0.0", "--port", "8000"]
