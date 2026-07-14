-- Wipe all accounts and auth state. Keeps table schema intact.
-- IRREVERSIBLE — back up first if you care about existing data.
--
-- cd ~/KANASAKA_SITE
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/007_wipe_accounts.sql

PRAGMA foreign_keys = ON;

DELETE FROM sessions;
DELETE FROM email_tokens;
DELETE FROM user_avatars;
DELETE FROM users;
DELETE FROM auth_events;
DELETE FROM rate_limits;
