-- Billing lifecycle: invoice history, per-listing dunning clock, and native cancel state.

-- Whether the current subscription is set to cancel at the end of the paid period. Synced from
-- Stripe (cancel_at_period_end). The listing stays featured until featured_until either way; this
-- just drives the "cancels on <date>" copy and the Resume button.
ALTER TABLE listings ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;

-- When the current run of failed payments began (first invoice.payment_failed). NULL when the
-- account is in good standing. The daily dunning job counts days from here: emails for 7 days,
-- then demote to free. Cleared on invoice.paid or once demoted.
ALTER TABLE listings ADD COLUMN dunning_started_at INTEGER;

-- Invoice history mirrored from Stripe (via webhooks + an admin backfill). Read-only reflection of
-- Stripe; Stripe remains the source of truth. Powers the advertiser billing page and admin /billing.
CREATE TABLE IF NOT EXISTS invoices (
  id                 TEXT PRIMARY KEY,      -- Stripe invoice id (in_...)
  listing_id         INTEGER,
  customer_id        TEXT,
  subscription_id    TEXT,
  number             TEXT,                  -- human-facing invoice number
  status             TEXT,                  -- paid | open | uncollectible | void | draft
  amount_due         INTEGER,               -- cents
  amount_paid        INTEGER,               -- cents
  currency           TEXT,
  hosted_invoice_url TEXT,
  invoice_pdf        TEXT,
  period_start       INTEGER,
  period_end         INTEGER,
  created            INTEGER,               -- Stripe invoice creation time (unix seconds)
  synced_at          INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_listing ON invoices(listing_id, created DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_customer ON invoices(customer_id);
