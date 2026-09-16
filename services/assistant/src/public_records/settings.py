"""Configuration for the internal, read-only public-record corpus."""
from __future__ import annotations

import re
from dataclasses import dataclass

_IDENTIFIER = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _identifier(value: str, field: str) -> str:
    value = value.strip()
    if not _IDENTIFIER.fullmatch(value):
        raise ValueError(f"{field} must be a PostgreSQL identifier")
    return value


@dataclass(frozen=True)
class PublicRecordSettings:
    """Transport-independent settings for corpus queries and embeddings."""

    database_dsn: str = ""
    schema: str = "land"
    records_table: str = "real_estate_records"
    party_table: str = "party"
    boundary_vectors_table: str = "boundary_vectors"
    query_timeout_ms: int = 25_000
    embed_model: str = "BAAI/bge-m3"
    embed_dimensions: int = 1024
    embed_device: str = "auto"
    embeddings_enabled: bool = False

    def __post_init__(self) -> None:
        object.__setattr__(self, "schema", _identifier(self.schema, "schema"))
        object.__setattr__(self, "records_table", _identifier(self.records_table, "records_table"))
        object.__setattr__(self, "party_table", _identifier(self.party_table, "party_table"))
        object.__setattr__(
            self,
            "boundary_vectors_table",
            _identifier(self.boundary_vectors_table, "boundary_vectors_table"),
        )
        if self.query_timeout_ms < 1:
            raise ValueError("query_timeout_ms must be positive")
        if self.embed_dimensions < 1:
            raise ValueError("embed_dimensions must be positive")

    @property
    def configured(self) -> bool:
        return bool(self.database_dsn.strip())

    @property
    def records_fqn(self) -> str:
        return f"{self.schema}.{self.records_table}"

    @property
    def party_fqn(self) -> str:
        return f"{self.schema}.{self.party_table}"

    @property
    def boundary_vectors_fqn(self) -> str:
        return f"{self.schema}.{self.boundary_vectors_table}"
