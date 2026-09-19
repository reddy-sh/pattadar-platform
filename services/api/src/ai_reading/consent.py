"""Consent gate for AI document readings.

Moved verbatim from services/api/src/main.py (AI consolidation, Phase 1).
Submission and the queue worker both check consent, so a consent withdrawn
while a document waits still stops the paid call.
"""
from __future__ import annotations

from .. import account
from . import jobs


async def require_read_consent(request):
    # Internal jobs check consent at submission and again before execution.
    if request is not None:
        uid = jobs.owner(request)
        await account.require_purpose(uid, "document_processing")
        await account.require_purpose(uid, "ai_extraction")
