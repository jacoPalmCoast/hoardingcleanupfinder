-- Inbound email → support tickets. Lets a customer email support@ (routed to the Worker via
-- Cloudflare Email Routing) and have it land as a ticket with attachments. Known senders (matching
-- a listing/owner email) auto-open; unknown senders are held as 'pending' for review.

-- ref_token: short unique token embedded in outbound reply subjects as [HCF-<token>] so a customer's
--   reply threads back onto the same ticket instead of opening a new one.
-- source: 'form' (public support form) | 'email' (inbound email).
-- status now also takes 'pending' (held for review) alongside 'open' | 'closed' (TEXT — no change needed).
ALTER TABLE tickets ADD COLUMN ref_token TEXT;
ALTER TABLE tickets ADD COLUMN source TEXT NOT NULL DEFAULT 'form';
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_ref_token ON tickets(ref_token) WHERE ref_token IS NOT NULL;

-- email_msgid: the inbound message's Message-ID header, used to dedupe (an email provider may deliver
-- the same message more than once). NULL for form-created messages (multiple NULLs stay distinct).
ALTER TABLE ticket_messages ADD COLUMN email_msgid TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_msg_msgid ON ticket_messages(email_msgid) WHERE email_msgid IS NOT NULL;

-- Files a customer attached to an inbound email. Bytes live in a PRIVATE R2 bucket (binding ATTACH);
-- this table holds only metadata + the R2 object key. Served only through an admin-authed route.
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id INTEGER PRIMARY KEY,
  ticket_id INTEGER NOT NULL,
  message_id INTEGER,                 -- the ticket_messages row this file arrived with
  r2_key TEXT NOT NULL,               -- object key in the ATTACH bucket (app-generated, not user input)
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_ticket_attach_ticket ON ticket_attachments(ticket_id, created_at);
CREATE INDEX IF NOT EXISTS idx_ticket_attach_msg ON ticket_attachments(message_id);
