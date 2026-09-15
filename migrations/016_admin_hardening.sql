-- Vault-style time-locked role changes (Coinbase Vault / Kraken Global
-- Settings Lock pattern) and a per-user anti-phishing security phrase
-- (Coinbase/Binance pattern) shown in security emails.

CREATE TABLE IF NOT EXISTS pending_role_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  previous_role TEXT NOT NULL,
  new_role TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  cancel_token_hash TEXT NOT NULL UNIQUE,
  effective_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE users ADD COLUMN security_phrase TEXT;
