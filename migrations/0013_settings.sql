-- Editable business settings (key/value), managed from Admin → Setup. Lets business data (mailing
-- address, legal name, support contact) be changed in-app without a redeploy. Env vars remain the
-- fallback. Secrets (API keys, tokens) are NOT stored here — they stay in the dashboard.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
