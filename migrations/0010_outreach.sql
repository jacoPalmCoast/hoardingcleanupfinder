-- Outreach engine: personalized campaigns to convert free listings to featured. Sending is
-- deliberately inert until the marketing prerequisites are set (Resend domain verified + FROM_EMAIL
-- moved off the shared sender + MAILING_ADDRESS for the CAN-SPAM footer); the daily cron only sends
-- for campaigns marked 'sending', throttled, and every send is suppression-checked.
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  segment TEXT NOT NULL,            -- unclaimed | claimed_not_featured | lapsed | all_with_email
  subject TEXT NOT NULL,
  body TEXT NOT NULL,               -- supports {{name}} {{city}} {{state}} {{claim_url}} {{featured_url}}
  status TEXT NOT NULL DEFAULT 'draft',  -- draft | sending | paused | done
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS outreach_sends (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed | suppressed
  sent_at INTEGER,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_sends_campaign ON outreach_sends(campaign_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_sends_unique ON outreach_sends(campaign_id, listing_id);
