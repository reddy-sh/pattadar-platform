"""A person found by the jump box opens on the side of the People tab they are on."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from src import web360 as w


def test_person_hit_opens_staff_side_with_their_drawer():
    assert w._person_hit_route("w-sy-214-2", "w-person-1") == (
        "/properties/w-sy-214-2/people?section=staff&person=w-person-1")


def test_person_hit_route_escapes_ids():
    assert w._person_hit_route("a/b", "p&q=1") == (
        "/properties/a%2Fb/people?section=staff&person=p%26q%3D1")
