"""Row ids. Python 3.13 has no uuid.uuid7, so this is RFC 9562 §5.7 by hand."""
import os
import time
import uuid


def uuid7(ms: int | None = None) -> str:
    """A UUIDv7: 48-bit Unix milliseconds, version 7, variant 10, 74 random bits.

    `ms` backdates the timestamp (a migrated row keeps its created_at order)."""
    ms = time.time_ns() // 1_000_000 if ms is None else ms
    value = (ms & 0xFFFF_FFFF_FFFF) << 80 | int.from_bytes(os.urandom(10), "big")
    value = value & ~(0xF << 76) | 0x7 << 76  # version 7
    value = value & ~(0x3 << 62) | 0x2 << 62  # variant 10
    return str(uuid.UUID(int=value))
