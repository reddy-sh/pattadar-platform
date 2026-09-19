"""AI document reading for services/api.

One place for everything this service does with a model: prompts, the provider
adapter, cost accounting, the consent gate and the five read operations.
`docs/architecture/ai-inventory.yaml` is the machine-readable index of this and
every other AI surface in the platform.

Deliberately NOT here: the durable queue itself (ai_reading/jobs.py owns the
`document_read_jobs` table and the no-automatic-retry worker) and the
conversational agent (services/assistant). JOB_HANDLERS below is the contract
between this module and that queue.
"""
from __future__ import annotations

from . import operations, prompts, usage
from .config import CACHE_MIN_TOKENS, IMPORT_MODEL
from .consent import require_read_consent
from .routes import router

# operation name -> handler, consumed by jobs.lifecycle(). The names are
# the public `-async` route segments and must not be renamed without a
# migration: queued rows carry them.
JOB_HANDLERS = {
    "import-registered-document": operations.import_registered_document,
    "import-passbook": operations.import_passbook,
    "extract-property": operations.extract_property,
    "extract-aadhaar": operations.extract_aadhaar,
}

__all__ = [
    "CACHE_MIN_TOKENS",
    "IMPORT_MODEL",
    "JOB_HANDLERS",
    "operations",
    "prompts",
    "require_read_consent",
    "router",
    "usage",
]
