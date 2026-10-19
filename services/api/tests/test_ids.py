import uuid

from src.ids import uuid7


def test_uuid7_is_rfc9562_version_7():
    u = uuid.UUID(uuid7())
    assert u.version == 7 and u.variant == uuid.RFC_4122


def test_uuid7_carries_the_given_millisecond_and_orders_by_it():
    ms = 1_760_000_000_123
    assert uuid.UUID(uuid7(ms)).int >> 80 == ms
    ids = [uuid7(ms + i) for i in range(50)]
    assert ids == sorted(ids)
    assert len({uuid7(ms) for _ in range(100)}) == 100
