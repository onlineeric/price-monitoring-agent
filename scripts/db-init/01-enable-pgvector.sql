-- Enable the pgvector extension for semantic search (RAG).
-- Runs automatically on a fresh Postgres data volume via /docker-entrypoint-initdb.d.
-- For an existing volume, run this statement manually once.
CREATE EXTENSION IF NOT EXISTS vector;
