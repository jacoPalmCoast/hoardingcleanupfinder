-- People at each company (owner/contact names + roles) for personalized outreach. Extracted from
-- the company's own site (schema.org Person data, team/about pages), inferred from personal email
-- local-parts, or provided by Hunter. Confidence-scored; the best is flagged is_primary.
CREATE TABLE IF NOT EXISTS people (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  role TEXT,                          -- Owner, President, Manager, … (normalized where possible)
  email TEXT,                         -- linked email when known
  source TEXT NOT NULL,               -- schema | team_page | email_infer | hunter
  confidence INTEGER NOT NULL DEFAULT 0,
  is_primary INTEGER NOT NULL DEFAULT 0,   -- best contact for personalization
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_people_uniq ON people(listing_id, name);
CREATE INDEX IF NOT EXISTS idx_people_listing ON people(listing_id, is_primary);
