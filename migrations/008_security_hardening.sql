-- Two-factor authentication (TOTP) and signed-download support metadata.
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/008_security_hardening.sql

ALTER TABLE users ADD COLUMN totp_secret TEXT;
ALTER TABLE users ADD COLUMN totp_pending_secret TEXT;
ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN totp_enabled_at TEXT;

CREATE TABLE IF NOT EXISTS twofa_backup_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_twofa_backup_codes_user_id ON twofa_backup_codes(user_id);

CREATE TABLE IF NOT EXISTS twofa_challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_hash TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_twofa_challenges_expires_at ON twofa_challenges(expires_at);
