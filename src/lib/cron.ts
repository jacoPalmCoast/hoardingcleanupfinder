import { env } from './env';

// Daily job entry point. Invoked by the Cloudflare Cron Trigger (scheduled handler in src/worker.ts)
// and by POST /api/cron/run (secret-guarded, for manual/testing). P0 is scaffold-only — it proves the
// wiring with a harmless DB touch. P1 adds: featured-expiring reminders, payment dunning follow-ups,
// claim follow-ups, and winback. Each future job must be idempotent (guard on a marker in `emails`).
export interface CronResult {
  ran: string[];
  ts: number;
}

export async function runDailyJobs(): Promise<CronResult> {
  const ran: string[] = [];
  try {
    await env.DB.prepare('SELECT 1 AS ok').first();
    ran.push('db_ping');
  } catch (e) {
    console.error('cron db_ping failed', (e as Error)?.message);
  }
  // P1 jobs slot in here, e.g.:
  //   ran.push(await sendFeaturedExpiringReminders());
  //   ran.push(await runDunningFollowups());
  return { ran, ts: Math.floor(Date.now() / 1000) };
}
