"""A thumbnail must not be remade from scratch by every card that shows it.

There is no stored derivative in this service: `?thumb=<px>` decodes the whole
original with Pillow and re-encodes a JPEG on every single request. The
response used to carry no ETag, no Cache-Control and no Last-Modified — so
nothing was ever cached and nothing could ever answer 304. One property grid is
forty cards; a click into a record and straight back was forty more full
decodes of forty full-size photographs.

The tag is taken over the ORIGINAL bytes plus the transform that was asked for,
so the 304 can be answered ABOVE the decode instead of below it.
"""
from src.routes.storage import _CACHE, _content_etag

JPEG = b"\xff\xd8\xff\xe0" + b"pretend this is a photograph" * 40


def test_the_same_bytes_and_the_same_ask_agree():
    assert _content_etag(JPEG, "web", 512) == _content_etag(JPEG, "web", 512)


def test_replacing_the_file_changes_the_tag():
    assert _content_etag(JPEG, None, None) != _content_etag(JPEG + b"!", None, None)


def test_a_thumbnail_never_answers_for_the_original():
    """The worst failure this guards is not a stale image — it is the RIGHT
    image at the wrong size. A 512px card thumbnail served in place of a
    full-size download is a silent corruption, not a cache hit."""
    full = _content_etag(JPEG, None, None)
    small = _content_etag(JPEG, None, 512)
    large = _content_etag(JPEG, None, 1024)
    assert len({full, small, large}) == 3


def test_a_transcode_is_its_own_entity_too():
    """`format=web` turns a HEIC into a JPEG. Same bytes in, different bytes
    out, so it cannot share a tag with the untransformed read."""
    assert _content_etag(JPEG, "web", None) != _content_etag(JPEG, None, None)


def test_the_tag_is_a_quoted_http_entity_tag():
    """Unquoted it is not a valid ETag and browsers ignore it — which fails
    silently, as "the cache just never works", rather than as an error."""
    tag = _content_etag(JPEG, None, 256)
    assert tag.startswith('"') and tag.endswith('"')
    assert len(tag) == 26            # 24 hex characters plus the two quotes
    tag.encode("latin-1")            # headers are latin-1, as _cd knows


def test_the_policy_revalidates_rather_than_freezing():
    """A node's content can be replaced in place when no version is pinned, so
    a long immutable cache would leave a grid of photographs nobody can
    correct. Private, because these bytes are behind a Bearer token and must
    never be held by a shared proxy."""
    assert "private" in _CACHE
    assert "must-revalidate" in _CACHE
    assert "immutable" not in _CACHE
