"""Assistant service (chat API) configuration.

Ported from rhub api/assistant/config.py. Differences:
- Port defaults to 8080 (pattadar service convention).
- PG_DATABASE defaults to "hub" — rhub's code default of 'rhub' was a known
  trap (deployments always use 'hub'); the safe value is now the default.
- MCP_URL defaults to EMPTY: the assistant runs with only its built-in
  navigate/page-action tools unless an MCP gateway is explicitly configured.
"""

import os
from dataclasses import dataclass


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return int(raw) if raw is not None and raw != "" else default


@dataclass
class AssistantConfig:
    # Server
    host: str = "0.0.0.0"
    port: int = 8080

    # LLM
    model: str = "claude-sonnet-4-6"
    anthropic_api_key: str = ""

    # Database (for conversations + LangGraph checkpointer)
    pg_host: str = "localhost"
    pg_port: int = 5432
    pg_user: str = ""
    pg_password: str = ""
    pg_database: str = "hub"

    # MCP (empty = skip tool loading; the supported no-MCP path)
    mcp_url: str = ""
    mcp_auth_token: str = ""  # Bearer token for an MCP gateway (service-to-service)

    # File storage
    upload_dir: str = "/tmp/assistant_uploads"
    max_upload_bytes: int = 10 * 1024 * 1024  # 10 MB

    @property
    def db_uri(self) -> str:
        parts = [f"host={self.pg_host}", f"port={self.pg_port}", f"dbname={self.pg_database}"]
        if self.pg_user:
            parts.append(f"user={self.pg_user}")
        if self.pg_password:
            parts.append(f"password={self.pg_password}")
        return " ".join(parts)

    @property
    def async_db_uri(self) -> str:
        """Connection string for psycopg async (used by LangGraph checkpointer).

        Uses libpq keyword/value format, NOT a URI. Auto-generated PG
        passwords (openssl rand -base64) routinely contain '/' and '+'
        which break URI parsing — '/' becomes the path separator and
        psycopg ends up trying to resolve the username as the hostname.
        Keyword/value avoids the encoding minefield entirely; psycopg's
        AsyncConnection.connect + AsyncPostgresSaver.from_conn_string
        both accept this format.
        """
        return self.db_uri

    @classmethod
    def from_env(cls) -> "AssistantConfig":
        return cls(
            host=os.getenv("ASSISTANT_HOST", "0.0.0.0"),
            port=_env_int("PORT", _env_int("ASSISTANT_PORT", 8080)),
            model=os.getenv("ASSISTANT_MODEL", "claude-sonnet-4-6"),
            anthropic_api_key=os.getenv("ANTHROPIC_API_KEY", ""),
            pg_host=os.getenv("PG_HOST", "localhost"),
            pg_port=_env_int("PG_PORT", 5432),
            pg_user=os.getenv("PG_USER", ""),
            pg_password=os.getenv("PG_PASSWORD", ""),
            pg_database=os.getenv("PG_DATABASE", "hub"),
            mcp_url=os.getenv("MCP_URL", "").strip(),
            mcp_auth_token=os.getenv("MCP_AUTH_TOKEN", ""),
            upload_dir=os.getenv("ASSISTANT_UPLOAD_DIR", "/tmp/assistant_uploads"),
            max_upload_bytes=_env_int("ASSISTANT_MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
        )
