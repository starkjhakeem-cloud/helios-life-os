"""semantic_memory

Revision ID: 026
Revises: 025
Create Date: 2026-06-25

Phase 3 — Semantic Memory / RAG:
  - Enables pgvector extension (PostgreSQL only; skipped gracefully otherwise)
  - Creates semantic_memories table
  - Stores JSON embeddings for portability
  - Adds a native pgvector mirror column and cosine index on PostgreSQL
  - Adds user-scoped and source-type indexes
"""

from alembic import op
import sqlalchemy as sa

revision = "026"
down_revision = "025"
branch_labels = None
depends_on = None


def _postgres_safe_execute(sql: str) -> bool:
    bind = op.get_bind()
    if bind.dialect.name != "postgresql":
        return False
    try:
        bind.execute(sa.text("SAVEPOINT semantic_memory_pgvector"))
        bind.execute(sa.text(sql))
        bind.execute(sa.text("RELEASE SAVEPOINT semantic_memory_pgvector"))
        return True
    except Exception:
        bind.execute(sa.text("ROLLBACK TO SAVEPOINT semantic_memory_pgvector"))
        bind.execute(sa.text("RELEASE SAVEPOINT semantic_memory_pgvector"))
        return False


def upgrade() -> None:
    # Enable pgvector — only works in PostgreSQL; safe to skip elsewhere.
    _postgres_safe_execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "semantic_memories",
        sa.Column("id",               sa.String(),              nullable=False),
        sa.Column("user_id",          sa.String(),              nullable=False),
        sa.Column("source_type",      sa.String(50),            nullable=False),
        sa.Column("source_id",        sa.String(),              nullable=False),
        sa.Column("title",            sa.String(500),           nullable=False),
        sa.Column("content",          sa.Text(),                nullable=False),
        sa.Column("content_summary",  sa.Text(),                nullable=True),
        sa.Column("embedding",        sa.JSON(),                nullable=True),
        sa.Column("extra_metadata",   sa.JSON(),                nullable=True),
        sa.Column(
            "importance_score",
            sa.Float(),
            nullable=False,
            server_default="0.5",
        ),
        sa.Column("created_at",       sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at",       sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_accessed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            ondelete="CASCADE",
            name="fk_semantic_memories_user_id",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "source_type", "source_id",
            name="uq_semantic_memory_source",
        ),
    )

    op.create_index("ix_semantic_memories_user_id",         "semantic_memories", ["user_id"])
    op.create_index("ix_semantic_memories_user_source_type","semantic_memories", ["user_id", "source_type"])
    if _postgres_safe_execute("ALTER TABLE semantic_memories ADD COLUMN embedding_vector vector(1536)"):
        if not _postgres_safe_execute(
            "CREATE INDEX ix_semantic_memories_embedding_hnsw "
            "ON semantic_memories USING hnsw (embedding_vector vector_cosine_ops)"
        ):
            _postgres_safe_execute(
                "CREATE INDEX ix_semantic_memories_embedding_ivfflat "
                "ON semantic_memories USING ivfflat (embedding_vector vector_cosine_ops) WITH (lists = 100)"
            )


def downgrade() -> None:
    _postgres_safe_execute("DROP INDEX IF EXISTS ix_semantic_memories_embedding_hnsw")
    _postgres_safe_execute("DROP INDEX IF EXISTS ix_semantic_memories_embedding_ivfflat")
    op.drop_index("ix_semantic_memories_user_source_type", table_name="semantic_memories")
    op.drop_index("ix_semantic_memories_user_id",          table_name="semantic_memories")
    op.drop_table("semantic_memories")
