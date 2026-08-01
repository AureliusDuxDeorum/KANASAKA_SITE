-- SMS two-factor authentication (replaces TOTP authenticator flow).
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/009_sms_two_factor.sql

ALTER TABLE users ADD COLUMN phone_e164 TEXT;
ALTER TABLE users ADD COLUMN phone_pending_e164 TEXT;

CREATE TABLE IF NOT EXISTS sms_otp_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sms_otp_codes_user_purpose ON sms_otp_codes(user_id, purpose);
CREATE INDEX IF NOT EXISTS idx_sms_otp_codes_expires_at ON sms_otp_codes(expires_at);
