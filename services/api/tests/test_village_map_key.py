"""map_key() is the Python twin of mapKey() in packages/core. The same vectors
are pinned in scripts/geo-tests.ts; keep the two lists in step."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import village_map as vm


def test_every_level_is_folded():
    assert vm.map_key("AP", "MARKAPURAM", "Konakanamitla", "CHINTHAGUNTA") \
        == "ap/markapuram/konakanamitla/chintagunta"


def test_same_village_in_two_mandals_is_two_keys():
    assert vm.map_key("AP", "BAPATLA", "Addanki", "MYLAVARAM") \
        != vm.map_key("AP", "PRAKASAM", "Chimakurthi", "MYLAVARAM")


def test_spacing_and_punctuation_fold_away():
    assert vm.map_key("AP", "MARKAPURAM", "Peda  Araveedu", "AMBAPURAM") \
        == "ap/markapuram/pedaravedu/ambapuram"
    assert vm.map_key("AP", "PRAKASAM", "ONGOLE (Rural)", "X Palem") \
        == "ap/prakasam/ongolerural/xpalem"


def test_a_missing_level_is_no_key():
    assert vm.map_key("AP", "", "Addanki", "MYLAVARAM") == ""
    assert vm.map_key("AP", "BAPATLA", "Addanki", "") == ""


def test_key_is_safe_as_an_object_path():
    key = vm.map_key("AP", "../etc", "a/b", "<script>")
    assert key == "ap/etc/ab/script"
