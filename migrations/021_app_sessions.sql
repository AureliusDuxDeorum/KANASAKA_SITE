-- Sessions for native apps (KS_C1), one row per signed-in device. They are separate from the website's cookie sessions: signing in
-- from an app never ends the website session or another device, and ending one never ends the others. The token is shown to the app
-- once and stored only as hashSecret()'s output, so a database read alone cannot mint a session. `id` is the public handle used to
-- list and sign out a device; it is not derived from the token. See functions/lib/app-sessions.js and docs/SECURITY.md.
CREATE TABLE IF NOT EXISTS app_sessions (
  token_hash TEXT PRIMARY KEY,
  id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  client TEXT NOT NULL,
  device_label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions(expires_at);
