from typing import Literal

from pydantic import BaseModel

NotificationEventType = Literal[
    "new_suggestion",
    "queue_item_created",
    "approval_required",
    "execution_blocked",
    "execution_completed",
    "execution_failed",
]


class NotificationOut(BaseModel):
    id: str
    user_id: str
    event_type: str
    title: str
    body: str | None
    is_read: bool
    related_queue_item_id: str | None
    action_type: str | None
    created_at: str

    model_config = {"from_attributes": True}


class NotificationListResponse(BaseModel):
    notifications: list[NotificationOut]
    total: int
    unread_count: int
