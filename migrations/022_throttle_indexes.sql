-- Throttle lookups (functions/lib/throttle.js countRecentEvents) filter auth_events by
--   event_type = ? AND json_extract(meta, '$.<field>') = ? AND created_at > ...
-- The only index so far was (event_type, created_at), so every check scanned all recent rows
-- of that type, which gets slower exactly when someone is hammering an endpoint. These
-- expression indexes match the query text, so no code change is needed to use them.
-- npx wrangler d1 execute kanasaka-auth --remote --file=./migrations/022_throttle_indexes.sql

CREATE INDEX IF NOT EXISTS idx_auth_events_type_ip
  ON auth_events(event_type, json_extract(meta, '$.ip'), created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_type_email
  ON auth_events(event_type, json_extract(meta, '$.email'), created_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_type_user
  ON auth_events(event_type, json_extract(meta, '$.userId'), created_at);
