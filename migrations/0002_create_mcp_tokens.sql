-- Migration number: 0002 	 2026-10-24T06:27:53.825Z
-- Access tokens for the MCP endpoint. The token itself is never stored: the row
-- keeps a SHA-256 digest, and `dirs` is a JSON array of title prefixes a scoped
-- token may touch.
CREATE TABLE IF NOT EXISTS mcp_tokens (
    id INTEGER PRIMARY KEY,
    label TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    mode TEXT NOT NULL,
    dirs TEXT NOT NULL DEFAULT '[]',
    createon TEXT NOT NULL,
    expireson TEXT,
    lastusedon TEXT,
    revokedon TEXT
);
