"""Pydantic models for the Assistant API."""

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, Field


# ── Conversations ──────────────────────────────────────────────────────────────

class ConversationCreate(BaseModel):
    title: Optional[str] = None
    model: str = "claude-sonnet-4-6"
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
    model: Optional[str] = None
    application_context: dict[str, Any] = Field(default_factory=dict)
    attachment_ids: list[UUID] = Field(default_factory=list)
    enabled_servers: Optional[list[str]] = None  # None = all enabled


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
