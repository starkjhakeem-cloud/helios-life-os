from typing import Literal

from pydantic import BaseModel, Field


class ConversationSummary(BaseModel):
    id: str
    title: str
    message_count: int
    created_at: str
    updated_at: str


class StoredMessage(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    suggested_actions: list[str]
    follow_up_questions: list[str]
    recommended_actions: list[dict]
    provider: str | None
    created_at: str


class ConversationDetail(BaseModel):
    id: str
    title: str
    messages: list[StoredMessage]
    created_at: str
    updated_at: str


class MessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    context_type: str | None = None
    include_context: bool = False


class MessageResponse(BaseModel):
    user_message: StoredMessage
    assistant_message: StoredMessage
    conversation_id: str
