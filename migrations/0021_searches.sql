-- Visitor search logging: what people look for, and whether the results had a featured seller.
-- Powers the admin demand view (top searches + cities/services with demand but no featured listing).
-- Query text is a location string a visitor typed; not PII, kept short.
CREATE TABLE IF NOT EXISTS searches (
  id         INTEGER PRIMARY KEY,
  q          TEXT,                 -- normalized query (city / state / zip the visitor typed)
  service    TEXT,                 -- selected service slug, or '' for any
  is_zip     INTEGER NOT NULL DEFAULT 0,
  results_n  INTEGER NOT NULL DEFAULT 0,
  featured_n INTEGER NOT NULL DEFAULT 0,  -- how many of the results were featured
  session    TEXT,
  country    TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_searches_created ON searches(created_at);
CREATE INDEX IF NOT EXISTS idx_searches_q ON searches(q, service);
