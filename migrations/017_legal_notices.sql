-- Reusable "we changed a policy" notice system -- publish a row once
-- (any notice_type: cookies, tos, privacy, refund, ...) and both the
-- email blast and the in-app banner pick it up automatically, no new
-- migration needed for future policy updates.
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/017_legal_notices.sql

CREATE TABLE IF NOT EXISTS legal_notices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  notice_type TEXT NOT NULL,
  version TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  emailed_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_notices_type_version
  ON legal_notices(notice_type, version);

-- One row per (user, notice_type): the version they most recently
-- acknowledged. A user is "pending" on a notice type whenever the latest
-- published version doesn't match what's in here (or there's no row yet).
CREATE TABLE IF NOT EXISTS legal_notice_acks (
  user_id INTEGER NOT NULL,
  notice_type TEXT NOT NULL,
  version TEXT NOT NULL,
  acknowledged_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, notice_type)
);
