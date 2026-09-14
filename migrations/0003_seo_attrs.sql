-- Structured listing attributes (owner-editable, tiered), long-form content for featured
-- listings, and an audit log for every admin/owner change.
ALTER TABLE listings ADD COLUMN attrs TEXT NOT NULL DEFAULT '{}';
ALTER TABLE listings ADD COLUMN long_about TEXT;
ALTER TABLE listings ADD COLUMN custom_faq TEXT;

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_type TEXT NOT NULL,          -- 'admin' | 'owner' | 'system'
  actor TEXT,                        -- owner email, 'admin', or 'stripe'
  listing_id INTEGER,
  action TEXT NOT NULL,              -- e.g. 'listing.save', 'claim.approve', 'claim.revoke'
  before TEXT,                       -- JSON snapshot of changed fields
  after TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_audit_listing ON audit_log(listing_id, created_at DESC);
