-- KS_Link account unification: KANASAKA_SITE becomes an OAuth *provider* for
-- the first time (it only ever consumed OAuth before, for Alpaca brokerage
-- -- see functions/lib/alpaca-oauth.js). code_hash mirrors email_tokens'
-- token_hash column: the raw code is never stored, only hashSecret()'s
-- output, so a DB read alone can't mint a session.
CREATE TABLE IF NOT EXISTS oauth_authorizations (
  code_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorizations_expires_at ON oauth_authorizations(expires_at);
