-- Native visitor reviews. Distinct from the Google rating stored on listings
-- (l.rating / l.review_count), which is Google's and attributed as such. These
-- are collected on-site, held for moderation, and shown only once approved.
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  author TEXT NOT NULL,            -- display name (public)
  rating INTEGER NOT NULL,         -- 1..5
  body TEXT NOT NULL,              -- review text (public)
  email TEXT,                      -- reviewer contact, never displayed; for abuse handling only
  ip TEXT,                         -- submitter IP at time of post; never displayed
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  moderated_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_reviews_listing_status ON reviews(listing_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_status_created ON reviews(status, created_at);
