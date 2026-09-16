// Custom Worker entrypoint. The Astro request handler is re-exported as `fetch`, and a native
// Cloudflare Cron Trigger drives the daily job via `scheduled()` — this runs inside the Worker
// runtime (worker-to-runtime, no public HTTP request), so it never touches the edge/WAF and needs
// no shared secret. POST /api/cron/run remains as a secret-guarded manual/testing trigger.
//
// The cron schedule itself lives in wrangler.jsonc under `triggers.crons`.
import { handle } from '@astrojs/cloudflare/handler';
import type { Env } from './lib/env';
import { runDailyJobs } from './lib/cron';

export default {
  async fetch(request, env, ctx): Promise<Response> {
    return handle(request, env, ctx);
  },
  async scheduled(_event, _env, ctx): Promise<void> {
    ctx.waitUntil(runDailyJobs());
  },
} satisfies ExportedHandler<Env>;
