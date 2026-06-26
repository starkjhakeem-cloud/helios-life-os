import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.ai.assistant_context_service import AssistantContextService
from app.ai.factory import get_ai_provider
from app.ai.types import HeliosAIError
from app.db.session import get_db
from app.dependencies.auth import get_current_user
from app.models.conversation import Conversation, ConversationMessage
from app.models.user import User
from app.schemas.conversations import (
    ConversationDetail,
    ConversationSummary,
    MessageRequest,
    MessageResponse,
    StoredMessage,
)

router = APIRouter()

_EMPTY_META = json.dumps({
    "suggested_actions": [],
    "follow_up_questions": [],
    "recommended_actions": [],
    "provider": None,
})


def _ai_error_detail(exc: RuntimeError) -> str | dict:
    if isinstance(exc, HeliosAIError):
        return exc.public_detail()
    return "HELIOS AI is temporarily unavailable. Please try again shortly."


def _parse_meta(raw: str | None) -> dict:
    if not raw:
        return {"suggested_actions": [], "follow_up_questions": [], "recommended_actions": [], "provider": None}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, ValueError):
        return {"suggested_actions": [], "follow_up_questions": [], "recommended_actions": [], "provider": None}


def _to_stored(msg: ConversationMessage) -> StoredMessage:
    meta = _parse_meta(msg.meta)
    return StoredMessage(
        id=msg.id,
        role=msg.role,  # type: ignore[arg-type]
        content=msg.content,
        suggested_actions=meta.get("suggested_actions") or [],
        follow_up_questions=meta.get("follow_up_questions") or [],
        recommended_actions=meta.get("recommended_actions") or [],
        provider=meta.get("provider"),
        created_at=msg.created_at.isoformat(),
    )


@router.get("", response_model=list[ConversationSummary])
def list_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[ConversationSummary]:
    """List all conversations for the current user, most recent first."""
    rows = db.execute(
        select(
            Conversation.id,
            Conversation.title,
            Conversation.created_at,
            Conversation.updated_at,
            func.count(ConversationMessage.id).label("message_count"),
        )
        .outerjoin(ConversationMessage, ConversationMessage.conversation_id == Conversation.id)
        .where(Conversation.user_id == current_user.id)
        .group_by(
            Conversation.id,
            Conversation.title,
            Conversation.created_at,
            Conversation.updated_at,
        )
        .order_by(Conversation.updated_at.desc())
    ).all()

    return [
        ConversationSummary(
            id=row.id,
            title=row.title,
            message_count=row.message_count,
            created_at=row.created_at.isoformat(),
            updated_at=row.updated_at.isoformat(),
        )
        for row in rows
    ]


@router.post("", response_model=ConversationDetail, status_code=status.HTTP_201_CREATED)
def create_conversation(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetail:
    """Create a new empty conversation. Title will be set from the first message."""
    now = datetime.now(timezone.utc)
    conv = Conversation(
        id=str(uuid.uuid4()),
        user_id=current_user.id,
        title="New Conversation",
        created_at=now,
        updated_at=now,
    )
    db.add(conv)
    db.commit()
    db.refresh(conv)
    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        messages=[],
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
    )


@router.get("/{conversation_id}", response_model=ConversationDetail)
def get_conversation(
    conversation_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ConversationDetail:
    """Return a conversation with all its messages. 404 if not owned by current user."""
    conv = db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    msgs = db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc())
    ).scalars().all()

    return ConversationDetail(
        id=conv.id,
        title=conv.title,
        messages=[_to_stored(m) for m in msgs],
        created_at=conv.created_at.isoformat(),
        updated_at=conv.updated_at.isoformat(),
    )


@router.post("/{conversation_id}/messages", response_model=MessageResponse)
def send_message(
    conversation_id: str,
    payload: MessageRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageResponse:
    """
    Send a user message to a conversation and receive an AI reply.
    Both messages are persisted. Ownership is enforced — no cross-user access.
    """
    conv = db.execute(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == current_user.id,
        )
    ).scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    now = datetime.now(timezone.utc)

    # Fetch existing messages BEFORE adding the new one so they form the history
    # context Claude will receive. Cap at the 20 most recent messages (10 turns)
    # to stay well within token limits.
    prior_msgs = db.execute(
        select(ConversationMessage)
        .where(ConversationMessage.conversation_id == conversation_id)
        .order_by(ConversationMessage.created_at.asc())
    ).scalars().all()

    history: list[dict] = [
        {"role": m.role, "content": m.content}
        for m in prior_msgs[-20:]
    ]

    # Auto-title from first user message (before we add it, so count == 0 means first)
    existing_count = len(prior_msgs)

    # Persist user message
    user_msg = ConversationMessage(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        user_id=current_user.id,
        role="user",
        content=payload.message,
        meta=_EMPTY_META,
        created_at=now,
    )
    db.add(user_msg)

    if existing_count == 0 and conv.title == "New Conversation":
        raw = payload.message.strip()
        conv.title = raw[:97] + "..." if len(raw) > 97 else raw

    # Agenda/schedule/priority questions always need live context even when the
    # user hasn't toggled context mode — auto-detect them here.
    _AGENDA_TRIGGERS = frozenset({
        "agenda", "my schedule", "today's schedule", "today's agenda",
        "my priorities", "priorities for today", "priorities today",
        "overdue", "do i have", "what do i have",
        "what should i do", "what should i focus",
        "my tasks", "my goals", "focus on today",
        "plan for today", "today's tasks", "this morning",
        "what do i need to do", "how am i doing",
    })
    _msg_lower = payload.message.lower()
    _is_agenda = any(t in _msg_lower for t in _AGENDA_TRIGGERS)

    # Always build structured context — gives the AI full situational awareness
    # regardless of whether the client toggled include_context. Agenda intent
    # is forwarded as context_type so the provider formats a structured reply.
    effective_context_type = payload.context_type or ("agenda" if _is_agenda else None)
    _svc = AssistantContextService(db)
    _ctx = _svc.build_context_for_message(
        user_id=current_user.id,
        message=payload.message,
        context_type=effective_context_type,
    )
    user_context: str | None = _svc.summarize_context_for_prompt(_ctx) or None
    effective_context_type = _ctx["retrieval_metadata"]["context_type"]

    # Generate AI reply, passing conversation history for multi-turn coherence
    try:
        ai_resp = get_ai_provider().generate_chat_reply(
            message=payload.message,
            user_name=current_user.name,
            context_type=effective_context_type,
            user_context=user_context,
            history=history,
        )
    except RuntimeError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=_ai_error_detail(exc))

    # Persist assistant reply
    reply_time = datetime.now(timezone.utc)
    assistant_meta = json.dumps({
        "suggested_actions": ai_resp.suggested_actions,
        "follow_up_questions": ai_resp.follow_up_questions,
        "recommended_actions": [a.model_dump() for a in ai_resp.recommended_actions],
        "provider": ai_resp.provider,
    })
    assistant_msg = ConversationMessage(
        id=str(uuid.uuid4()),
        conversation_id=conversation_id,
        user_id=current_user.id,
        role="assistant",
        content=ai_resp.reply,
        meta=assistant_meta,
        created_at=reply_time,
    )
    db.add(assistant_msg)

    # Bump conversation updated_at so it sorts to the top of the list
    conv.updated_at = reply_time
    db.commit()
    db.refresh(user_msg)
    db.refresh(assistant_msg)

    return MessageResponse(
        user_message=_to_stored(user_msg),
        assistant_message=_to_stored(assistant_msg),
        conversation_id=conversation_id,
    )
