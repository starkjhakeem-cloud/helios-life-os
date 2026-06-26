from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.ai.assistant_context_service import AssistantContextService, extract_time_window, infer_context_type
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.user import User

router = APIRouter()


@router.get("/preview")
def preview_context(
    message: str = Query(..., max_length=500, description="Message to preview context for"),
    context_type: str | None = Query(default=None, description="Optional explicit context type override"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """
    Debug endpoint: returns the full structured context package that would be
    assembled for a given message, plus the summarized prompt string.

    Only returns data belonging to the authenticated user.
    No raw tokens, encrypted credentials, or secret values are included.
    """
    svc = AssistantContextService(db)
    ctx = svc.build_context_for_message(
        user_id=current_user.id,
        message=message,
        context_type=context_type,
    )
    return {
        "context_package":    ctx,
        "summarized_prompt":  svc.summarize_context_for_prompt(ctx),
        "debug": {
            "inferred_context_type": infer_context_type(message),
            "time_window_detected":  extract_time_window(message) is not None,
        },
    }
