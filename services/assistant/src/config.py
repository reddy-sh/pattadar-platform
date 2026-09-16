"""Assistant service configuration.

Conversation storage and the historical public-record corpus use independent
connection settings. An unconfigured/unreachable corpus degrades only the
record capability; chat persistence, files, and Pattadar product help remain
available.
"""
from __future__ import annotations

import os
from dataclasses import dataclass

from psycopg.conninfo import make_conninfo


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw is not None and raw != "" else default


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    return float(raw) if raw is not None and raw != "" else default


def _env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name)
    if raw is None or raw == "":
        return default
    return raw.strip().casefold() in {"1", "true", "yes", "on"}


@dataclass
class AssistantConfig:
    # Server
    host: str = "0.0.0.0"
    port: int = 8080

    # LLM
    model: str = "claude-sonnet-4-6"
    anthropic_api_key: str = ""
    chat_timeout_seconds: float = 180.0

    # Database (conversations, ordered messages, and attachments)
    pg_host: str = "localhost"
    pg_port: int = 5432
    pg_user: str = ""
    pg_password: str = ""
    pg_database: str = "hub"

    # Separate historical public-record corpus (empty host/URL = unavailable).
    public_records_database_url: str = ""
    public_records_pg_host: str = ""
    public_records_pg_port: int = 5432
    public_records_pg_user: str = ""
    public_records_pg_password: str = ""
    public_records_pg_database: str = "pattadar"
    public_records_schema: str = "land"
    public_records_table: str = "real_estate_records"
    public_records_party_table: str = "party"
    public_records_boundary_vectors_table: str = "boundary_vectors"
    public_records_query_timeout_ms: int = 25_000
    public_records_embed_model: str = "BAAI/bge-m3"
    public_records_embed_dimensions: int = 1024
    public_records_embed_device: str = "auto"
    public_records_embeddings_enabled: bool = False

    # File storage
    upload_dir: str = "/tmp/assistant_uploads"
    max_upload_bytes: int = 10 * 1024 * 1024

    @property
    def db_uri(self) -> str:
        values: dict[str, str | int] = {
            "host": self.pg_host,
            "port": self.pg_port,
            "dbname": self.pg_database,
        }
        if self.pg_user:
            values["user"] = self.pg_user
        if self.pg_password:
            values["password"] = self.pg_password
        return make_conninfo(**values)

    @property
    def async_db_uri(self) -> str:
        """Backward-compatible alias for psycopg's libpq connection string."""
        return self.db_uri

    @property
    def public_records_db_uri(self) -> str:
        if self.public_records_database_url.strip():
            return self.public_records_database_url.strip()
        if not self.public_records_pg_host.strip():
            return ""
        values: dict[str, str | int] = {
            "host": self.public_records_pg_host,
            "port": self.public_records_pg_port,
            "dbname": self.public_records_pg_database,
        }
        if self.public_records_pg_user:
            values["user"] = self.public_records_pg_user
        if self.public_records_pg_password:
            values["password"] = self.public_records_pg_password
        return make_conninfo(**values)

    def public_record_settings(self):
        """Build the transport-independent record settings without global state."""
        from .public_records.settings import PublicRecordSettings

        return PublicRecordSettings(
            database_dsn=self.public_records_db_uri,
            schema=self.public_records_schema,
            records_table=self.public_records_table,
            party_table=self.public_records_party_table,
            boundary_vectors_table=self.public_records_boundary_vectors_table,
            query_timeout_ms=self.public_records_query_timeout_ms,
            embed_model=self.public_records_embed_model,
            embed_dimensions=self.public_records_embed_dimensions,
            embed_device=self.public_records_embed_device,
            embeddings_enabled=self.public_records_embeddings_enabled,
        )

    @classmethod
    def from_env(cls) -> "AssistantConfig":
        return cls(
            host=os.getenv("ASSISTANT_HOST", "0.0.0.0"),
            port=_env_int("PORT", _env_int("ASSISTANT_PORT", 8080)),
            model=os.getenv("ASSISTANT_MODEL", "claude-sonnet-4-6"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            chat_timeout_seconds=max(
                1.0, _env_float("ASSISTANT_CHAT_TIMEOUT_SECONDS", 180.0)
            ),
            pg_host=os.getenv("PG_HOST", "localhost"),
            pg_port=_env_int("PG_PORT", 5432),
            pg_user=os.getenv("PG_USER", ""),
            pg_password=os.getenv("PG_PASSWORD", ""),
            pg_database=os.getenv("PG_DATABASE", "hub"),
            public_records_database_url=os.getenv("PUBLIC_RECORDS_DATABASE_URL", "").strip(),
            public_records_pg_host=os.getenv("PUBLIC_RECORDS_PG_HOST", "").strip(),
            public_records_pg_port=_env_int("PUBLIC_RECORDS_PG_PORT", 5432),
            public_records_pg_user=os.getenv("PUBLIC_RECORDS_PG_USER", ""),
            public_records_pg_password=os.getenv("PUBLIC_RECORDS_PG_PASSWORD", ""),
            public_records_pg_database=os.getenv("PUBLIC_RECORDS_PG_DATABASE", "pattadar"),
            public_records_schema=os.getenv("PUBLIC_RECORDS_SCHEMA", "land"),
            public_records_table=os.getenv("PUBLIC_RECORDS_TABLE", "real_estate_records"),
            public_records_party_table=os.getenv("PUBLIC_RECORDS_PARTY_TABLE", "party"),
            public_records_boundary_vectors_table=os.getenv(
                "PUBLIC_RECORDS_BOUNDARY_VECTORS_TABLE", "boundary_vectors"
            ),
            public_records_query_timeout_ms=_env_int("PUBLIC_RECORDS_QUERY_TIMEOUT_MS", 25_000),
            public_records_embed_model=os.getenv("PUBLIC_RECORDS_EMBED_MODEL", "BAAI/bge-m3"),
            public_records_embed_dimensions=_env_int("PUBLIC_RECORDS_EMBED_DIM", 1024),
            public_records_embed_device=os.getenv("PUBLIC_RECORDS_EMBED_DEVICE", "auto"),
            public_records_embeddings_enabled=_env_bool(
                "PUBLIC_RECORDS_EMBEDDINGS_ENABLED", False
            ),
            upload_dir=os.getenv("ASSISTANT_UPLOAD_DIR", "/tmp/assistant_uploads"),
            max_upload_bytes=_env_int("ASSISTANT_MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
        )
