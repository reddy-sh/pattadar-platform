"""A principal id is never a person's name.

First-contact paths seed `users.name` with the uid, and a group's self row
used to copy it — so Families & groups printed "Head: subject_f3fc…" and the
same string as a member. `_real_name` is the guard every read goes through.
"""
from src import main

UID = "subject_" + "a" * 64


def test_principal_id_is_not_a_name():
    assert main._real_name(UID, UID) == ""
    # Another account's principal, too — the pattern, not just equality.
    assert main._real_name("subject_" + "b" * 64, UID) == ""


def test_uid_and_blank_are_not_names():
    assert main._real_name("owner.local", "owner.local") == ""
    assert main._real_name("   ", UID) == ""
    assert main._real_name("", UID) == ""


def test_a_real_name_survives_trimmed():
    assert main._real_name("  Shankar Reddy ", UID) == "Shankar Reddy"
    # Only a full 64-hex principal is refused; a name that starts alike is not.
    assert main._real_name("subject_matter", UID) == "subject_matter"
