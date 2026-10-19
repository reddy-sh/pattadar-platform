"""Names inside a Pattadar backup archive, and how a restore finds them again.

Pure and deterministic: no I/O, no clock, no randomness. The archive writer
(backup_archive.py) and its tests are the only callers, and a second
implementation must be checked against tests/fixtures/backup_names_vectors.json
rather than copied by hand.

Every file keeps the name its owner gave it, with a five-character code before
the extension:

    Sale deed 2019 · 7K3QD.pdf

The code is Crockford Base32 (digits and capitals without I, L, O and U), so it
reads aloud cleanly and survives a case-insensitive disk. It is derived from
the stored version's id, so the same file gets the same code in every backup,
and it is unique across one archive by construction, never by luck: there are
32^5 ≈ 33.5 million codes, so with merely random codes 1,000 files would clash
about 1.5% of the time and 10,000 files about 77% of the time.

The code is also how a restore matches a file the owner renamed or moved after
unzipping (`parse_code`). The JSON in the archive, not the entry name, decides
where a file goes back and under what name; the code and the cleaning below
exist only inside the archive.
"""
from __future__ import annotations

import hashlib
import mimetypes
import re
import unicodedata
from typing import Iterable

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
SEPARATOR = " · "
CODE_LENGTH = 5
#: One path segment on every common file system: 255 bytes of UTF-8. A Telugu
#: letter is three bytes, so a long Telugu name reaches this at 85 letters.
MAX_SEGMENT_BYTES = 255

# Characters Windows refuses in a name, plus control characters. "/" matters
# most: survey numbers like 45/2B are ordinary, and must never make a folder.
_ILLEGAL = re.compile(r'[<>:"/\\|?*\x00-\x1f\x7f]')
_RESERVED = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)),
             *(f"LPT{i}" for i in range(1, 10))}
# Twelve digits in three fours, optionally spaced or dashed: an Aadhaar
# number's shape. A name never carries one (invariant 8); the last four stay.
_AADHAAR = re.compile(r"(?<!\d)(\d{4})[ -]?(\d{4})[ -]?(\d{4})(?!\d)")
_EXT = re.compile(r"^(.+?)(\.[A-Za-z0-9]{1,10})$")
_CODE_AT_END = re.compile(
    r" · ([0-9A-HJKMNP-TV-Z]{5})(\.[A-Za-z0-9]{1,10})?$")

# mimetypes answers .jpe for image/jpeg on some platforms; a person expects .jpg.
_PREFERRED_EXT = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/heic": ".heic", "image/heif": ".heif",
    "image/webp": ".webp", "application/pdf": ".pdf", "video/mp4": ".mp4",
    "video/quicktime": ".mov", "text/plain": ".txt", "application/json": ".json",
    "application/vnd.google-earth.kml+xml": ".kml", "application/vnd.google-earth.kmz": ".kmz",
}


def code_for(seed: str, attempt: int = 0) -> str:
    """Five Crockford characters from the top 25 bits of SHA-256(seed:attempt)."""
    digest = hashlib.sha256(f"{seed}:{attempt}".encode()).digest()
    n = int.from_bytes(digest[:4], "big") >> 7
    return "".join(CROCKFORD[(n >> shift) & 31] for shift in (20, 15, 10, 5, 0))


def assign_codes(seeds: Iterable[str]) -> dict[str, str]:
    """A unique code per seed, in the order given.

    Callers pass seeds oldest first, so a file already in an earlier backup
    keeps its code when newer files arrive; only a newcomer that clashes moves
    on to its next attempt.
    """
    used: set[str] = set()
    out: dict[str, str] = {}
    for seed in seeds:
        if seed in out:
            continue
        attempt = 0
        code = code_for(seed, attempt)
        while code in used:
            attempt += 1
            code = code_for(seed, attempt)
        used.add(code)
        out[seed] = code
    return out


def mask_aadhaar(text: str) -> str:
    return _AADHAAR.sub(lambda m: f"XXXX XXXX {m.group(3)}", text)


def truncate_utf8(text: str, max_bytes: int) -> str:
    """`text` cut to at most `max_bytes` of UTF-8 at a code-point boundary,
    without a dangling combining mark (a Telugu vowel sign or virama) left at
    the end."""
    if max_bytes <= 0:
        return ""
    if len(text.encode()) <= max_bytes:
        return text
    cut = text.encode()[:max_bytes].decode("utf-8", errors="ignore")
    while cut and unicodedata.category(cut[-1]) in ("Mn", "Mc", "Me"):
        cut = cut[:-1]
    return cut.rstrip(" .")


def clean(name: str, fallback: str) -> str:
    """A name any of Windows, macOS and Linux will write as it is."""
    text = unicodedata.normalize("NFC", name or "")
    text = mask_aadhaar(text)
    text = _ILLEGAL.sub("-", text)
    text = " ".join(text.split())
    text = text.strip(" .")
    return text or fallback


def _reserved(stem: str) -> bool:
    return stem.split(".")[0].strip().upper() in _RESERVED


def split_extension(name: str, mime: str = "") -> tuple[str, str]:
    """('Sale deed', '.pdf'). A name without one borrows its type's extension,
    so the file still opens in the right app."""
    match = _EXT.match(name)
    if match and match.group(1).strip(" ."):
        return match.group(1), match.group(2).lower()
    mime = (mime or "").split(";")[0].strip().lower()
    ext = _PREFERRED_EXT.get(mime) or (mimetypes.guess_extension(mime) if mime else None) or ""
    return name, ext


def file_entry_name(name: str, code: str, mime: str = "") -> str:
    """'<name> · <CODE>.<ext>', within one segment's byte limit, always keeping
    the code and the extension."""
    stem, ext = split_extension(clean(name, "File"), mime)
    suffix = f"{SEPARATOR}{code}{ext}"
    stem = truncate_utf8(stem, MAX_SEGMENT_BYTES - len(suffix.encode())) or "File"
    return stem + suffix


def folder_segment(name: str) -> str:
    text = clean(name, "Folder")
    if _reserved(text):
        # Windows reserves the device name with ANY extension ("COM1.old"), so
        # the mark goes on the device name itself, not at the end.
        stem, dot, rest = text.partition(".")
        text = f"{stem.rstrip()}_{dot}{rest}"
    return truncate_utf8(text, MAX_SEGMENT_BYTES) or "Folder"


def unique_folder_segments(siblings: Iterable[tuple[str, str]]) -> dict[str, str]:
    """Segment names for folders that share a parent, keyed by folder id.

    A folder keeps its plain name unless another sibling would land on the
    same name once cleaned and case-folded ("Deeds" and "deeds", "45/2B" and
    "45-2B"); then it takes a code too, so paths stay readable.
    """
    taken: set[str] = set()
    out: dict[str, str] = {}
    for folder_id, name in siblings:
        segment = folder_segment(name)
        attempt = 0
        while segment.casefold() in taken:
            code = code_for(folder_id, attempt)
            base = truncate_utf8(folder_segment(name), MAX_SEGMENT_BYTES - len((SEPARATOR + code).encode()))
            segment = f"{base}{SEPARATOR}{code}"
            attempt += 1
        taken.add(segment.casefold())
        out[folder_id] = segment
    return out


def parse_code(entry_name: str) -> str | None:
    """The code at the end of a file's name, or None. Only the LAST code
    counts: a person may have named a file something code-like themselves."""
    base = entry_name.rsplit("/", 1)[-1]
    match = _CODE_AT_END.search(base)
    return match.group(1) if match else None


def safe_entry_path(path: str) -> bool:
    """True when an archive entry path cannot escape the folder it unpacks
    into: relative, no '..', no empty or dot segments, no backslashes, no
    drive letters, no control characters."""
    if not path or path.startswith("/") or "\\" in path or "\x00" in path:
        return False
    if re.match(r"^[A-Za-z]:", path):
        return False
    parts = path.rstrip("/").split("/")
    return all(part not in ("", ".", "..") and not _ILLEGAL.search(part) for part in parts)
