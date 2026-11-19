-- Email and authenticator-app two-factor become independent methods an account
-- can have at the same time (the user picks one at sign-in). This flag records
-- "email codes are enabled"; users.totp_enabled stays "any method is enabled".
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/020_twofa_email_method.sql
--
-- The site keeps working before this is applied (it falls back to the old
-- "email unless a phone or authenticator is set" rule); adding a second method
-- to an account needs it.

ALTER TABLE users ADD COLUMN twofa_email_enabled INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET twofa_email_enabled = 1
WHERE totp_enabled = 1 AND phone_e164 IS NULL AND totp_secret IS NULL;
