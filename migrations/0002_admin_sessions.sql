CREATE TABLE IF NOT EXISTS admin_sessions (
  token TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
