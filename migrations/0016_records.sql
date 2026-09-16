-- Tracks which listings the public-records provider (OpenCorporates) has already been queried for,
-- so the owner-name records pass doesn't re-hit the API for the same company every run. We store
-- owner/officer NAMES pulled from state business filings as people (source 'records'); we do not
-- store or expose any other filing data.
CREATE TABLE IF NOT EXISTS records_state (
  listing_id INTEGER PRIMARY KEY,
  found INTEGER NOT NULL DEFAULT 0,     -- number of officers stored on the last run
  last_run INTEGER NOT NULL DEFAULT (unixepoch())
);
