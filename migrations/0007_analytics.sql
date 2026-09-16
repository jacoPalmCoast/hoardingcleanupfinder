-- First-party visitor analytics. Powers the admin site overview, per-listing performance, the
-- owner-portal panel and the monthly advertiser report. No third-party cookies, no raw IP stored —
-- `session` is a daily-rotating hash used only to count unique visitors.

-- Raw event log. One row per tracked interaction (or, for impressions, one row per results render
-- carrying a JSON list of listing ids in `ids`). Pruned by the daily cron once rolled up:
-- impressions after 14 days, everything else after 92 days. Durable counts live in events_daily.
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER,                 -- the listing acted on; NULL for site-level / impression rows
  kind TEXT NOT NULL,                 -- view | call | website | directions | impression
  session TEXT,                       -- daily hash of ip+ua; dedupes uniques, not reversible to PII
  ref TEXT,                           -- internal source ('company','city','service','search','state') or referrer host
  ua TEXT,                            -- 'mobile' | 'desktop'  (bots are filtered out before logging)
  country TEXT,                       -- Cloudflare country code, when available
  ids TEXT,                           -- impression rows only: JSON array of listing ids shown
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_events_listing ON events(listing_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_kind ON events(kind, created_at);
CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at);

-- Daily rollup: durable per-listing/per-kind counts. `day` is the unix day number (created_at/86400).
-- listing_id 0 means site-wide. `uniques` counts distinct sessions that day (from raw, before prune).
CREATE TABLE IF NOT EXISTS events_daily (
  day INTEGER NOT NULL,
  listing_id INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  uniques INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, listing_id, kind)
);
CREATE INDEX IF NOT EXISTS idx_events_daily_listing ON events_daily(listing_id, day);
CREATE INDEX IF NOT EXISTS idx_events_daily_day ON events_daily(day, kind);

-- Idempotency marker for the daily rollup: which day numbers have already been aggregated.
CREATE TABLE IF NOT EXISTS events_rollup_state (
  day INTEGER PRIMARY KEY,
  rolled_at INTEGER NOT NULL DEFAULT (unixepoch())
);
