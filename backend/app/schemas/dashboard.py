from pydantic import BaseModel


class MetricItem(BaseModel):
    value: str
    label: str
    icon: str  # SF Symbol name — validated on the frontend


class SectionItem(BaseModel):
    title: str
    icon: str  # SF Symbol name
    content: str


class DashboardSummary(BaseModel):
    metrics: list[MetricItem]
    sections: list[SectionItem]
    system_status: str
    last_updated: str  # ISO 8601 — client parses into Date
