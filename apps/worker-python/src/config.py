"""Configuration — loaded from environment variables via pydantic-settings."""

import os
import socket
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings


def _resolve_worker_id() -> str:
    explicit = os.environ.get("WORKER_ID", "")
    if explicit:
        return explicit
    return f"{socket.gethostname()}:{os.getpid()}"


class Settings(BaseSettings):
    # App
    port: int = Field(default=3102, alias="WORKER_PORT")
    node_env: str = Field(default="development", alias="NODE_ENV")
    log_level: str = Field(default="info", alias="WORKER_LOG_LEVEL")

    # Database
    database_url: str

    # Redis
    redis_url: str

    # Worker
    worker_id: str = Field(default="", alias="WORKER_ID")

    # AI Provider
    ai_provider: str = Field(default="nvidia-nim", alias="AI_PROVIDER")
    openrouter_api_key: str = Field(default="", alias="OPENROUTER_API_KEY")
    openrouter_base_url: str = Field(default="https://openrouter.ai/api/v1", alias="OPENROUTER_BASE_URL")
    openrouter_default_model: str = Field(default="meta-llama/llama-3.3-70b-instruct", alias="OPENROUTER_DEFAULT_MODEL")
    nvidia_nim_api_key: str = Field(default="", alias="NVIDIA_NIM_API_KEY")
    nvidia_nim_base_url: str = Field(default="https://integrate.api.nvidia.com/v1", alias="NVIDIA_NIM_BASE_URL")
    nvidia_nim_default_model: str = Field(default="meta/llama-3.1-8b-instruct", alias="NVIDIA_NIM_DEFAULT_MODEL")
    ollama_base_url: str = Field(default="http://localhost:11434/v1", alias="OLLAMA_BASE_URL")
    ollama_default_model: str = Field(default="gemma3:12b", alias="OLLAMA_DEFAULT_MODEL")
    embedding_model: str = Field(default="nvidia/llama-nemotron-embed-1b-v2", alias="EMBEDDING_MODEL")

    # Worker lifecycle
    local_worker_heartbeat_interval_ms: int = Field(default=30_000, alias="LOCAL_WORKER_HEARTBEAT_INTERVAL_MS")
    local_worker_offline_threshold_ms: int = Field(default=15_000, alias="LOCAL_WORKER_OFFLINE_THRESHOLD_MS")

    # Object storage (MinIO)
    minio_endpoint: str = Field(default="localhost", alias="MINIO_ENDPOINT")
    minio_port: int = Field(default=9100, alias="MINIO_API_PORT")
    minio_root_user: str = Field(default="", alias="MINIO_ROOT_USER")
    minio_root_password: str = Field(default="", alias="MINIO_ROOT_PASSWORD")
    minio_bucket: str = Field(default="avesia", alias="S3_BUCKET")

    # Vector store
    vector_store: Literal["in-memory", "pgvector"] = Field(default="in-memory", alias="VECTOR_STORE")
    pgvector_dimensions: int = Field(default=2048, alias="PGVECTOR_DIMENSIONS")

    # Pipeline cost control
    kb_max_extraction_chunks: int = Field(default=10, alias="KB_MAX_EXTRACTION_CHUNKS")

    # Pipeline modes
    kb_entity_mode: Literal["ner", "llm"] = Field(default="ner", alias="KB_ENTITY_MODE")
    kb_summary_mode: Literal["textrank", "llm"] = Field(default="textrank", alias="KB_SUMMARY_MODE")
    kb_classify_mode: Literal["tfidf", "llm"] = Field(default="tfidf", alias="KB_CLASSIFY_MODE")

    model_config = {"env_file": ".env", "extra": "ignore", "populate_by_name": True}

    @property
    def resolved_worker_id(self) -> str:
        return self.worker_id or _resolve_worker_id()


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
