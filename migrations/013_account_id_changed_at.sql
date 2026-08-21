-- Track when account_id was last set or changed (6-month cooldown between changes).
-- If ADD COLUMN fails with "duplicate column name", run 013_account_id_changed_at_repair.sql instead.

ALTER TABLE users ADD COLUMN account_id_changed_at TEXT;

UPDATE users
SET account_id_changed_at = COALESCE(created_at, datetime('now'))
WHERE account_id IS NOT NULL
  AND account_id_changed_at IS NULL;
