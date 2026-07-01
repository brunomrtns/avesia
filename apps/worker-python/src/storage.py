"""MinIO/S3 object storage client — downloads and uploads files."""

import io

from minio import Minio

from .config import get_settings

_minio_client: Minio | None = None


def get_minio_client() -> Minio:
    global _minio_client
    if _minio_client is None:
        settings = get_settings()
        endpoint = f"{settings.minio_endpoint}:{settings.minio_port}"
        _minio_client = Minio(
            endpoint,
            access_key=settings.minio_root_user,
            secret_key=settings.minio_root_password,
            secure=False,
        )
    return _minio_client


def download_file(storage_key: str) -> bytes:
    """Download a file from MinIO and return its bytes."""
    settings = get_settings()
    client = get_minio_client()
    response = client.get_object(settings.minio_bucket, storage_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def upload_file(storage_key: str, data: bytes, content_type: str = "text/markdown") -> str:
    """Upload bytes to MinIO and return the storage key."""
    settings = get_settings()
    client = get_minio_client()
    # Ensure bucket exists
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)
    stream = io.BytesIO(data)
    client.put_object(
        settings.minio_bucket, storage_key,
        stream, length=len(data),
        content_type=content_type,
    )
    return storage_key
