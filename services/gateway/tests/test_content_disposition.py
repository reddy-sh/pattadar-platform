"""A photo whose filename is not latin-1 must still be readable.

HTTP headers are latin-1. A macOS screenshot is named
`Screenshot ... at 10.37.49<U+202F>AM.png` — that is a NARROW NO-BREAK SPACE
before the AM — and a Telugu paper carries far more. Putting either straight
into `Content-Disposition: filename="..."` makes Starlette raise
UnicodeEncodeError while building the response, so the read 500s before a
single byte of the image is sent. Every one of the user's eight uploaded
screenshots failed this way while the upload itself had worked perfectly.

`_cd` answers with RFC 6266: an ASCII-safe `filename=` anything can parse,
plus a percent-encoded `filename*=` that carries the true name.
"""
import pytest

from app.routes_storage import _cd

MACOS_SCREENSHOT = "Screenshot iPhone 17 Pro 07-26-2026 at 10.37.49 AM (2).png"
TELUGU_PAPER = "పహాణి-2025.pdf"


@pytest.mark.parametrize(
    "name",
    [MACOS_SCREENSHOT, TELUGU_PAPER, "plain.jpg", "", 'quotes"and\nbreaks.jpg'],
)
def test_header_survives_latin_1(name):
    """The exact encode Starlette does when it builds the response."""
    _cd(name).encode("latin-1")


def test_the_real_name_is_still_delivered():
    """The ASCII fallback is a fallback — the true name rides in filename*."""
    from urllib.parse import quote

    assert quote(MACOS_SCREENSHOT, safe="") in _cd(MACOS_SCREENSHOT)
    assert quote(TELUGU_PAPER, safe="") in _cd(TELUGU_PAPER)


def test_ascii_names_are_left_alone():
    assert 'filename="plain.jpg"' in _cd("plain.jpg")


def test_unencodable_characters_become_underscores():
    """Not '?' — that is illegal in a filename on Windows."""
    assert 'filename="Screenshot iPhone 17 Pro 07-26-2026 at 10.37.49_AM (2).png"' in _cd(
        MACOS_SCREENSHOT
    )


def test_quotes_and_breaks_cannot_escape_the_header():
    header = _cd('evil".jpg\r\nX-Injected: 1')
    assert "\r" not in header and "\n" not in header
    assert header.count('"') == 2


def test_no_name_still_yields_a_header():
    assert 'filename="download"' in _cd("")
