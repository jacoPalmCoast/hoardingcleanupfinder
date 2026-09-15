-- P0 email foundation: send log + suppression list.

CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  stream TEXT NOT NULL DEFAULT 'txn',      -- txn | marketing
  type TEXT,                                -- login_code, claim_code, lead_company, payment_failed, outreach_step1, ...
  subject TEXT,
  listing_id INTEGER,
  owner_id INTEGER,
  resend_id TEXT,
  status TEXT NOT NULL,                      -- sent | failed | suppressed
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  delivered_at INTEGER,
  opened_at INTEGER,
  clicked_at INTEGER,
  bounced_at INTEGER,
  complained_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_emails_to ON emails(to_email);
CREATE INDEX IF NOT EXISTS idx_emails_resend ON emails(resend_id);
CREATE INDEX IF NOT EXISTS idx_emails_type_created ON emails(type, created_at);

-- Any address here is never sent MARKETING mail. Transactional mail (login/claim codes,
-- receipts) ignores this list — a suppressed user must still be able to sign in.
CREATE TABLE IF NOT EXISTS suppressions (
  email TEXT PRIMARY KEY,                    -- always stored lowercased
  reason TEXT NOT NULL,                       -- unsubscribe | bounce | complaint
  source TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
