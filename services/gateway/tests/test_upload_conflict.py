"""Uploading the same paper twice must not destroy the first copy.

`create_file` folds a same-named upload into the existing file as a new
version. That is right for "here is a better scan of this"; it is wrong for a
land vault, where two originals of one deed is an ordinary thing to hold — the
second upload silently replaced the first one's bytes, and the workaround was
renaming files by hand to `deed2.pdf`, `deed3.pdf`.

These cover the naming rule that lets both live. The database path around it
(`on_conflict=`) is a two-line branch over this function.
"""
import pytest

from app.storage_service import StorageConflict, next_free_name


def test_first_duplicate_becomes_2():
    taken = {"deed.pdf"}
    assert next_free_name("deed.pdf", lambda c: c in taken) == "deed (2).pdf"


def test_suffix_goes_before_the_extension():
    """`deed.pdf (2)` would not open on a desktop."""
    taken = {"deed.pdf"}
    assert next_free_name("deed.pdf", lambda c: c in taken).endswith(".pdf")


def test_skips_names_already_in_use():
    taken = {"deed.pdf", "deed (2).pdf", "deed (3).pdf"}
    assert next_free_name("deed.pdf", lambda c: c in taken) == "deed (4).pdf"


def test_file_with_no_extension():
    taken = {"scan"}
    assert next_free_name("scan", lambda c: c in taken) == "scan (2)"


def test_dotted_name_keeps_only_the_last_segment_as_extension():
    taken = {"sale.deed.2024.pdf"}
    assert next_free_name("sale.deed.2024.pdf", lambda c: c in taken) == "sale.deed.2024 (2).pdf"


def test_gives_up_rather_than_looping_forever():
    with pytest.raises(StorageConflict):
        next_free_name("deed.pdf", lambda _c: True)
