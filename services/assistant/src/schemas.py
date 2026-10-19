"""Pydantic models for the Assistant API."""

from datetime import datetime
from typing import Annotated, Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Conversations ──────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: Optional[str] = None
    # Retained for wire compatibility; the service always applies the
    # administrator-selected model and ignores this browser-supplied value.
    model: Optional[str] = None
    application_context: dict[str, Any] = Field(default_factory=dict)


class ConversationUpdate(BaseModel):
    title: Optional[str] = None
    status: Optional[str] = None  # active | archived | deleted


class ConversationOut(BaseModel):
    id: UUID
    user_id: str
    title: Optional[str]
    model: str
    status: str
    application_context: dict[str, Any]
    message_count: int
    created_at: datetime
    updated_at: datetime


class ConversationListOut(BaseModel):
    conversations: list[ConversationOut]


# ── Chat ───────────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    conversation_id: UUID
    message: str
    # A model from the admin-enabled assistant catalog (GET /api/models);
    # anything else is refused. MCP servers remain platform-admin policy.
    model: Optional[str] = None
    application_context: dict[str, Any] = Field(default_factory=dict)
    attachment_ids: list[UUID] = Field(default_factory=list)
    enabled_servers: Optional[list[str]] = None
    run_id: Optional[UUID] = None
    # Regenerate / Edit & resend: the earlier run this turn redoes. Its question
    # and answer leave the model's context now and the stored history once the
    # new reply is saved, so history matches what the reader saw.
    replaces_run_id: Optional[UUID] = None


class IncognitoTurn(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(max_length=8_000)


class IncognitoChatRequest(BaseModel):
    """A chat turn that is never stored: the browser holds the history."""

    message: str = Field(min_length=1, max_length=8_000)
    history: list[IncognitoTurn] = Field(default_factory=list, max_length=20)
    model: Optional[str] = None
    application_context: dict[str, Any] = Field(default_factory=dict)


# ── Save offers and refine ─────────────────────────────────────────────────────

class ProposalResult(BaseModel):
    """One outcome. Save card: index (0-9, the item), record_id, error, stake.
    Service request card: index (0-79, position in the placed list),
    record_id, service (the offer key or name ordered), order_id, order_ref,
    error."""

    index: int = Field(ge=0, le=79)
    record_id: Optional[str] = Field(default=None, max_length=64)
    error: Optional[str] = Field(default=None, max_length=300)
    service: Optional[str] = Field(default=None, max_length=120)
    order_id: Optional[str] = Field(default=None, max_length=64)
    order_ref: Optional[str] = Field(default=None, max_length=64)
    #: Save card only: the stake the record was saved with (the reader may
    #: change the model's draft stake, per card or per item), so a reloaded
    #: card groups and names a holding by what was actually saved.
    stake: Optional[str] = Field(default=None, pattern="^(owned|managed|watch)$")


class ProposalUpdate(BaseModel):
    """What the browser did with a confirmation card. A record, not a permission.

    Save cards report saved|partial|dismissed; service request cards report
    ordered|partial|dismissed (the endpoint refuses the other kind's word)."""

    status: str = Field(pattern="^(saved|ordered|partial|dismissed)$")
    results: list[ProposalResult] = Field(default_factory=list, max_length=80)
    #: Save cards only: the holding the browser grouped the saved records into
    #: (createCombinedProperty, through the user's own session). Set once.
    holding_id: Optional[str] = Field(default=None, max_length=64, pattern=r"^[A-Za-z0-9_.:-]{1,64}$")


class PartySearchRequest(BaseModel):
    """Zero-model refine of a party search (the facet checkboxes)."""

    name: str = Field(min_length=1, max_length=120)
    villages: list[Annotated[str, Field(max_length=80)]] = Field(default_factory=list, max_length=10)
    sro: Optional[str] = Field(default=None, max_length=80)
    min_similarity: float = Field(default=0.6, ge=0.5, le=1.0)
    side: Optional[str] = Field(default=None, pattern="^(claimant|executant)$")
    conversation_id: Optional[UUID] = None
    incognito: bool = False


# ── Attachments ────────────────────────────────────────────────────────────────

class AttachmentOut(BaseModel):
    id: UUID
    conversation_id: UUID
    user_id: str
    file_name: str
    mime_type: Optional[str]
    file_size: Optional[int]
    attachment_type: str
    created_at: datetime


# ── Messages (from LangGraph state) ───────────────────────────────────────────

class MessageOut(BaseModel):
    role: str  # human | ai | tool
    content: str
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    tool_call_id: Optional[str] = None
    name: Optional[str] = None
    timestamp: Optional[datetime] = None
