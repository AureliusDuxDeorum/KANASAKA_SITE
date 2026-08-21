-- Unique public account ID and role for permission assignment.
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/011_account_id.sql
--
-- SQLite/D1 cannot ADD COLUMN ... UNIQUE — add columns first, then unique index.

ALTER TABLE users ADD COLUMN account_id TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
