import { env } from './env';
import { now, escapeHtml } from './util';
import { sendEmail, emailShell } from './services';
import { rollupEvents, pruneEvents, statsForDayRange, type ListingStats } from './db';
import { renderTemplate } from './outreach';
import { runBatch } from './enrich';
import { mailingAddress } from './settings';

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

// 5) Monthly performance report — on the 1st (or 2nd, as a safety net) of the month, email each
// claimed listing's owner their previous calendar month's numbers. Transactional (their own data),
// sent only to owners, only when there's something to report. Idempotent via the emails log.
function prevMonthDayRange(t: number): { startDay: number; endDay: number; label: string } {
  const d = new Date(t * 1000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth(); // m = current month, 0-based
  const startTs = Date.UTC(y, m - 1, 1) / 1000;      // first day of previous month
  const curMonthStartTs = Date.UTC(y, m, 1) / 1000;  // first day of current month
  const label = new Date(startTs * 1000).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { startDay: Math.floor(startTs / 86400), endDay: Math.floor(curMonthStartTs / 86400) - 1, label };
}

async function monthlyReports(): Promise<number> {
  const t = now();
  if (new Date(t * 1000).getUTCDate() > 2) return 0; // only around the start of the month
  const { startDay, endDay, label } = prevMonthDayRange(t);
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.slug, l.city, ${ownerEmailSub} AS email
     FROM listings l
     WHERE l.status = 'active' AND EXISTS (SELECT 1 FROM owner_listings ol WHERE ol.listing_id = l.id)`,
  ).all<{ id: number; name: string; slug: string; city: string; email: string | null }>()).results;
  let n = 0;
  for (const l of rows) {
    if (!l.email) continue;
    if (await alreadySent('monthly_report', l.id, 25)) continue;
    const s = await statsForDayRange(l.id, startDay, endDay);
    if (s.views + s.calls + s.website + s.leads === 0) continue; // nothing to report — don't send a page of zeros
    await sendEmail(l.email, `Your ${label} report for ${l.name}`, emailShell(`${label} performance`, monthlyReportBody(l.name, l.slug, label, s)), { stream: 'txn', type: 'monthly_report', listingId: l.id });
    n++;
  }
  return n;
}

function monthlyReportBody(name: string, slug: string, label: string, s: ListingStats): string {
  const row = (k: string, v: number) => `<tr><td style="padding:6px 16px 6px 0">${k}</td><td style="padding:6px 0;text-align:right"><strong>${v.toLocaleString('en-US')}</strong></td></tr>`;
  return `<p>Here's how <a href="${env.SITE_URL}/company/${slug}">${escapeHtml(name)}</a> did on Hoarding Cleanup Finder in ${label}.</p>
    <table style="border-collapse:collapse;margin:8px 0 16px">
      ${row('People who viewed your listing', s.unique_views || s.views)}
      ${row('Times shown in search &amp; city lists', s.impressions)}
      ${row('Phone taps (click-to-call)', s.calls)}
      ${row('Website clicks', s.website)}
      ${row('Quote requests', s.leads)}
      ${row('New reviews', s.reviews)}
    </table>
    <p class="small">"People who viewed" counts unique visitors; phone taps count how many people tapped your number on a phone or clicked to call, not connected calls. <a href="${env.SITE_URL}/account">See more in your account</a>.</p>`;
}

// 6) Outreach — drain a throttled batch of queued campaign sends. INERT until MAILING_ADDRESS is
// set (marketing can't legally go out without the CAN-SPAM footer), and every send is suppression-
// checked inside sendEmail (marketing stream). Capped per run to warm the sending domain.
const OUTREACH_CAP = 40;
interface SendRow { send_id: number; email: string; listing_id: number; campaign_id: number; subject: string; body: string; name: string; city: string; state: string; slug: string }
async function outreach(): Promise<number> {
  if (!(await mailingAddress())) return 0; // gate: no marketing sends without a physical address on file
  const rows = (await env.DB.prepare(
    `SELECT s.id AS send_id, s.email, s.listing_id, c.id AS campaign_id, c.subject, c.body,
        l.name, l.city, l.state, l.slug
     FROM outreach_sends s
     JOIN outreach_campaigns c ON c.id = s.campaign_id AND c.status = 'sending'
     JOIN listings l ON l.id = s.listing_id
     WHERE s.status = 'queued' ORDER BY s.id LIMIT ?1`,
  ).bind(OUTREACH_CAP).all<SendRow>()).results;
  let n = 0;
  const campaigns = new Set<number>();
  for (const r of rows) {
    campaigns.add(r.campaign_id);
    const html = emailShell(r.subject, renderTemplate(r.body, r));
    let ok = false;
    try { ok = await sendEmail(r.email, r.subject, html, { stream: 'marketing', type: `outreach_${r.campaign_id}`, listingId: r.listing_id }); } catch { ok = false; }
    await env.DB.prepare(`UPDATE outreach_sends SET status = ?2, sent_at = unixepoch() WHERE id = ?1`).bind(r.send_id, ok ? 'sent' : 'failed').run();
    if (ok) n++;
  }
  // Mark any drained campaign done.
  for (const cid of campaigns) {
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM outreach_sends WHERE campaign_id = ?1 AND status = 'queued'`).bind(cid).first<{ n: number }>();
    if ((left?.n ?? 0) === 0) await env.DB.prepare(`UPDATE outreach_campaigns SET status = 'done' WHERE id = ?1 AND status = 'sending'`).bind(cid).run();
  }
  return n;
}

export interface CronResult { ran: string[]; ts: number }

export async function runDailyJobs(): Promise<CronResult> {
  const ran: string[] = [];
  // Roll up yesterday's raw analytics into durable daily counts before anything reads them.
  try { ran.push(`rollup:${await rollupEvents()}`); } catch (e) { console.error('cron rollup', (e as Error)?.message); ran.push('rollup:err'); }
  const jobs: [string, () => Promise<number>][] = [
    ['renewal', renewalReminders],
    ['past_due', pastDueNudge],
    ['winback', winback],
    ['claim_followup', claimFollowup],
    ['monthly_report', monthlyReports],
    ['outreach', outreach],
    ['enrich', async () => (await runBatch(80)).found],
  ];
  for (const [name, fn] of jobs) {
    try { ran.push(`${name}:${await fn()}`); } catch (e) { console.error('cron ' + name, (e as Error)?.message); ran.push(`${name}:err`); }
  }
  // Prune raw events last, after the rollup has consumed them.
  try { await pruneEvents(); ran.push('prune:ok'); } catch (e) { console.error('cron prune', (e as Error)?.message); ran.push('prune:err'); }
  // Log the run so scheduled execution is verifiable from the admin (keep the last 60).
  try {
    await env.DB.prepare(`INSERT INTO cron_runs(ran, ok) VALUES (?1, ?2)`).bind(ran.join(' '), ran.some((r) => r.endsWith(':err')) ? 0 : 1).run();
    await env.DB.prepare(`DELETE FROM cron_runs WHERE id NOT IN (SELECT id FROM cron_runs ORDER BY id DESC LIMIT 60)`).run();
  } catch (e) { console.error('cron log', (e as Error)?.message); }
  return { ran, ts: now() };
}
