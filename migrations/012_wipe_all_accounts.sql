-- Wipe all accounts, credentials, and auth state. Keeps table schema intact.
-- IRREVERSIBLE — back up first if you care about existing data.
--
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/012_wipe_all_accounts.sql

PRAGMA foreign_keys = ON;

DELETE FROM twofa_challenges;
DELETE FROM twofa_backup_codes;
DELETE FROM sms_otp_codes;
DELETE FROM sessions;
DELETE FROM email_tokens;
DELETE FROM user_avatars;
DELETE FROM users;
DELETE FROM auth_events;
DELETE FROM rate_limits;
