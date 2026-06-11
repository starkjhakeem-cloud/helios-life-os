from typing import Literal

from pydantic import BaseModel, Field

MessageImportance = Literal["low", "normal", "high", "urgent"]
MessageStatus = Literal["unread", "read", "archived"]
MessageSource = Literal["manual", "gmail", "outlook"]


class EmailMessageCreate(BaseModel):
    sender: str = Field(..., min_length=1, max_length=300)
    subject: str = Field(..., min_length=1, max_length=500)
    snippet: str | None = Field(default=None, max_length=2000)
    # ISO 8601, e.g. "2026-06-11T09:30:00Z"
    received_at: str = Field(..., min_length=1, max_length=50)
    importance: MessageImportance = "normal"
    status: MessageStatus = "unread"
    source: MessageSource = "manual"
    external_message_id: str | None = None


class EmailMessageUpdate(BaseModel):
    sender: str | None = Field(default=None, min_length=1, max_length=300)
    subject: str | None = Field(default=None, min_length=1, max_length=500)
    snippet: str | None = Field(default=None, max_length=2000)
    received_at: str | None = Field(default=None, min_length=1, max_length=50)
    importance: MessageImportance | None = None
    status: MessageStatus | None = None
    source: MessageSource | None = None
    external_message_id: str | None = None


class EmailMessageOut(BaseModel):
    id: str
    user_id: str
    sender: str
    subject: str
    snippet: str | None
    received_at: str
    importance: str
    status: str
    source: str
    external_message_id: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class EmailMessagesResponse(BaseModel):
    messages: list[EmailMessageOut]
    total: int
