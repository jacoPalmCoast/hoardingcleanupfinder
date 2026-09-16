-- CRM overlay on the directory. Each listing is a company record; this adds the manual sales layer.
-- The interaction timeline is mostly DERIVED at read time from tables we already keep (leads,
-- emails, claims, reviews, subscription state) and merged with the manual activities below, so no
-- history needs backfilling.

-- Per-listing CRM fields. stage NULL means "derive from listing state" (prospect/claimed/featured/
-- lapsed); a set value is a manual override (e.g. 'contacted'). next_follow_up is denormalized from
-- the soonest open task for the follow-up queue.
CREATE TABLE IF NOT EXISTS crm_records (
  listing_id INTEGER PRIMARY KEY,
  stage TEXT,
  next_follow_up INTEGER,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Manual activity log: notes, logged calls, tasks/reminders, stage changes, and admin emails sent
-- from the CRM. Automatic events (lead received, email opened, review left, subscription change)
-- are derived from their own tables at read time, not duplicated here.
CREATE TABLE IF NOT EXISTS activities (
  id INTEGER PRIMARY KEY,
  listing_id INTEGER NOT NULL,
  kind TEXT NOT NULL,               -- note | call | task | stage_change | email_out
  body TEXT,
  due_at INTEGER,                   -- task: when it's due
  done INTEGER NOT NULL DEFAULT 0,  -- task: completed
  meta TEXT,                        -- optional JSON (e.g. {"from":"prospect","to":"contacted"})
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_activities_listing ON activities(listing_id, created_at);
CREATE INDEX IF NOT EXISTS idx_activities_task ON activities(done, due_at);
