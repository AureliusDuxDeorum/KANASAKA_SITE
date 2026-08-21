-- Run only if 011 partially applied or columns already exist without indexes.
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/011_account_id_repair.sql

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_account_id ON users(account_id COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
