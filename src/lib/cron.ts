import { env } from './env';
import { now, escapeHtml } from './util';
import { sendEmail, emailShell } from './services';

// Daily job entry point. Invoked by the scheduler (GitHub Actions or cron-worker) via
// POST /api/cron/run, and by the standalone worker's scheduled() handler.
//
// P1 lifecycle emails. Every job is idempotent: before sending, it checks the `emails` log for a
// recent send of the same `type` to the same listing, so a job that matches a listing on several
// consecutive days still emails once. Renewal/past-due/claim notices are transactional (`txn` —
// always sent). Winback is promotional (`marketing` — suppression-gated + one-click unsubscribe).
// With no paying customers yet these all match zero rows and no-op safely.
const DAY = 86400;

async function alreadySent(type: string, listingId: number, withinDays: number): Promise<boolean> {
  const r = await env.DB.prepare(
    `SELECT 1 AS ok FROM emails WHERE listing_id = ?1 AND type = ?2 AND status IN ('sent','suppressed') AND created_at > ?3 LIMIT 1`,
  ).bind(listingId, type, now() - withinDays * DAY).first();
  return !!r;
}

const ownerEmailSub = `(SELECT o.email FROM owner_listings ol JOIN owners o ON o.id = ol.owner_id WHERE ol.listing_id = l.id ORDER BY ol.owner_id LIMIT 1)`;

interface FRow { id: number; name: string; slug: string; city: string; featured_until: number | null; subscription_status: string | null; email: string | null }

// 1) Featured-expiring / renewal reminder — 7 days and 1 day before featured_until.
async function renewalReminders(): Promise<number> {
  const t = now();
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.city, l.featured_until, l.subscription_status, ${ownerEmailSub} AS email
     FROM listings l
     WHERE l.is_featured = 1 AND l.featured_until IS NOT NULL AND l.featured_until > ?1 AND l.featured_until < ?1 + 9 * 86400`,
  ).bind(t).all<FRow>()).results;
  let n = 0;
  for (const l of rows) {
    if (!l.email || !l.featured_until) continue;
    const days = (l.featured_until - t) / DAY;
    const type = days >= 6 && days < 8 ? 'renewal_7d' : days >= 0 && days < 2 ? 'renewal_1d' : '';
    if (!type) continue;
    if (await alreadySent(type, l.id, type === 'renewal_7d' ? 20 : 5)) continue;
    const active = l.subscription_status === 'active' || l.subscription_status === 'trialing';
    const when = type === 'renewal_7d' ? 'in about a week' : 'tomorrow';
    const link = `${env.SITE_URL}/company/${l.slug}`;
    const body = active
      ? `<p>Your featured placement for <a href="${link}">${escapeHtml(l.name)}</a> in ${escapeHtml(l.city)} renews ${when}. There's nothing to do — the card on file is charged automatically and your listing stays at the top. To update the card or cancel, <a href="${env.SITE_URL}/account">open your account</a>.</p>`
      : `<p>Your featured placement for <a href="${link}">${escapeHtml(l.name)}</a> in ${escapeHtml(l.city)} ends ${when}, and your listing goes back to a normal free listing (nothing is deleted). To stay featured, <a href="${env.SITE_URL}/featured/${l.slug}">renew here</a>.</p>`;
    await sendEmail(l.email, active ? 'Your featured listing renews soon' : 'Your featured listing ends soon', emailShell(active ? 'Renewing soon' : 'Ending soon', body), { stream: 'txn', type, listingId: l.id });
    n++;
  }
  return n;
}

// 2) Past-due nudge — a card that failed to charge. Stripe keeps retrying; this is a courtesy prompt.
async function pastDueNudge(): Promise<number> {
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.city, l.featured_until, l.subscription_status, ${ownerEmailSub} AS email
     FROM listings l WHERE l.subscription_status = 'past_due'`,
  ).all<FRow>()).results;
  let n = 0;
  for (const l of rows) {
    if (!l.email) continue;
    if (await alreadySent('past_due_nudge', l.id, 4)) continue;
    const body = `<p>We couldn't charge the card on file for <a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a>. Stripe will keep retrying over the next few days. To update your card and keep your featured placement, <a href="${env.SITE_URL}/account">open your account</a> and click Manage billing. If the retries fail your listing simply goes back to free — nothing is deleted.</p>`;
    await sendEmail(l.email, `Update your card for ${l.name}`, emailShell('Payment needs attention', body), { stream: 'txn', type: 'past_due_nudge', listingId: l.id });
    n++;
  }
  return n;
}

// 3) Winback — a subscription that ended in the last 30 days. Promotional (marketing stream).
async function winback(): Promise<number> {
  const t = now();
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.city, l.featured_until, l.subscription_status, ${ownerEmailSub} AS email
     FROM listings l
     WHERE l.is_featured = 0 AND l.stripe_customer_id IS NOT NULL AND l.subscription_status = 'canceled'
       AND l.featured_until IS NOT NULL AND l.featured_until > ?1 - 30 * 86400 AND l.featured_until <= ?1`,
  ).bind(t).all<FRow>()).results;
  let n = 0;
  for (const l of rows) {
    if (!l.email) continue;
    if (await alreadySent('winback', l.id, 60)) continue;
    const body = `<p>Your featured placement for <a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a> in ${escapeHtml(l.city)} has ended, so it's now shown after the featured companies in your area. If it was working for you, you can turn it back on any time — <a href="${env.SITE_URL}/featured/${l.slug}">get featured again</a>.</p>`;
    await sendEmail(l.email, `Come back to the top in ${l.city}`, emailShell('Get featured again', body), { stream: 'marketing', type: 'winback', listingId: l.id });
    n++;
  }
  return n;
}

// 4) Claim follow-up — someone started claiming a listing 1–4 days ago and hasn't finished.
async function claimFollowup(): Promise<number> {
  const t = now();
  const rows = (await env.DB.prepare(
    `SELECT c.listing_id, c.email, l.name, l.slug, l.is_claimed
     FROM claims c JOIN listings l ON l.id = c.listing_id
     WHERE c.status = 'pending' AND l.is_claimed = 0 AND l.status = 'active'
       AND c.created_at < ?1 - 86400 AND c.created_at > ?1 - 4 * 86400`,
  ).bind(t).all<{ listing_id: number; email: string; name: string; slug: string; is_claimed: number }>()).results;
  let n = 0;
  const seen = new Set<number>();
  for (const c of rows) {
    if (!c.email || seen.has(c.listing_id)) continue;
    seen.add(c.listing_id);
    if (await alreadySent('claim_followup', c.listing_id, 30)) continue;
    const body = `<p>You started claiming <a href="${env.SITE_URL}/company/${c.slug}">${escapeHtml(c.name)}</a> on Hoarding Cleanup Finder but didn't finish. Claiming is free and takes a minute — <a href="${env.SITE_URL}/claim/${c.slug}">pick up where you left off</a> to edit the listing, add your details and, if you like, get featured. If this wasn't you, ignore this email.</p>`;
    await sendEmail(c.email, `Finish claiming ${c.name}`, emailShell('Finish your claim', body), { stream: 'txn', type: 'claim_followup', listingId: c.listing_id });
    n++;
  }
  return n;
}

export interface CronResult { ran: string[]; ts: number }

export async function runDailyJobs(): Promise<CronResult> {
  const ran: string[] = [];
  const jobs: [string, () => Promise<number>][] = [
    ['renewal', renewalReminders],
    ['past_due', pastDueNudge],
    ['winback', winback],
    ['claim_followup', claimFollowup],
  ];
  for (const [name, fn] of jobs) {
    try { ran.push(`${name}:${await fn()}`); } catch (e) { console.error('cron ' + name, (e as Error)?.message); ran.push(`${name}:err`); }
  }
  return { ran, ts: now() };
}
