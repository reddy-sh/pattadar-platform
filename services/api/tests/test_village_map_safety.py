"""What a village map upload is allowed to do to the service and to the
browsers it is later served to. Anyone signed in can post a KMZ.
"""

import io
import sys
import zipfile
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import village_map as vm

RING = ("79.3191900,15.6602600,0 79.3194400,15.6607200,0 "
        "79.3217700,15.6656700,0 79.3191900,15.6602600,0")


def kml_of(*names: str) -> str:
    blocks = "".join(
        f"<Placemark><name>{n}</name><Polygon><outerBoundaryIs><LinearRing>"
        f"<coordinates>{RING}</coordinates>"
        "</LinearRing></outerBoundaryIs></Polygon></Placemark>"
        for n in names)
    return ("<?xml version='1.0'?><kml><Document><name>CHINTHAGUNTA</name>"
            f"{blocks}</Document></kml>")


def kmz_of(kml: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("doc.kml", kml)
    return buf.getvalue()


# ── The zip that unpacks to gigabytes ─────────────────────────────────

def test_kmz_bomb_is_refused_before_it_is_read(monkeypatch):
    monkeypatch.setattr(vm, "KML_MAX", 4096)
    bomb = kmz_of("<kml>" + "<a/>" * 20_000 + "</kml>")
    assert len(bomb) < 4096                  # compressed, it clears the route's cap

    with pytest.raises(ValueError) as exc:
        vm.kml_from_bytes(bomb)
    assert "64 MB" in str(exc.value)


def test_a_village_under_the_ceiling_still_reads(monkeypatch):
    monkeypatch.setattr(vm, "KML_MAX", 4096)
    kml = kml_of("74")
    assert len(kml) < 4096
    assert vm.kml_from_bytes(kmz_of(kml)) == kml


def test_real_kmz_ceiling_is_64mb():
    assert vm.KML_MAX == 64 * 1024 * 1024


def test_kmz_without_a_kml_still_says_so():
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("readme.txt", "nothing here")
    with pytest.raises(ValueError) as exc:
        vm.kml_from_bytes(buf.getvalue())
    assert "no .kml" in str(exc.value)


# ── The plot number is served to every reader of the village ──────────

def plot(lp: str) -> dict:
    return {"lp": lp, "ring": [[79.31919, 15.66026], [79.31944, 15.66072],
                               [79.32177, 15.66567], [79.31919, 15.66026]]}


@pytest.mark.parametrize("lp", ["74", "74/1", "74-A", "112 B", "1.2", "74/1-A"])
def test_real_plot_numbers_survive(lp):
    collection, dropped, _ = vm.feature_collection("CHINTHAGUNTA", [plot(lp)])
    assert dropped == 0
    assert collection["features"][0]["properties"]["lp"] == lp


@pytest.mark.parametrize("lp", [
    '<img src=x onerror=alert(1)>',
    '74"><script>alert(1)</script>',
    "74\n<svg onload=alert(1)>",
    "javascript:alert(1)",
    "7" * 33,
])
def test_a_number_that_is_not_one_is_dropped(lp):
    collection, dropped, _ = vm.feature_collection("CHINTHAGUNTA", [plot(lp)])
    assert collection["features"] == []
    assert dropped == 1


def test_an_injected_placemark_name_never_reaches_the_artefact():
    built = vm.convert("chinthagunta.kmz",
                       kmz_of(kml_of("74", "<img src=x onerror=alert(1)>")))
    assert [f["properties"]["lp"] for f in built["collection"]["features"]] == ["74"]
    assert built["dropped"] == 1
    assert "<img" not in vm.dumps(built["collection"])
