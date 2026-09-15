// Standalone Cloudflare Worker: the daily scheduler for hoardingcleanupfinder.com.
// Kept separate from the Astro site worker on purpose — the Astro Cloudflare adapter owns the site
// worker's entrypoint and only exports `fetch`, so a `scheduled` handler can't be added there without
// fighting the adapter. This tiny worker holds the Cron Trigger and calls the site's secret-guarded
// job endpoint over HTTPS. Deploy once (see README); it rarely changes.
export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const res = await fetch(`${env.SITE_URL || 'https://hoardingcleanupfinder.com'}/api/cron/run`, {
          method: 'POST',
          headers: { authorization: `Bearer ${env.CRON_SECRET}` },
        });
        console.log('cron run', event.cron, res.status, await res.text());
      } catch (e) {
        console.error('cron fetch failed', e && e.message);
      }
    })());
  },
};
