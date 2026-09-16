-- Social / profile links discovered on a company's own website (Facebook, Instagram, LinkedIn,
-- Yelp, X, YouTube, TikTok, BBB, Google). We store the links (useful context + sometimes a personal
-- profile); we do NOT scrape those platforms (login-walled, bot-blocked, against their terms).
CREATE TABLE IF NOT EXISTS social_links (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  platform TEXT NOT NULL,             -- facebook | instagram | linkedin | x | yelp | youtube | tiktok | bbb | google
  url TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_uniq ON social_links(listing_id, url);
CREATE INDEX IF NOT EXISTS idx_social_listing ON social_links(listing_id);

-- Track which listings the AI extraction pass has already attempted (so it doesn't retry forever).
ALTER TABLE enrichment_state ADD COLUMN ai_done INTEGER NOT NULL DEFAULT 0;
