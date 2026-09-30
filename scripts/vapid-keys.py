#!/usr/bin/env python3
"""Print a fresh VAPID key pair for browser push (services/api/src/inbox.py).

    .local/api-venv/bin/python scripts/vapid-keys.py

The private key is a secret: put it in the API's environment (locally in your
own untracked env file; in AWS through Secrets Manager, which is an
infrastructure change and needs approval). Rotating it invalidates every
existing browser subscription; owners turn notifications on again.
"""
import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec


def b64(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


key = ec.generate_private_key(ec.SECP256R1())
public = key.public_key().public_bytes(
    serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
private = key.private_numbers().private_value.to_bytes(32, "big")
print(f"VAPID_PUBLIC_KEY={b64(public)}")
print(f"VAPID_PRIVATE_KEY={b64(private)}")
print("VAPID_SUBJECT=mailto:support@pattadar.com")
