import uuid
from typing import TypedDict

import bcrypt


class StoredUser(TypedDict):
    id: str
    name: str
    email: str
    hashed_password: str


class InMemoryUserStore:
    """
    Single-process in-memory store. Replaced by a DB repository in a future phase.
    Not thread-safe by design — uvicorn dev server runs single-threaded.
    """

    def __init__(self) -> None:
        self._users: dict[str, StoredUser] = {}  # keyed by normalised email

    def create(self, name: str, email: str, password: str) -> StoredUser:
        if email in self._users:
            raise ValueError("Email already registered.")
        hashed = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        user: StoredUser = {
            "id": str(uuid.uuid4()),
            "name": name,
            "email": email,
            "hashed_password": hashed,
        }
        self._users[email] = user
        return user

    def authenticate(self, email: str, password: str) -> StoredUser | None:
        user = self._users.get(email)
        if user is None:
            return None
        if not bcrypt.checkpw(password.encode(), user["hashed_password"].encode()):
            return None
        return user


user_store = InMemoryUserStore()
