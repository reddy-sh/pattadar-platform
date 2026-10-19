"""Write catalogue.json: the API's baseline servicesOffered and disciplines.

The sealed suite answers every /api call from fixtures, so its catalogue must
be the server's, not a hand copy (it drifted to six of twelve services once).
Regenerate after any change to services/api/src/catalogue.py, associates.py
or governance serviceVisuals:

    cd services/api && LC_ALL=C ../../.local/api-venv/bin/python \
        ../../tests/e2e-app/fixtures/catalogue-dump.py
"""
import json
import pathlib
import sys

sys.path.insert(0, "src")
import associates  # noqa: E402
import governance  # noqa: E402
import web360  # noqa: E402
from catalogue import SERVICE_CATALOGUE  # noqa: E402


def offer(k: str, v: dict) -> dict:
    vis = web360._service_visual_for(k, governance.BASELINE_DOCUMENT, "IN/AP/*/*/*")
    return {
        "key": k, "label": v["label"], "price": v["price"], "group": v["group"],
        "blurb": v["blurb"], "days": int(v["days"]), "shelves": list(v["shelves"]),
        "fields": [{"name": n, "label": lb, "kind": ty, "required": req,
                    "options": list(opts), "help": hlp}
                   for (n, lb, ty, req, opts, hlp) in v["fields"]],
        "visual": {"assetKey": vis.asset_key, "src": vis.src, "alt": vis.alt,
                   "caption": vis.caption, "sourceScope": vis.source_scope},
        "deliverable": v["deliverable"], "filesTo": v["files_to"],
        "aliases": list(v["aliases"]), "perRecord": v["per_record"],
        "directionsField": v["directions_field"],
        "guides": [{"state": st, "slug": g.get("slug", ""), "topic": g.get("topic", ""),
                    "title": g.get("title", ""), "ownPaper": g.get("own_paper", True)}
                   for st, targets in v["guides"].items() for g in targets],
        "synonyms": list(v["synonyms"]), "alsoCalled": v["also_called"],
        "flatPriceNote": v["flat_price_note"], "featured": v["featured"],
    }


out = {
    "offers": [offer(k, v) for k, v in SERVICE_CATALOGUE.items()],
    "disciplines": [{"key": d.key, "label": d.label, "blurb": web360._discipline_blurb(d),
                     "kinds": list(d.kinds), "areaGrain": d.grain,
                     "credential": d.credential, "fanout": d.fanout}
                    for d in associates.DISCIPLINES.values()],
}
path = pathlib.Path(__file__).with_name("catalogue.json")
path.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n")
print(f"wrote {path}: {len(out['offers'])} offers, {len(out['disciplines'])} disciplines")
