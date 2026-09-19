-- Feedback screenshot + captured context. shot_key → object in the hcf-feedback R2 bucket (served
-- admin-only). context = JSON {full_url, viewport, device, browser, referrer, errors[]}. severity
-- applies to bug reports and feeds the ranking score.
ALTER TABLE feedback ADD COLUMN shot_key TEXT;
ALTER TABLE feedback ADD COLUMN severity TEXT;
ALTER TABLE feedback ADD COLUMN context TEXT;
