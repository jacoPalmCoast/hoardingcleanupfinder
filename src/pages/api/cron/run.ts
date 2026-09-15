import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { timingSafeEqual, json } from '../../../lib/util';
import { runDailyJobs } from '../../../lib/cron';

// Manual/testing trigger for the daily job. The Cloudflare Cron Trigger runs the same logic via the
// scheduled() handler in src/worker.ts. Secret-guarded; fails closed.
export const POST: APIRoute = async ({ request }) => {
  const secret = env.CRON_SECRET;
  if (!secret) return new Response('not configured', { status: 503 });
  const auth = request.headers.get('authorization') ?? '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (request.headers.get('x-cron-secret') ?? '');
  if (!provided || !timingSafeEqual(provided, secret)) return new Response('forbidden', { status: 403 });
  const result = await runDailyJobs();
  return json({ ok: true, ...result });
};
