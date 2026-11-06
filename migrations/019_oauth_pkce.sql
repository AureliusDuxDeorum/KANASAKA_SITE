-- PKCE (RFC 7636, S256) for the KS_Link flow: the app proves it is the party
-- that started the login by presenting the verifier whose SHA-256 was sent
-- with the authorize request. Without it, anything that can catch the
-- ks-link:// redirect (another app registering the same scheme) could replay
-- the code against KS_Link's relay and become that user.
ALTER TABLE oauth_authorizations ADD COLUMN code_challenge TEXT;
