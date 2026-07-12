-- Run: npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/003_profile.sql

ALTER TABLE users ADD COLUMN display_name TEXT;

CREATE TABLE IF NOT EXISTS user_avatars (
  user_id INTEGER PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
