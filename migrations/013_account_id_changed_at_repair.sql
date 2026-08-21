-- Run if 013 partially applied (column exists, backfill may not have run).
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/013_account_id_changed_at_repair.sql

UPDATE users
SET account_id_changed_at = COALESCE(created_at, datetime('now'))
WHERE account_id IS NOT NULL
  AND account_id_changed_at IS NULL;
