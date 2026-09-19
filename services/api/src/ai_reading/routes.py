"""HTTP surface for AI document readings.

Paths, methods and payloads are exactly those previously declared inline in
services/api/src/main.py. Registration moved to a router so the operations can
be imported and tested without constructing the whole application.

The durable `-async` twins and the authenticated status poll are registered by
ai_reading/jobs.py, which owns the queue table.
"""
from __future__ import annotations

from fastapi import APIRouter

from . import operations

router = APIRouter()

# Kept as add_api_route rather than decorators so each operation has exactly
# one definition, in operations.py, and this file stays a routing table.
for _path, _endpoint in (
    ("/import-passbook", operations.import_passbook),
    ("/import-registered-document", operations.import_registered_document),
    ("/extract-property", operations.extract_property),
    ("/extract-aadhaar", operations.extract_aadhaar),
    ("/classify-parcel-photo", operations.classify_parcel_photo),
):
    router.add_api_route(_path, _endpoint, methods=["POST"])
