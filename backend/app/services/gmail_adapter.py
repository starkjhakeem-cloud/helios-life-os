"""
Gmail API provider adapter.

V2.19 status: STUB mode (_STUB = True).
All methods return deterministic mock data. Token retrieval is architecturally
wired but no HTTP calls are made to the Gmail API.

To activate real API calls:
1. Set _STUB = False below.
2. Ensure GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, TOKEN_ENCRYPTION_KEY are in .env.
3. Ensure the user has connected via POST /integrations/google/exchange (V2.17).
4. Wire token refresh before each call (check token_expires_at vs. now).

Out of scope intentionally:
- Email sending (SMTP / Gmail send endpoint) — not implemented.
- Full message body retrieval — snippet only, matching the HELIOS email_messages schema.

Security invariants (enforced in both stub and live paths):
- Raw token values are NEVER logged.
- Raw token values are NEVER returned from any method.
- Decrypted tokens are used only for the outgoing Authorization header and
  discarded immediately after the request completes.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Controls whether real HTTP calls to the Gmail API are made.
# True  → token look-up is skipped; deterministic stub data is returned.
# False → tokens are decrypted from DB and real API calls are issued.
_STUB: bool = True

_GMAIL_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me"


# ── Domain types ───────────────────────────────────────────────────────────────

@dataclass
class GmailMessage:
    """Provider-neutral representation of a Gmail message."""
    id: str                         # Gmail message ID (opaque string)
    thread_id: str
    sender: str                     # "Name <email@example.com>"
    subject: str
    snippet: str | None             # Short preview of the message body
    received_at: str                # ISO 8601 datetime string
    importance: str                 # "low" | "normal" | "high"
    label_ids: list[str]            # e.g. ["INBOX", "UNREAD"]
    is_unread: bool


@dataclass
class GmailModifyResult:
    """Result of a modify operation (mark-as-read, archive)."""
    message_id: str
    success: bool
    label_ids: list[str]            # Label set after the modification


# ── Stub fixtures ──────────────────────────────────────────────────────────────

_STUB_MESSAGES: list[dict] = [
    {
        "id": "stub_gmail_msg_001",
        "thread_id": "stub_thread_001",
        "sender": "Alex Chen <alex.chen@company.com>",
        "subject": "Q3 Budget Review — action required",
        "snippet": "Please review the attached budget proposal and provide feedback by EOD Friday.",
        "received_at": "2026-06-12T08:00:00Z",
        "importance": "high",
        "label_ids": ["INBOX", "UNREAD"],
        "is_unread": True,
    },
    {
        "id": "stub_gmail_msg_002",
        "thread_id": "stub_thread_002",
        "sender": "Sarah Lee <s.lee@company.com>",
        "subject": "Updated project timeline",
        "snippet": "I've updated the project timeline to reflect the new requirements. Key milestones shifted by one week.",
        "received_at": "2026-06-12T05:00:00Z",
        "importance": "normal",
        "label_ids": ["INBOX", "UNREAD"],
        "is_unread": True,
    },
    {
        "id": "stub_gmail_msg_003",
        "thread_id": "stub_thread_003",
        "sender": "Michael Torres <m.torres@company.com>",
        "subject": "Feedback needed on proposal draft",
        "snippet": "Can you take a look at the attached proposal before we send it to the client?",
        "received_at": "2026-06-11T23:00:00Z",
        "importance": "high",
        "label_ids": ["INBOX", "UNREAD"],
        "is_unread": True,
    },
    {
        "id": "stub_gmail_msg_004",
        "thread_id": "stub_thread_004",
        "sender": "Jennifer Wu <j.wu@company.com>",
        "subject": "Interview schedule confirmed",
        "snippet": "Your interview is confirmed for Thursday at 2 PM. Calendar invite to follow.",
        "received_at": "2026-06-11T18:00:00Z",
        "importance": "normal",
        "label_ids": ["INBOX"],
        "is_unread": False,
    },
    {
        "id": "stub_gmail_msg_005",
        "thread_id": "stub_thread_005",
        "sender": "David Park <d.park@company.com>",
        "subject": "Weekly standup notes",
        "snippet": "Here are the notes from today's standup. Action items are highlighted in bold.",
        "received_at": "2026-06-11T10:00:00Z",
        "importance": "low",
        "label_ids": ["INBOX"],
        "is_unread": False,
    },
]


def _fixture_to_message(data: dict) -> GmailMessage:
    return GmailMessage(
        id=data["id"],
        thread_id=data["thread_id"],
        sender=data["sender"],
        subject=data["subject"],
        snippet=data.get("snippet"),
        received_at=data["received_at"],
        importance=data["importance"],
        label_ids=list(data["label_ids"]),
        is_unread=data["is_unread"],
    )


# ── Adapter ────────────────────────────────────────────────────────────────────

class GmailAdapter:
    """
    Adapter between HELIOS and the Gmail REST API.

    Each method accepts `user_id` and `db` so that when _STUB=False the adapter
    can look up the user's connected integration row, decrypt the access token,
    and issue authenticated requests.  In stub mode those parameters are unused
    and no DB read or network call occurs.

    The existing email CRUD router (app/routers/email.py) and sync simulator
    (app/services/sync_simulator.py) are unaffected — they continue to operate
    on the local email_messages table.  This adapter is the future path for
    reading and modifying messages directly on Gmail's side.

    Email sending is intentionally out of scope for this adapter.
    """

    # ── Public API ─────────────────────────────────────────────────────────────

    def list_messages(
        self,
        user_id: str,
        db: Session,
        max_results: int = 20,
        label_ids: list[str] | None = None,
    ) -> list[GmailMessage]:
        """
        Return messages from the user's Gmail inbox.

        Stub  → returns _STUB_MESSAGES, optionally filtered by label_ids.
        Real  → GET /gmail/v1/users/me/messages with bearer token.

        The Gmail API returns only message IDs in the list response; a real
        implementation batches GET /messages/{id}?format=metadata calls for
        headers. The stub returns fully-populated objects directly.
        """
        if _STUB:
            messages = [_fixture_to_message(m) for m in _STUB_MESSAGES]
            if label_ids:
                messages = [
                    m for m in messages
                    if any(lbl in m.label_ids for lbl in label_ids)
                ]
            logger.info(
                "gmail_adapter.list_messages: STUB — returning %d fixture messages for user %s.",
                len(messages[:max_results]),
                user_id,
            )
            return messages[:max_results]

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        params: dict = {"maxResults": max_results}
        if label_ids:
            params["labelIds"] = label_ids

        list_resp = httpx.get(
            f"{_GMAIL_BASE_URL}/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params=params,
            timeout=10.0,
        )
        _raise_for_gmail_error(list_resp)
        items = list_resp.json().get("messages", [])

        results: list[GmailMessage] = []
        for item in items:
            msg = self.get_message(user_id, db, item["id"], _token=access_token)
            if msg:
                results.append(msg)
        return results

    def get_message(
        self,
        user_id: str,
        db: Session,
        message_id: str,
        *,
        _token: str | None = None,
    ) -> GmailMessage | None:
        """
        Fetch a single message by its Gmail message ID.

        Stub  → searches _STUB_MESSAGES by ID; returns None if not found.
        Real  → GET /gmail/v1/users/me/messages/{id}?format=metadata with bearer token.

        `_token` is a private parameter used by `list_messages` to avoid
        re-decrypting the token on each iteration.
        """
        if _STUB:
            match = next((m for m in _STUB_MESSAGES if m["id"] == message_id), None)
            if match is None:
                logger.info(
                    "gmail_adapter.get_message: STUB — message %s not found for user %s.",
                    message_id,
                    user_id,
                )
                return None
            logger.info(
                "gmail_adapter.get_message: STUB — returning fixture for message %s, user %s.",
                message_id,
                user_id,
            )
            return _fixture_to_message(match)

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _token or _get_access_token(user_id, db)
        resp = httpx.get(
            f"{_GMAIL_BASE_URL}/messages/{message_id}",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"format": "metadata", "metadataHeaders": ["From", "Subject", "Date"]},
            timeout=10.0,
        )
        if resp.status_code == 404:
            return None
        _raise_for_gmail_error(resp)
        return _parse_api_message(resp.json())

    def mark_as_read(
        self,
        user_id: str,
        db: Session,
        message_id: str,
    ) -> GmailModifyResult:
        """
        Remove the UNREAD label from a message.

        Stub  → returns a GmailModifyResult with UNREAD removed from label_ids.
        Real  → POST /gmail/v1/users/me/messages/{id}/modify
                  { removeLabelIds: ["UNREAD"] }
        """
        if _STUB:
            base = next((m for m in _STUB_MESSAGES if m["id"] == message_id), None)
            labels_after = [
                lbl for lbl in (base["label_ids"] if base else ["INBOX"])
                if lbl != "UNREAD"
            ]
            logger.info(
                "gmail_adapter.mark_as_read: STUB — no-op for user %s, message %s.",
                user_id,
                message_id,
            )
            return GmailModifyResult(
                message_id=message_id,
                success=True,
                label_ids=labels_after,
            )

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        resp = httpx.post(
            f"{_GMAIL_BASE_URL}/messages/{message_id}/modify",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"removeLabelIds": ["UNREAD"]},
            timeout=10.0,
        )
        _raise_for_gmail_error(resp)
        data = resp.json()
        return GmailModifyResult(
            message_id=message_id,
            success=True,
            label_ids=data.get("labelIds", []),
        )

    def archive_message(
        self,
        user_id: str,
        db: Session,
        message_id: str,
    ) -> GmailModifyResult:
        """
        Remove the INBOX label from a message, effectively archiving it.

        Stub  → returns a GmailModifyResult with INBOX removed from label_ids.
        Real  → POST /gmail/v1/users/me/messages/{id}/modify
                  { removeLabelIds: ["INBOX"] }
        """
        if _STUB:
            base = next((m for m in _STUB_MESSAGES if m["id"] == message_id), None)
            labels_after = [
                lbl for lbl in (base["label_ids"] if base else ["UNREAD"])
                if lbl != "INBOX"
            ]
            logger.info(
                "gmail_adapter.archive_message: STUB — no-op for user %s, message %s.",
                user_id,
                message_id,
            )
            return GmailModifyResult(
                message_id=message_id,
                success=True,
                label_ids=labels_after,
            )

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        resp = httpx.post(
            f"{_GMAIL_BASE_URL}/messages/{message_id}/modify",
            headers={"Authorization": f"Bearer {access_token}"},
            json={"removeLabelIds": ["INBOX"]},
            timeout=10.0,
        )
        _raise_for_gmail_error(resp)
        data = resp.json()
        return GmailModifyResult(
            message_id=message_id,
            success=True,
            label_ids=data.get("labelIds", []),
        )

    def search_messages(
        self,
        user_id: str,
        db: Session,
        query: str,
        max_results: int = 20,
    ) -> list[GmailMessage]:
        """
        Search messages using Gmail query syntax (e.g. "is:unread from:boss@co.com").

        Stub  → case-insensitive substring match against sender, subject, and
                snippet across _STUB_MESSAGES.
        Real  → GET /gmail/v1/users/me/messages?q={query} with bearer token,
                followed by per-message metadata fetches.
        """
        if _STUB:
            q = query.lower()
            matched = [
                _fixture_to_message(m) for m in _STUB_MESSAGES
                if q in m["sender"].lower()
                or q in m["subject"].lower()
                or q in (m.get("snippet") or "").lower()
            ]
            logger.info(
                "gmail_adapter.search_messages: STUB — query %r matched %d fixture messages for user %s.",
                query,
                len(matched[:max_results]),
                user_id,
            )
            return matched[:max_results]

        # ── real path ──────────────────────────────────────────────────────────
        import httpx

        access_token = _get_access_token(user_id, db)
        list_resp = httpx.get(
            f"{_GMAIL_BASE_URL}/messages",
            headers={"Authorization": f"Bearer {access_token}"},
            params={"q": query, "maxResults": max_results},
            timeout=10.0,
        )
        _raise_for_gmail_error(list_resp)
        items = list_resp.json().get("messages", [])

        results: list[GmailMessage] = []
        for item in items:
            msg = self.get_message(user_id, db, item["id"], _token=access_token)
            if msg:
                results.append(msg)
        return results


# ── Private helpers ────────────────────────────────────────────────────────────

def _get_access_token(user_id: str, db: Session) -> str:
    """
    Retrieve and decrypt the user's Gmail access token from the DB.

    Only called when _STUB=False. Raises RuntimeError if no connected
    integration exists or decryption fails.

    NEVER log the returned plaintext value.
    """
    from app.models.integration import UserIntegration
    from app.services.token_encryption import TokenEncryptionError, decrypt_token

    row = db.execute(
        select(UserIntegration).where(
            UserIntegration.user_id == user_id,
            UserIntegration.provider == "gmail",
            UserIntegration.status == "connected",
        )
    ).scalar_one_or_none()

    if not row:
        raise RuntimeError(
            f"gmail_adapter: no connected integration for user {user_id}."
        )
    if not row.access_token_encrypted:
        raise RuntimeError(
            f"gmail_adapter: connected row for user {user_id} has no stored access token."
        )

    try:
        return decrypt_token(row.access_token_encrypted)
    except TokenEncryptionError as exc:
        # Log only the exception type — never log ciphertext or key material.
        logger.error(
            "gmail_adapter: token decryption failed for user %s (%s).",
            user_id,
            type(exc).__name__,
        )
        raise RuntimeError("gmail_adapter: token decryption failed.") from exc


def _raise_for_gmail_error(resp) -> None:
    """Raise RuntimeError with a safe message when the Gmail API returns an error."""
    if resp.status_code >= 400:
        raise RuntimeError(
            f"Gmail API returned HTTP {resp.status_code}: {resp.text[:200]}"
        )


def _parse_api_message(item: dict) -> GmailMessage:
    """
    Map a raw Gmail API message dict (format=metadata) to a GmailMessage.

    The metadata format includes a `payload.headers` list — we extract
    From, Subject, and Date from it.
    """
    headers: dict[str, str] = {}
    for h in item.get("payload", {}).get("headers", []):
        headers[h["name"].lower()] = h["value"]

    label_ids: list[str] = item.get("labelIds", [])
    return GmailMessage(
        id=item["id"],
        thread_id=item.get("threadId", ""),
        sender=headers.get("from", "(unknown sender)"),
        subject=headers.get("subject", "(no subject)"),
        snippet=item.get("snippet"),
        received_at=headers.get("date", datetime.now(timezone.utc).isoformat()),
        importance="high" if "IMPORTANT" in label_ids else "normal",
        label_ids=label_ids,
        is_unread="UNREAD" in label_ids,
    )


# ── Singleton ──────────────────────────────────────────────────────────────────
# Import and use directly:
#   from app.services.gmail_adapter import gmail_adapter
gmail_adapter = GmailAdapter()
