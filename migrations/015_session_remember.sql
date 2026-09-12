-- "Stay logged in" support: persist the user's choice across session rotation.
-- Without this column, sessions always behave as if remember=true once rotated
-- (a safe fallback, not a security gap — see functions/lib/schema.js).

ALTER TABLE sessions ADD COLUMN remember INTEGER NOT NULL DEFAULT 1;
ALTER TABLE twofa_challenges ADD COLUMN remember INTEGER NOT NULL DEFAULT 1;
