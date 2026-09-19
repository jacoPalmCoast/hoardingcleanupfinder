-- Visitor feedback pipeline: bug reports and improvement ideas from the public site, triaged and
-- ranked in admin, then exported as a build-run brief. cluster_key groups near-duplicate reports so
-- frequently-raised items rank up.
CREATE TABLE IF NOT EXISTS feedback (
  id          INTEGER PRIMARY KEY,
  type        TEXT NOT NULL DEFAULT 'idea',   -- bug | idea | other
  message     TEXT NOT NULL,
  email       TEXT,                            -- optional, for follow-up
  page_url    TEXT,                            -- where they were when they submitted
  status      TEXT NOT NULL DEFAULT 'new',     -- new | triaged | planned | shipped | declined
  priority    INTEGER,                         -- manual rank override (higher = more important); NULL = auto
  cluster_key TEXT,                            -- normalized signature for grouping duplicates
  admin_notes TEXT,
  session     TEXT,                            -- daily hash, dedupe/rate-limit only
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_cluster ON feedback(cluster_key);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at);
