-- Email enrichment. Candidate addresses discovered per listing (from the company's own website,
-- role-pattern guesses on a validated domain, or a paid provider), each with source, deliverability
-- signals and a confidence score. The scraped listings.email is left untouched; outreach/CRM prefer
-- the promoted 'primary' candidate.
CREATE TABLE IF NOT EXISTS email_candidates (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  source TEXT NOT NULL,               -- mailto | website | guess | hunter | listing
  confidence INTEGER NOT NULL DEFAULT 0,   -- 0-100
  mx_ok INTEGER,                      -- 1 domain resolves MX, 0 none, NULL unchecked
  is_role INTEGER NOT NULL DEFAULT 0, -- info@/contact@/office@ etc
  is_free INTEGER NOT NULL DEFAULT 0, -- gmail/yahoo/outlook etc
  is_disposable INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'candidate', -- candidate | verified | primary | rejected
  checked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_candidates_uniq ON email_candidates(listing_id, email);
CREATE INDEX IF NOT EXISTS idx_email_candidates_listing ON email_candidates(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_email_candidates_status ON email_candidates(status);

-- Per-listing crawl state so the backlog is processed once and resumably.
CREATE TABLE IF NOT EXISTS enrichment_state (
  listing_id INTEGER PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | done | no_site | error
  found INTEGER NOT NULL DEFAULT 0,        -- candidates found this listing
  attempts INTEGER NOT NULL DEFAULT 0,
  last_run INTEGER,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_enrichment_state_status ON enrichment_state(status);

-- Cache of domain -> MX result so we don't re-query DNS for shared domains.
CREATE TABLE IF NOT EXISTS domain_mx (
  domain TEXT PRIMARY KEY,
  mx_ok INTEGER NOT NULL,
  checked_at INTEGER NOT NULL DEFAULT (unixepoch())
);
