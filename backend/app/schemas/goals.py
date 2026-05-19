from pydantic import BaseModel, Field


class GoalCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    status: str = "active"
    target_date: str | None = None


class GoalUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    status: str | None = None
    target_date: str | None = None


class GoalOut(BaseModel):
    id: str
    user_id: str
    title: str
    description: str | None
    status: str
    target_date: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class GoalsResponse(BaseModel):
    goals: list[GoalOut]
