"""Object storage (MinIO / S3) for scans, cleaned pages, thumbnails and crops."""

from __future__ import annotations

import hashlib
import io
from functools import lru_cache
from typing import BinaryIO

import boto3
from botocore.client import Config

from bhumi.core.config import settings


@lru_cache
def _client(public: bool = False):
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_PUBLIC_ENDPOINT_URL if public else settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(signature_version="s3v4"),
    )


def ensure_buckets() -> None:
    client = _client()
    for bucket in (settings.S3_BUCKET_DOCUMENTS, settings.S3_BUCKET_MODELS):
        try:
            client.head_bucket(Bucket=bucket)
        except Exception:
            client.create_bucket(Bucket=bucket)


def sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def build_key(*parts: str) -> str:
    return "/".join(str(p).strip("/") for p in parts if p)


def put_bytes(key: str, data: bytes, content_type: str = "application/octet-stream") -> str:
    _client().put_object(
        Bucket=settings.S3_BUCKET_DOCUMENTS,
        Key=key,
        Body=data,
        ContentType=content_type,
        ServerSideEncryption="AES256",
    )
    return key


def put_fileobj(key: str, fileobj: BinaryIO, content_type: str = "application/octet-stream") -> str:
    _client().upload_fileobj(
        fileobj,
        settings.S3_BUCKET_DOCUMENTS,
        key,
        ExtraArgs={"ContentType": content_type, "ServerSideEncryption": "AES256"},
    )
    return key


def get_bytes(key: str) -> bytes:
    obj = _client().get_object(Bucket=settings.S3_BUCKET_DOCUMENTS, Key=key)
    return obj["Body"].read()


def get_stream(key: str) -> io.BytesIO:
    return io.BytesIO(get_bytes(key))


def delete(key: str) -> None:
    _client().delete_object(Bucket=settings.S3_BUCKET_DOCUMENTS, Key=key)


def exists(key: str) -> bool:
    try:
        _client().head_object(Bucket=settings.S3_BUCKET_DOCUMENTS, Key=key)
        return True
    except Exception:
        return False


def presigned_get(key: str, expires: int | None = None) -> str:
    """Signed URL the browser can load directly — the API never proxies image bytes."""
    return _client(public=True).generate_presigned_url(
        "get_object",
        Params={"Bucket": settings.S3_BUCKET_DOCUMENTS, "Key": key},
        ExpiresIn=expires or settings.PRESIGN_EXPIRY_SECONDS,
    )


def presigned_put(key: str, content_type: str, expires: int | None = None) -> dict[str, str]:
    url = _client(public=True).generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.S3_BUCKET_DOCUMENTS,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires or settings.PRESIGN_EXPIRY_SECONDS,
    )
    return {"url": url, "key": key, "method": "PUT"}
