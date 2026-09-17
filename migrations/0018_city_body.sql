-- Bespoke local content for top metros. `intro` remains the short lede; `body` holds
-- optional richer HTML rendered on the city page for hand-written metros. Null falls back
-- to the generated LocalContext block, so most cities need no body.
ALTER TABLE cities ADD COLUMN body TEXT;
