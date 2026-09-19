"""HTTP surfaces exposed by the gateway.

One module per surface. Each router is assembled in ``src/main.py``; nothing
here reaches into another route module's internals except the storage helpers
that ``capabilities`` deliberately reuses.

The gateway is the identity boundary: every module here strips client-supplied
identity headers and forwards only the principal derived from a validated
Cognito token. ``proxy`` is the only module that talks to another service.
"""
