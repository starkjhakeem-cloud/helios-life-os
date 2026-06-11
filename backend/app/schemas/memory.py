from typing import Any, Literal

from pydantic import BaseModel, Field

MemoryType = Literal["preference", "important_fact", "goal_context", "recurring_interest"]

VALID_MEMORY_TYPES: set[str] = {"preference", "important_fact", "goal_context", "recurring_interest"}


class MemoryCreate(BaseModel):
    memory_type: MemoryType
    content: str = Field(..., min_length=1, max_length=2000)
    extra_data: dict[str, Any] | None = None


class MemoryOut(BaseModel):
    id: str
    user_id: str
    memory_type: str
    content: str
    extra_data: dict[str, Any] | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class MemoriesResponse(BaseModel):
    memories: list[MemoryOut]
    total: int
