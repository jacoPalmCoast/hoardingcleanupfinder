// Outreach engine data layer. Segments are a fixed allowlist (no dynamic SQL). Recipient email is
// the claimed owner's address if present, else the listing's scraped email; suppressed addresses
// are excluded at query time and re-checked at send time.
import { env } from './env';
import { escapeHtml } from './util';

export type Segment = 'unclaimed' | 'claimed_not_featured' | 'lapsed' | 'all_with_email';
export const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'unclaimed', label: 'Unclaimed listings' },
  { key: 'claimed_not_featured', label: 'Claimed, not featured' },
  { key: 'lapsed', label: 'Lapsed (was featured)' },
  { key: 'all_with_email', label: 'All active with an email' },
];
const PREDICATE: Record<Segment, string> = {
  unclaimed: `l.is_claimed = 0`,
  claimed_not_featured: `l.is_claimed = 1 AND l.is_featured = 0`,
  lapsed: `l.subscription_status = 'canceled'`,
  all_with_email: `1 = 1`,
};
export function isSegment(s: string): s is Segment {
  return s === 'unclaimed' || s === 'claimed_not_featured' || s === 'lapsed' || s === 'all_with_email';
}

// Prefer the enriched 'primary' candidate, then a claimed owner's email, then the scraped listing email.
const EMAIL_SQL = `COALESCE(
  (SELECT ec.email FROM email_candidates ec WHERE ec.listing_id = l.id AND ec.status = 'primary' LIMIT 1),
  (SELECT o.email FROM owner_listings ol JOIN owners o ON o.id = ol.owner_id WHERE ol.listing_id = l.id LIMIT 1),
  l.email)`;

export interface Recipient { id: number; name: string; city: string; state: string; slug: string; email: string }
export async function recipients(segment: Segment, limit = 5000): Promise<Recipient[]> {
  return (await env.DB.prepare(
    `SELECT l.id, l.name, l.city, l.state, l.slug, ${EMAIL_SQL} AS email
     FROM listings l
     WHERE l.status = 'active' AND ${PREDICATE[segment]}
       AND ${EMAIL_SQL} IS NOT NULL AND ${EMAIL_SQL} != ''
       AND lower(${EMAIL_SQL}) NOT IN (SELECT email FROM suppressions)
     LIMIT ?1`,
  ).bind(limit).all<Recipient>()).results;
}
export async function previewCount(segment: Segment): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM listings l
     WHERE l.status = 'active' AND ${PREDICATE[segment]}
       AND ${EMAIL_SQL} IS NOT NULL AND ${EMAIL_SQL} != ''
       AND lower(${EMAIL_SQL}) NOT IN (SELECT email FROM suppressions)`,
  ).first<{ n: number }>();
  return r?.n ?? 0;
}

export interface Campaign { id: number; name: string; segment: string; subject: string; body: string; status: string; created_at: number }
export async function createCampaign(name: string, segment: Segment, subject: string, body: string): Promise<number> {
  const r = await env.DB.prepare(`INSERT INTO outreach_campaigns(name, segment, subject, body) VALUES (?1,?2,?3,?4) RETURNING id`)
    .bind(name, segment, subject, body).first<{ id: number }>();
  return r!.id;
}
export async function listCampaigns(): Promise<(Campaign & { queued: number; sent: number })[]> {
  return (await env.DB.prepare(
    `SELECT c.*,
        (SELECT COUNT(*) FROM outreach_sends s WHERE s.campaign_id = c.id AND s.status = 'queued') AS queued,
        (SELECT COUNT(*) FROM outreach_sends s WHERE s.campaign_id = c.id AND s.status = 'sent') AS sent
     FROM outreach_campaigns c ORDER BY c.created_at DESC`,
  ).all<Campaign & { queued: number; sent: number }>()).results;
}
export async function getCampaign(id: number): Promise<Campaign | null> {
  return (await env.DB.prepare(`SELECT * FROM outreach_campaigns WHERE id = ?1`).bind(id).first<Campaign>()) ?? null;
}
export async function campaignStats(id: number): Promise<{ queued: number; sent: number; failed: number; suppressed: number }> {
  const rows = (await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM outreach_sends WHERE campaign_id = ?1 GROUP BY status`).bind(id).all<{ status: string; n: number }>()).results;
  const s = { queued: 0, sent: 0, failed: 0, suppressed: 0 };
  for (const r of rows) if (r.status in s) (s as Record<string, number>)[r.status] = r.n;
  return s;
}

// Materialize the recipient list into queued sends (idempotent via the unique index) and mark the
// campaign 'sending'. Does not send — the daily cron drains the queue.
export async function queueCampaign(id: number): Promise<number> {
  const c = await getCampaign(id);
  if (!c || !isSegment(c.segment)) return 0;
  // Dedupe by email so a domain shared across listings (e.g. franchise HQ) is contacted once.
  const seen = new Set<string>();
  const unique = list.filter((r) => { const e = r.email.toLowerCase(); if (seen.has(e)) return false; seen.add(e); return true; });
  let n = 0;
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50).map((r) =>
      env.DB.prepare(`INSERT OR IGNORE INTO outreach_sends(campaign_id, listing_id, email) VALUES (?1,?2,?3)`).bind(id, r.id, r.email.toLowerCase()),
    );
    if (batch.length) { await env.DB.batch(batch); n += batch.length; }
  }
  await env.DB.prepare(`UPDATE outreach_campaigns SET status = 'sending' WHERE id = ?1`).bind(id).run();
  return n;
}
export async function setCampaignStatus(id: number, status: 'sending' | 'paused'): Promise<void> {
  await env.DB.prepare(`UPDATE outreach_campaigns SET status = ?2 WHERE id = ?1`).bind(id, status).run();
}

export function renderTemplate(tpl: string, r: { name: string; city: string; state: string; slug: string }): string {
  const claim = `${env.SITE_URL}/claim/${r.slug}`;
  const featured = `${env.SITE_URL}/featured/${r.slug}`;
  return tpl
    .replace(/\{\{\s*name\s*\}\}/g, escapeHtml(r.name))
    .replace(/\{\{\s*city\s*\}\}/g, escapeHtml(r.city))
    .replace(/\{\{\s*state\s*\}\}/g, escapeHtml(r.state))
    .replace(/\{\{\s*claim_url\s*\}\}/g, claim)
    .replace(/\{\{\s*featured_url\s*\}\}/g, featured);
}
