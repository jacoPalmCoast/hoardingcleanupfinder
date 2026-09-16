-- Observability for the daily cron: one row per runDailyJobs() so scheduled execution is verifiable
-- (the admin overview shows the latest). Without this, a silent cron failure is invisible.
CREATE TABLE IF NOT EXISTS cron_runs (
  id INTEGER PRIMARY KEY,
  ran TEXT NOT NULL,                 -- the "job:count" summary line
  ok INTEGER NOT NULL DEFAULT 1,     -- 0 if any job errored
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_cron_runs_created ON cron_runs(created_at);
