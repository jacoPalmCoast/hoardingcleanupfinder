// Custom Worker entrypoint. The Astro request handler is re-exported as `fetch`, and a native
// Cloudflare Cron Trigger drives the daily job via `scheduled()` — this runs inside the Worker
// runtime (worker-to-runtime, no public HTTP request), so it never touches the edge/WAF and needs
// no shared secret. POST /api/cron/run remains as a secret-guarded manual/testing trigger.
//
// The cron schedule itself lives in wrangler.jsonc under `triggers.crons`.
import { handle } from '@astrojs/cloudflare/handler';
import type { Env } from './lib/env';
import { runDailyJobs } from './lib/cron';
import { ingestEmail } from './lib/inbound';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return handle(request, env, ctx);
  },
  async scheduled(_event, _env, ctx): Promise<void> {
    ctx.waitUntil(runDailyJobs());
  },
  // Inbound support email (Cloudflare Email Routing → this Worker). ingestEmail never throws, so a
  // bad message is accepted and dropped rather than bounced back to the customer.
  async email(message, _env, _ctx): Promise<void> {
    await ingestEmail(message as unknown as import('./lib/inbound').EmailMessage);
  },
} satisfies ExportedHandler<Env>;
