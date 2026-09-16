"""Lazy bge-m3 query embedding compatible with the boundary vector corpus."""
from __future__ import annotations

import asyncio
import importlib.util
import sys
from functools import lru_cache

from .exceptions import EmbeddingUnavailable
from .settings import PublicRecordSettings


def dependency_available() -> bool:
    """Check package presence without importing or loading the large model."""
    return importlib.util.find_spec("sentence_transformers") is not None


@lru_cache(maxsize=2)
def _get_model(model_name: str, configured_device: str):
    try:
        from sentence_transformers import SentenceTransformer
    except ImportError as exc:
        raise EmbeddingUnavailable("Semantic boundary search is temporarily unavailable.") from exc

    device = configured_device
    if device == "auto":
        device = "mps" if sys.platform == "darwin" else "cpu"
    try:
        model = SentenceTransformer(model_name, device=device)
    except Exception as first_error:
        if device == "cpu":
            raise EmbeddingUnavailable(
                "Semantic boundary search is temporarily unavailable."
            ) from first_error
        try:
            model = SentenceTransformer(model_name, device="cpu")
        except Exception as exc:
            raise EmbeddingUnavailable(
                "Semantic boundary search is temporarily unavailable."
            ) from exc
    model.max_seq_length = 512
    return model


def _embed(text: str, settings: PublicRecordSettings) -> list[float]:
    model = _get_model(settings.embed_model, settings.embed_device)
    vector = model.encode([text], normalize_embeddings=True, convert_to_numpy=True)[0].tolist()
    if len(vector) != settings.embed_dimensions:
        raise EmbeddingUnavailable("Semantic boundary search is temporarily unavailable.")
    return vector


async def embed_query(text: str, settings: PublicRecordSettings) -> list[float]:
    if not settings.embeddings_enabled or not dependency_available():
        raise EmbeddingUnavailable("Semantic boundary search is temporarily unavailable.")
    return await asyncio.to_thread(_embed, text, settings)


def to_vector_literal(vector: list[float]) -> str:
    return "[" + ",".join(f"{float(value):.6f}" for value in vector) + "]"
