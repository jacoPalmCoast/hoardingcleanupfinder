-- Plan interval + amount (in cents) captured from Stripe at featured-sync time, so the admin billing
-- view and the owner billing summary can show plan and MRR without a live Stripe API call per page.
ALTER TABLE listings ADD COLUMN plan_interval TEXT;
ALTER TABLE listings ADD COLUMN plan_amount INTEGER;
