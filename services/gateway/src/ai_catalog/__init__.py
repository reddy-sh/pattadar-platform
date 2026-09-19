"""The platform model catalog: which models any Pattadar service may use.

This is the gateway's answer to "who decides what the assistant runs on". The
authoritative state is the ``platform_models`` table; ``services/assistant``
only reads it, and treats a successful empty result as an administrator having
disabled every model rather than as a reason to fall back.

* ``routes`` — admin-only HTTP surface (fail closed, see auth.require_admin).
* ``providers`` — one adapter per provider; adding a provider is a new file
  plus ``register()``, not a change to the routes.

Note: ``providers`` here is the Python adapter package. ``model_providers`` in
SQL is a different thing — the table of configured provider rows.
"""
from .routes import router

__all__ = ["router"]
