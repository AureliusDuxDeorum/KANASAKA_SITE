-- Unique public account ID and role for permission assignment.
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/011_account_id.sql

ALTER TABLE users ADD COLUMN account_id TEXT UNIQUE COLLATE NOCASE;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
