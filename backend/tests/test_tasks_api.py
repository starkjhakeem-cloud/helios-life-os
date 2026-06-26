import uuid
from datetime import datetime, timezone

from app.models.semantic_memory import SemanticMemory


def test_task_update_survives_semantic_indexing_integrity_failure(client, monkeypatch):
    signup = client.post(
        "/api/v1/auth/signup",
        json={
            "name": "Task Index Guard",
            "email": f"task-index-{uuid.uuid4().hex[:8]}@example.com",
            "password": "Password123!",
        },
    )
    assert signup.status_code == 201
    headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}

    create = client.post("/api/v1/tasks", json={"title": "Original title"}, headers=headers)
    assert create.status_code == 201
    task = create.json()

    def fail_with_poisoned_session(self, indexed_task):
        now = datetime.now(timezone.utc)
        duplicate_payload = {
            "user_id": indexed_task.user_id,
            "source_type": "task",
            "source_id": indexed_task.id,
            "title": indexed_task.title,
            "content": indexed_task.title,
            "content_summary": indexed_task.title,
            "embedding": None,
            "extra_metadata": {},
            "importance_score": 0.5,
            "created_at": now,
            "updated_at": now,
        }
        self.db.add_all(
            [
                SemanticMemory(id=str(uuid.uuid4()), **duplicate_payload),
                SemanticMemory(id=str(uuid.uuid4()), **duplicate_payload),
            ]
        )
        self.db.flush()

    monkeypatch.setattr(
        "app.routers.tasks.SemanticMemoryService.index_task",
        fail_with_poisoned_session,
    )

    update = client.patch(
        f"/api/v1/tasks/{task['id']}",
        json={"title": "Updated title"},
        headers=headers,
    )

    assert update.status_code == 200
    assert update.json()["title"] == "Updated title"

    follow_up = client.get("/api/v1/tasks", headers=headers)
    assert follow_up.status_code == 200
    assert [item["title"] for item in follow_up.json()["tasks"]] == ["Updated title"]
