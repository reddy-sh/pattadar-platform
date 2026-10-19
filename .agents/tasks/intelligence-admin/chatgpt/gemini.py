"""Gemini model discovery for the admin catalog (no generation here)."""
from __future__ import annotations

import httpx

from .base import ProviderModel, register

_URL = "https://generativelanguage.googleapis.com/v1beta/models"


async def list_models(api_key: str) -> list[ProviderModel]:
    if not api_key:
        raise ValueError("Gemini API key is empty")
    found: list[ProviderModel] = []
    token = ""
    async with httpx.AsyncClient(timeout=15.0) as client:
        while True:
            params = {"pageSize": 1000}
            if token:
                params["pageToken"] = token
            response = await client.get(_URL, params=params, headers={"x-goog-api-key": api_key})
            response.raise_for_status()
            body = response.json()
            for item in body.get("models", []):
                name = item.get("name", "")
                if not name.startswith("models/gemini-") or "generateContent" not in item.get("supportedGenerationMethods", []):
                    continue
                model_id = name.removeprefix("models/")
                found.append(ProviderModel(
                    model_id=model_id, display_name=item.get("displayName") or model_id,
                    family="gemini", released_at=None,
                    context_window=item.get("inputTokenLimit"),
                    max_output_tokens=item.get("outputTokenLimit"),
                ))
            next_token = body.get("nextPageToken") or ""
            if not next_token:
                break
            if next_token == token:
                raise ValueError("Gemini model list returned a repeated page token")
            token = next_token
    return found


register("gemini", list_models)
