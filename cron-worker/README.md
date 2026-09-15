# hcf-cron — daily scheduler

A standalone Cloudflare Worker that fires once a day (Cron Trigger) and calls the site's
`POST /api/cron/run` endpoint with a bearer secret. Separate from the main site worker because the
Astro Cloudflare adapter owns that worker's entrypoint (fetch only).

## One-time deploy (from this folder, same Cloudflare account as the site)
    cd cron-worker
    npx wrangler deploy
    npx wrangler secret put CRON_SECRET      # paste the same value set on the site as CRON_SECRET

## Requirements
- The site must have `CRON_SECRET` set (dashboard → hoardingcleanupfinder Worker → Settings → Variables, as a Secret). Use the same value here.
- Schedule: `0 13 * * *` (daily 13:00 UTC ≈ 9am ET). Edit `triggers.crons` to change.

## Verify
- Cloudflare dashboard → Workers → hcf-cron → Triggers shows the cron.
- Trigger a manual run from the dashboard, or test the endpoint directly:
      curl -s -X POST https://hoardingcleanupfinder.com/api/cron/run -H "authorization: Bearer <CRON_SECRET>"
  → `{"ok":true,"ran":["db_ping"],...}`
