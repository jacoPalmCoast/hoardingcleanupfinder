-- Support inbox. A public support form and any advertiser reply lands here as a ticket with a
-- threaded message history. listing_id is set when the sender's email matches a known listing/owner.
CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER,               -- linked company, when the email matches one
  from_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',   -- open | closed
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status, updated_at);
CREATE INDEX IF NOT EXISTS idx_tickets_listing ON tickets(listing_id, created_at);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  direction TEXT NOT NULL,          -- in (from customer) | out (admin reply)
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages ON ticket_messages(ticket_id, created_at);
