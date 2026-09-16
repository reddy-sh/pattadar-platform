"""Claude Agent SDK adapters for the eight internal public-record handlers."""
from __future__ import annotations

import json
import logging
from collections.abc import Awaitable
from typing import Any

from claude_agent_sdk import ToolAnnotations, create_sdk_mcp_server, tool as sdk_tool

from .exceptions import PublicRecordsError
from .service import PUBLIC_RECORD_TOOL_NAMES, PublicRecordsService

_log = logging.getLogger("pattadar.assistant.public_records")
_READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)


def _schema(
    properties: dict[str, dict[str, Any]], required: tuple[str, ...] = ()
) -> dict[str, Any]:
    schema: dict[str, Any] = {
        "type": "object",
        "properties": properties,
        "additionalProperties": False,
    }
    if required:
        schema["required"] = list(required)
    return schema


def _text_result(value: Any) -> dict[str, Any]:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
    return {"content": [{"type": "text", "text": text}]}


async def _invoke(operation: Awaitable[Any]) -> dict[str, Any]:
    try:
        return _text_result(await operation)
    except PublicRecordsError as exc:
        return {
            "content": [{"type": "text", "text": str(exc)}],
            "is_error": True,
        }
    except Exception:
        _log.exception("Internal public-record tool failed")
        return {
            "content": [
                {"type": "text", "text": "Public records are temporarily unavailable."}
            ],
            "is_error": True,
        }


def build_public_record_tools(service: PublicRecordsService) -> list[Any]:
    """Build the exact, closed-world public-record SDK tool surface."""

    @sdk_tool(
        "get_analytical_stats",
        "Compute an exact village aggregate from historical reference records. Extents remain grouped by source unit.",
        _schema(
            {
                "village": {"type": "string"},
                "metric": {
                    "type": "string",
                    "enum": ["count", "sum_market_value", "sum_consideration_value", "sum_extent"],
                },
                "year": {"type": "integer"},
                "transaction_type": {"type": "string"},
                "transaction_class": {"type": "string"},
                "land_class": {"type": "string"},
                "sro": {"type": "string"},
                "fuzzy_village": {"type": "boolean", "default": True},
            },
            ("village", "metric"),
        ),
        annotations=_READ_ONLY,
    )
    async def get_analytical_stats(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.get_analytical_stats(
                village=str(args["village"]),
                metric=args["metric"],
                year=args.get("year"),
                transaction_type=args.get("transaction_type"),
                transaction_class=args.get("transaction_class"),
                land_class=args.get("land_class"),
                sro=args.get("sro"),
                fuzzy_village=bool(args.get("fuzzy_village", True)),
            )
        )

    @sdk_tool(
        "get_property_history",
        "Return a bounded page of historical parcel transactions oldest to newest by rid, or by village and survey/plot/house number. The pagination object reports whether more rows exist; results do not establish current title.",
        _schema(
            {
                "village": {"type": "string"},
                "survey_no": {"type": "string"},
                "plot_no": {"type": "string"},
                "house_no": {"type": "string"},
                "rid": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 200, "default": 100},
                "offset": {"type": "integer", "minimum": 0, "default": 0},
            }
        ),
        annotations=_READ_ONLY,
    )
    async def get_property_history(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.get_property_history(
                village=args.get("village"),
                survey_no=args.get("survey_no"),
                plot_no=args.get("plot_no"),
                house_no=args.get("house_no"),
                rid=args.get("rid"),
                limit=int(args.get("limit", 100)),
                offset=int(args.get("offset", 0)),
            )
        )

    @sdk_tool(
        "search_semantic_boundaries",
        "Find historical records with semantically similar boundary descriptions. Each hit includes (rid, s_no) for exact lookup.",
        _schema(
            {
                "query_text": {"type": "string"},
                "village": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 5},
                "ef_search": {"type": "integer", "minimum": 1, "maximum": 1000, "default": 60},
            },
            ("query_text",),
        ),
        annotations=_READ_ONLY,
    )
    async def search_semantic_boundaries(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.search_semantic_boundaries(
                query_text=str(args["query_text"]),
                village=args.get("village"),
                limit=int(args.get("limit", 5)),
                ef_search=int(args.get("ef_search", 60)),
            )
        )

    @sdk_tool(
        "get_record_by_rid",
        "Fetch the exact structured historical record identified by rid and optional s_no.",
        _schema(
            {
                "rid": {"type": "string"},
                "s_no": {"type": "integer"},
            },
            ("rid",),
        ),
        annotations=_READ_ONLY,
    )
    async def get_record_by_rid(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.get_record_by_rid(str(args["rid"]), args.get("s_no"))
        )

    @sdk_tool(
        "resolve_village",
        "Resolve a misspelled village to canonical historical-corpus candidates with record counts.",
        _schema(
            {
                "name": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 5},
            },
            ("name",),
        ),
        annotations=_READ_ONLY,
    )
    async def resolve_village(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.resolve_village(str(args["name"]), int(args.get("limit", 5)))
        )

    @sdk_tool(
        "find_properties_by_party",
        "Fuzzy-match a party name in historical deeds. A match does not prove identity, ownership, or current title.",
        _schema(
            {
                "name": {"type": "string"},
                "side": {"type": "string", "enum": ["executant", "claimant"]},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100, "default": 20},
                "min_similarity": {"type": "number", "minimum": 0.5, "maximum": 1.0, "default": 0.6},
            },
            ("name",),
        ),
        annotations=_READ_ONLY,
    )
    async def find_properties_by_party(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.find_properties_by_party(
                name=str(args["name"]),
                side=args.get("side"),
                limit=int(args.get("limit", 20)),
                min_similarity=float(args.get("min_similarity", 0.6)),
            )
        )

    @sdk_tool(
        "get_price_rates",
        "Compute market-value rates by original extent unit for a village. Rates are not converted across units.",
        _schema(
            {
                "village": {"type": "string"},
                "land_class": {"type": "string"},
                "transaction_class": {"type": "string"},
                "year": {"type": "integer"},
            },
            ("village",),
        ),
        annotations=_READ_ONLY,
    )
    async def get_price_rates(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.get_price_rates(
                village=str(args["village"]),
                land_class=args.get("land_class"),
                transaction_class=args.get("transaction_class"),
                year=args.get("year"),
            )
        )

    @sdk_tool(
        "generate_report",
        "Generate a confidential historical-reference party portfolio, property dossier, or area/market report with legal limitations.",
        _schema(
            {
                "village": {"type": "string"},
                "area_sro": {"type": "string"},
                "transaction_class": {"type": "string"},
                "land_class": {"type": "string"},
                "year": {"type": "integer"},
                "party": {"type": "string"},
                "rid": {"type": "string"},
                "s_no": {"type": "integer"},
                "title": {"type": "string"},
            }
        ),
        annotations=ToolAnnotations(
            readOnlyHint=True,
            destructiveHint=False,
            idempotentHint=True,
            openWorldHint=False,
            maxResultSizeChars=500_000,
        ),
    )
    async def generate_report(args: dict[str, Any]) -> dict[str, Any]:
        return await _invoke(
            service.generate_report(
                village=args.get("village"),
                area_sro=args.get("area_sro"),
                transaction_class=args.get("transaction_class"),
                land_class=args.get("land_class"),
                year=args.get("year"),
                party=args.get("party"),
                rid=args.get("rid"),
                s_no=args.get("s_no"),
                title=args.get("title"),
            )
        )

    tools = [
        get_analytical_stats,
        get_property_history,
        search_semantic_boundaries,
        get_record_by_rid,
        resolve_village,
        find_properties_by_party,
        get_price_rates,
        generate_report,
    ]
    if tuple(tool.name for tool in tools) != PUBLIC_RECORD_TOOL_NAMES:
        raise RuntimeError("Public-record SDK tool surface does not match the closed-world contract")
    return tools


def build_public_records_server(service: PublicRecordsService):
    return create_sdk_mcp_server(
        name="pattadar-records",
        version="1.0.0",
        tools=build_public_record_tools(service),
    )
