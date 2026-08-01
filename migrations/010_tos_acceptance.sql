-- Terms of Service acceptance tracking on user accounts.
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/010_tos_acceptance.sql

ALTER TABLE users ADD COLUMN tos_accepted_at TEXT;
ALTER TABLE users ADD COLUMN tos_version TEXT;
