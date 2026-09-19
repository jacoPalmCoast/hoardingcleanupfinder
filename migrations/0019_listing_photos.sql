-- Listing photo gallery. Objects live in the hcf-photos R2 bucket under r2_key;
-- this table holds the metadata + display order. Photos are featured-only content:
-- an owner can upload/draft at any tier, but the public gallery renders only while
-- the listing is live-featured (same rule as long_about / custom_faq).
CREATE TABLE IF NOT EXISTS listing_photos (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id   INTEGER NOT NULL,
  r2_key       TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  width        INTEGER,
  height       INTEGER,
  bytes        INTEGER,
  alt          TEXT,
  sort         INTEGER NOT NULL DEFAULT 0,
  created_at   INTEGER NOT NULL,
  FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_listing_photos_listing ON listing_photos(listing_id, sort);
