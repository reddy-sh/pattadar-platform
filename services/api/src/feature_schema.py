"""Versioned schemas for things physically present on a land record.

The registry is deliberately data, not a collection of feature-specific tables.
Postgres stores the validated attributes as JSON today; a future DynamoDB
FEATURE item can store the same map without a migration per new field.
"""
from __future__ import annotations

import json
import math
from datetime import date
from typing import Any


def _field(
    key: str, label: str, kind: str = "text", *, unit: str = "",
    placeholder: str = "", options: tuple[str, ...] = (), required: bool = False,
    depends_on: str = "", depends_value: str = "",
) -> dict[str, Any]:
    return {
        "key": key, "label": label, "kind": kind, "unit": unit,
        "placeholder": placeholder, "options": list(options), "required": required,
        "depends_on": depends_on, "depends_value": depends_value,
    }


def _type(
    key: str, label: str, category: str, icon: str,
    fields: list[dict[str, Any]], *, geometry_kind: str = "point",
) -> dict[str, Any]:
    return {
        "key": key, "label": label, "category": category, "icon": icon,
        "geometry_kind": geometry_kind, "schema_version": 1, "fields": fields,
    }


FEATURE_TYPES: tuple[dict[str, Any], ...] = (
    _type("bore", "Bore", "water", "bore", [
        _field("depthFt", "Depth", "number", unit="ft", placeholder="420"),
        _field("diameterIn", "Diameter", "number", unit="in", placeholder="5"),
        _field("casingDepthFt", "Casing depth", "number", unit="ft"),
        _field("yieldInches", "Water yield", "number", unit="in"),
        _field("drilledOn", "Drilled on", "date"),
        _field("drillerCompany", "Drilling company", placeholder="Company or contractor"),
        _field("motorInstalled", "Motor installed", "boolean"),
        _field("motorHp", "Motor power", "number", unit="HP",
               depends_on="motorInstalled", depends_value="true"),
        _field("motorPhase", "Motor phase", "select", options=("Single phase", "Three phase"),
               depends_on="motorInstalled", depends_value="true"),
        _field("motorMake", "Motor make", depends_on="motorInstalled", depends_value="true"),
        _field("motorModel", "Motor model", depends_on="motorInstalled", depends_value="true"),
        _field("pumpType", "Pump type", "select", options=("Submersible", "Jet", "Other"),
               depends_on="motorInstalled", depends_value="true"),
        _field("lastServicedOn", "Last serviced", "date",
               depends_on="motorInstalled", depends_value="true"),
    ]),
    _type("well", "Well", "water", "well", [
        _field("depthFt", "Depth", "number", unit="ft"),
        _field("diameterFt", "Diameter", "number", unit="ft"),
        _field("waterLevelFt", "Water level", "number", unit="ft"),
        _field("lined", "Lined well", "boolean"),
        _field("pumpInstalled", "Pump installed", "boolean"),
        _field("pumpHp", "Pump power", "number", unit="HP",
               depends_on="pumpInstalled", depends_value="true"),
    ]),
    _type("pond", "Pond", "water", "pond", [
        _field("areaSqFt", "Area", "number", unit="sq ft"),
        _field("depthFt", "Depth", "number", unit="ft"),
        _field("lining", "Lining", "select", options=("Earth", "Stone", "Concrete", "Plastic")),
        _field("waterSource", "Water source"),
        _field("capacityLitres", "Capacity", "number", unit="L"),
    ], geometry_kind="polygon"),
    _type("transformer", "Transformer", "power", "transformer", [
        _field("capacityKva", "Capacity", "number", unit="kVA"),
        _field("phase", "Phase", "select", options=("Single phase", "Three phase")),
        _field("owner", "Owned by", "select", options=("Utility", "Private", "Shared")),
        _field("serviceNumber", "Service number"),
        _field("manufacturer", "Manufacturer"),
        _field("serialNumber", "Serial number"),
        _field("installedOn", "Installed on", "date"),
    ]),
    _type("meter", "Meter", "power", "meter", [
        _field("meterNumber", "Meter number"),
        _field("serviceNumber", "Service number"),
        _field("provider", "Electricity provider"),
        _field("phase", "Phase", "select", options=("Single phase", "Three phase")),
        _field("sanctionedLoadKw", "Sanctioned load", "number", unit="kW"),
        _field("installedOn", "Installed on", "date"),
    ]),
    _type("solar", "Solar", "power", "solar", [
        _field("capacityKw", "Capacity", "number", unit="kW"),
        _field("panelCount", "Panels", "number"),
        _field("inverterMake", "Inverter make"),
        _field("inverterModel", "Inverter model"),
        _field("installedOn", "Installed on", "date"),
        _field("warrantyUntil", "Warranty until", "date"),
    ]),
    _type("fence", "Fence", "access", "fence", [
        _field("material", "Material", "select",
               options=("Barbed wire", "Chain link", "Stone", "Concrete", "Live fence", "Other")),
        _field("lengthM", "Length", "number", unit="m"),
        _field("heightFt", "Height", "number", unit="ft"),
        _field("installedOn", "Installed on", "date"),
    ], geometry_kind="line"),
    _type("gate", "Gate", "access", "gate", [
        _field("material", "Material"),
        _field("widthFt", "Width", "number", unit="ft"),
        _field("lockType", "Lock type"),
        _field("installedOn", "Installed on", "date"),
    ]),
    _type("shed", "Shed", "structures", "shed", [
        _field("use", "Used for"),
        _field("areaSqFt", "Built-up area", "number", unit="sq ft"),
        _field("roofMaterial", "Roof material"),
        _field("builtYear", "Built year", "number"),
    ], geometry_kind="polygon"),
    _type("house", "House", "structures", "house", [
        _field("areaSqFt", "Built-up area", "number", unit="sq ft"),
        _field("floors", "Floors", "number"),
        _field("rooms", "Rooms", "number"),
        _field("builtYear", "Built year", "number"),
        _field("occupancy", "Occupancy", "select", options=("Owner", "Tenant", "Vacant")),
    ], geometry_kind="polygon"),
    _type("compound_wall", "Compound wall", "structures", "wall", [
        _field("material", "Material"),
        _field("lengthM", "Length", "number", unit="m"),
        _field("heightFt", "Height", "number", unit="ft"),
        _field("builtYear", "Built year", "number"),
    ], geometry_kind="line"),
    _type("tree", "Tree", "planting", "tree", [
        _field("species", "Species", placeholder="Neem, mango, coconut"),
        _field("variety", "Variety"),
        _field("count", "Number of trees", "number"),
        _field("plantedYear", "Planted year", "number"),
        _field("irrigation", "Irrigation", "select", options=("Rainfed", "Drip", "Canal", "Bore", "Other")),
        _field("fruiting", "Currently fruiting", "boolean"),
        _field("annualYieldKg", "Annual yield", "number", unit="kg"),
        _field("healthNote", "Tree health note"),
    ]),
    _type("crop", "Crop", "planting", "crop", [
        _field("crop", "Crop name"),
        _field("variety", "Variety"),
        _field("areaAcres", "Area", "number", unit="ac"),
        _field("season", "Season"),
        _field("sownOn", "Sown on", "date"),
        _field("expectedHarvestOn", "Expected harvest", "date"),
        _field("irrigation", "Irrigation"),
    ], geometry_kind="polygon"),
    _type("road", "Road", "access", "road", [
        _field("surface", "Surface", "select", options=("Soil", "Gravel", "Concrete", "Bitumen")),
        _field("widthFt", "Width", "number", unit="ft"),
        _field("lengthM", "Length", "number", unit="m"),
        _field("accessType", "Access", "select", options=("Public", "Private", "Shared", "Right of way")),
    ], geometry_kind="line"),
    _type("bund", "Bund", "water", "bund", [
        _field("lengthM", "Length", "number", unit="m"),
        _field("heightFt", "Height", "number", unit="ft"),
        _field("material", "Material"),
        _field("conditionNote", "Condition note"),
    ], geometry_kind="line"),
    _type("canal", "Canal", "water", "canal", [
        _field("canalType", "Canal type", "select", options=("Government", "Private", "Field channel")),
        _field("widthFt", "Width", "number", unit="ft"),
        _field("depthFt", "Depth", "number", unit="ft"),
        _field("lengthM", "Length", "number", unit="m"),
        _field("waterSource", "Water source"),
    ], geometry_kind="line"),
    _type("custom", "Something else", "other", "feature", [
        _field("description", "Description"),
        _field("quantity", "Quantity", "number"),
        _field("installedYear", "Installed or planted year", "number"),
    ]),
)

FEATURE_TYPE_BY_KEY = {item["key"]: item for item in FEATURE_TYPES}


def infer_type_key(label: str) -> str:
    folded = " ".join((label or "").lower().replace("-", " ").split())
    aliases = {
        "borewell": "bore", "bore well": "bore", "trees": "tree",
        "compound wall": "compound_wall", "boundary wall": "compound_wall",
    }
    if folded in aliases:
        return aliases[folded]
    words = set(folded.split())
    if any(part in folded for part in ("borewell", "bore well")) or "bore" in words:
        return "bore"
    if "tree" in words or "trees" in words or "orchard" in words:
        return "tree"
    if "compound wall" in folded or "boundary wall" in folded:
        return "compound_wall"
    for item in FEATURE_TYPES:
        if item["key"] != "custom" and (
                folded == item["label"].lower() or item["key"] in words):
            return item["key"]
    return "custom"


def _load_object(raw: str, name: str) -> dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
    except (TypeError, ValueError) as exc:
        raise ValueError(f"{name} must be valid JSON") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be a JSON object")
    return value


def validate_attributes(type_key: str, raw: str) -> dict[str, Any]:
    schema = FEATURE_TYPE_BY_KEY.get(type_key)
    if not schema:
        raise ValueError("Unknown feature type")
    incoming = _load_object(raw, "attributes")
    fields = {field["key"]: field for field in schema["fields"]}
    unknown = set(incoming) - set(fields)
    if unknown:
        raise ValueError(f"Unsupported fields for {schema['label']}: {', '.join(sorted(unknown))}")

    clean: dict[str, Any] = {}
    for key, value in incoming.items():
        field = fields[key]
        dependency = field.get("depends_on") or ""
        if dependency and str(incoming.get(dependency, "")).lower() != field.get("depends_value"):
            continue
        kind = field["kind"]
        if value in (None, ""):
            continue
        if kind == "boolean":
            if not isinstance(value, bool):
                raise ValueError(f"{field['label']} must be true or false")
            clean[key] = value
        elif kind == "number":
            try:
                number = float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError(f"{field['label']} must be a number") from exc
            if not math.isfinite(number) or number < 0:
                raise ValueError(f"{field['label']} must be zero or greater")
            clean[key] = int(number) if number.is_integer() else number
        else:
            text = str(value).strip()
            if kind == "select" and text not in field["options"]:
                raise ValueError(f"Choose a listed value for {field['label']}")
            if kind == "date":
                try:
                    date.fromisoformat(text)
                except ValueError as exc:
                    raise ValueError(f"{field['label']} must be a valid date") from exc
            clean[key] = text[:500]

    missing = [f["label"] for f in schema["fields"] if f["required"] and f["key"] not in clean]
    if missing:
        raise ValueError(f"Missing required fields: {', '.join(missing)}")
    return clean


def validate_point(raw: str) -> dict[str, Any]:
    point = _load_object(raw, "geometry")
    if not point:
        return {}
    if point.get("type") != "Point":
        raise ValueError("Feature geometry must currently be a Point")
    coords = point.get("coordinates")
    if not isinstance(coords, list) or len(coords) != 2:
        raise ValueError("Point coordinates must be [longitude, latitude]")
    try:
        lon, lat = float(coords[0]), float(coords[1])
    except (TypeError, ValueError) as exc:
        raise ValueError("Point coordinates must be numbers") from exc
    if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
        raise ValueError("Point coordinates are outside the earth")
    if lat == 0 and lon == 0:
        raise ValueError("Point coordinates are not set")
    clean: dict[str, Any] = {"type": "Point", "coordinates": [lon, lat]}
    if point.get("source") in ("device", "manual", "import"):
        clean["source"] = point["source"]
    try:
        accuracy = float(point.get("accuracyM") or 0)
    except (TypeError, ValueError):
        accuracy = 0
    if math.isfinite(accuracy) and accuracy > 0:
        clean["accuracyM"] = round(accuracy, 2)
    return clean


def summary(type_key: str, attributes: dict[str, Any]) -> str:
    schema = FEATURE_TYPE_BY_KEY.get(type_key) or FEATURE_TYPE_BY_KEY["custom"]
    parts: list[str] = []
    for field in schema["fields"]:
        value = attributes.get(field["key"])
        if value in (None, "", False):
            continue
        if field["kind"] == "boolean":
            part = field["label"]
        else:
            part = str(value)
            if field["unit"]:
                part += f" {field['unit']}"
            elif field["key"] == "count":
                part += " trees"
        parts.append(part)
        if len(parts) == 3:
            break
    return " · ".join(parts)
