from pydantic import BaseModel


class AgentProfile(BaseModel):
    id: str
    name: str
    role: str
    status: str
    description: str
    priority: int


class AgentsResponse(BaseModel):
    agents: list[AgentProfile]
