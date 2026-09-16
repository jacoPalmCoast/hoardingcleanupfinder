// Email enrichment engine (runs in the Worker). Discovers business emails from each company's own
// website, validates deliverability (MX via DNS-over-HTTPS), classifies role/free/disposable, scores
// confidence, and can call a paid provider (Hunter.io) when HUNTER_API_KEY is set. Only a company's
// own site is crawled; no SMTP probing. Bounces are backstopped by the Resend webhook suppression.
import { env } from './env';
import { now } from './util';

const ROLE = new Set(['info', 'contact', 'office', 'hello', 'admin', 'sales', 'support', 'team', 'inquiries', 'inquiry', 'help', 'service', 'services', 'mail', 'booking', 'bookings', 'estimate', 'estimates', 'quote', 'quotes', 'scheduling', 'dispatch', 'care']);
const FREE = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'live.com', 'msn.com', 'comcast.net', 'me.com', 'att.net', 'verizon.net', 'sbcglobal.net', 'ymail.com', 'protonmail.com', 'gmx.com']);
const DISPOSABLE = new Set(['mailinator.com', 'guerrillamail.com', 'tempmail.com', '10minutemail.com', 'trashmail.com', 'yopmail.com', 'sharklasers.com', 'getnada.com', 'temp-mail.org', 'throwawaymail.com']);
// Local-parts and domains that are almost never a real business contact (tracking, vendors, placeholders).
const JUNK_LOCAL = /^(no-?reply|noreply|do-?not-?reply|postmaster|abuse|webmaster|hostmaster|example|email|name|user|your|test|sentry|wordpress|wix|godaddy|squarespace|u\d)/i;
const JUNK_DOMAIN = /(example\.(com|org|net)|domain\.com|email\.com|yourdomain|sentry\.io|wixpress\.com|godaddy\.com|squarespace\.com|schema\.org|w3\.org|googleapis|gstatic|\.png|\.jpg|\.jpeg|\.gif|\.webp|\.svg)/i;
const EMAIL_RE = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,24}/gi;

export function hostOfUrl(url: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return u.hostname.replace(/^www\./i, '').toLowerCase();
  } catch { return null; }
}
function labels2(host: string): string {
  const p = host.split('.').filter(Boolean);
  return p.slice(-2).join('.');
}
function sameDomain(a: string, b: string): boolean {
  return labels2(a) === labels2(b);
}

export interface Classified { email: string; local: string; domain: string; is_role: boolean; is_free: boolean; is_disposable: boolean }
export function classify(raw: string): Classified | null {
  const email = raw.trim().toLowerCase().replace(/[.,;:)]+$/, '');
  const at = email.indexOf('@');
  if (at < 1) return null;
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (!/^[a-z0-9.\-]+\.[a-z]{2,24}$/.test(domain)) return null;
  if (JUNK_LOCAL.test(local) || JUNK_DOMAIN.test(email)) return null;
  if (local.length > 64 || email.length > 200) return null;
  return { email, local, domain, is_role: ROLE.has(local), is_free: FREE.has(domain), is_disposable: DISPOSABLE.has(domain) };
}

export function extractEmails(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) { const c = classify(decodeURIComponent(m[1])); if (c) out.add(c.email); }
  for (const m of html.matchAll(EMAIL_RE)) { const c = classify(m[0]); if (c) out.add(c.email); }
  return [...out].slice(0, 25);
}

// MX check via DNS-over-HTTPS, cached in the domain_mx table.
const mxMemo = new Map<string, boolean>();
export async function mxOk(domain: string): Promise<boolean> {
  if (mxMemo.has(domain)) return mxMemo.get(domain)!;
  const cached = await env.DB.prepare(`SELECT mx_ok FROM domain_mx WHERE domain = ?1`).bind(domain).first<{ mx_ok: number }>();
  if (cached) { const v = !!cached.mx_ok; mxMemo.set(domain, v); return v; }
  let ok = false;
  try {
    const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, { headers: { accept: 'application/dns-json' } });
    if (res.ok) { const j = (await res.json()) as { Answer?: { type: number }[] }; ok = !!j.Answer?.some((a) => a.type === 15); }
  } catch { ok = false; }
  await env.DB.prepare(`INSERT OR REPLACE INTO domain_mx(domain, mx_ok, checked_at) VALUES (?1, ?2, unixepoch())`).bind(domain, ok ? 1 : 0).run();
  mxMemo.set(domain, ok);
  return ok;
}

function score(source: string, c: Classified, siteHost: string | null, mx: boolean): number {
  let s = source === 'mailto' ? 55 : source === 'listing' ? 50 : source === 'website' ? 42 : source === 'hunter' ? 60 : 25;
  if (siteHost && sameDomain(c.domain, siteHost)) s += 30;
  if (mx) s += 18;
  if (c.is_free) s -= 8;
  return Math.max(0, Math.min(100, s));
}

async function upsertCandidate(listingId: number, c: Classified, source: string, siteHost: string | null): Promise<void> {
  if (c.is_disposable) return; // never store disposable
  const mx = await mxOk(c.domain);
  const conf = score(source, c, siteHost, mx);
  const status = mx && conf >= 60 ? 'verified' : 'candidate';
  await env.DB.prepare(
    `INSERT INTO email_candidates(listing_id, email, source, confidence, mx_ok, is_role, is_free, is_disposable, status, checked_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,0,?8,unixepoch())
     ON CONFLICT(listing_id, email) DO UPDATE SET
       confidence = MAX(confidence, ?4), mx_ok = ?5, checked_at = unixepoch(),
       status = CASE WHEN status = 'primary' THEN 'primary' WHEN status = 'rejected' THEN 'rejected' ELSE ?8 END`,
  ).bind(listingId, c.email, source, conf, mx ? 1 : 0, c.is_role ? 1 : 0, c.is_free ? 1 : 0, status).run();
}

async function fetchText(url: string, timeoutMs = 7000): Promise<string | null> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; HCFBot/1.0; +https://hoardingcleanupfinder.com/about)' } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/i.test(ct)) return null;
    return (await res.text()).slice(0, 900000);
  } catch { return null; } finally { clearTimeout(to); }
}

export interface CrawlResult { found: number; status: string }
export async function crawlListing(listing: { id: number; website: string | null; email: string | null }): Promise<CrawlResult> {
  const host = listing.website ? hostOfUrl(listing.website) : null;
  // Fold any scraped listing email in as a candidate first (still validated + scored).
  if (listing.email) { const c = classify(listing.email); if (c) await upsertCandidate(listing.id, c, 'listing', host); }
  if (!host) { await setState(listing.id, listing.email ? 'done' : 'no_site', 0); return { found: 0, status: 'no_site' }; }

  const base = `https://${host}`;
  const emails = new Set<string>();
  const home = await fetchText(base) ?? await fetchText(`https://www.${host}`);
  if (home) extractEmails(home).forEach((e) => emails.add(e));
  if (emails.size === 0) {
    for (const path of ['/contact', '/contact-us', '/about', '/contact.html']) {
      const html = await fetchText(base + path);
      if (html) { extractEmails(html).forEach((e) => emails.add(e)); if (emails.size > 0) break; }
    }
  }
  let found = 0;
  for (const e of emails) { const c = classify(e); if (c) { await upsertCandidate(listing.id, c, e && home && home.includes('mailto:' + e) ? 'mailto' : 'website', host); found++; } }

  // If the site yielded nothing but the domain is real, guess role addresses on the validated domain.
  if (found === 0 && (await mxOk(host))) {
    for (const local of ['info', 'contact', 'office', 'hello']) {
      const c = classify(`${local}@${host}`); if (c) { await upsertCandidate(listing.id, c, 'guess', host); found++; }
    }
  }
  await promoteBest(listing.id);
  await setState(listing.id, found > 0 || listing.email ? 'done' : 'error', found);
  return { found, status: 'done' };
}

async function setState(listingId: number, status: string, found: number): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO enrichment_state(listing_id, status, found, attempts, last_run) VALUES (?1,?2,?3,1,unixepoch())
     ON CONFLICT(listing_id) DO UPDATE SET status = ?2, found = ?3, attempts = attempts + 1, last_run = unixepoch()`,
  ).bind(listingId, status, found).run();
}

// Promote the best deliverable candidate to 'primary' (what outreach uses). Prefers verified, then
// confidence; a non-free (own-domain) address wins ties over a gmail.
export async function promoteBest(listingId: number): Promise<void> {
  const best = await env.DB.prepare(
    `SELECT id FROM email_candidates WHERE listing_id = ?1 AND status != 'rejected'
     ORDER BY (status = 'verified') DESC, is_free ASC, confidence DESC LIMIT 1`,
  ).bind(listingId).first<{ id: number }>();
  if (!best) return;
  await env.DB.batch([
    env.DB.prepare(`UPDATE email_candidates SET status = CASE WHEN status = 'primary' THEN 'verified' ELSE status END WHERE listing_id = ?1 AND id != ?2 AND status = 'primary'`).bind(listingId, best.id),
    env.DB.prepare(`UPDATE email_candidates SET status = 'primary' WHERE id = ?1`).bind(best.id),
  ]);
}

// Process a batch of listings that have a website and haven't been crawled yet.
export async function runBatch(limit = 12): Promise<{ processed: number; found: number }> {
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.website, l.email FROM listings l
     LEFT JOIN enrichment_state es ON es.listing_id = l.id
     WHERE l.status = 'active' AND l.website IS NOT NULL AND l.website != ''
       AND (es.status IS NULL OR es.status = 'pending')
     ORDER BY l.id LIMIT ?1`,
  ).bind(limit).all<{ id: number; website: string | null; email: string | null }>()).results;
  let found = 0;
  // Small concurrency pool to keep within subrequest/time limits.
  const pool = 4;
  for (let i = 0; i < rows.length; i += pool) {
    const slice = rows.slice(i, i + pool);
    const res = await Promise.all(slice.map((r) => crawlListing(r).catch(() => ({ found: 0, status: 'error' } as CrawlResult))));
    found += res.reduce((a, x) => a + x.found, 0);
  }
  return { processed: rows.length, found };
}

export interface Coverage { total: number; withEmail: number; crawled: number; pending: number; candidates: number; verified: number; primary: number }
export async function coverage(): Promise<Coverage> {
  const t = now();
  const primaryEmail = `(SELECT ec.email FROM email_candidates ec WHERE ec.listing_id = l.id AND ec.status = 'primary' LIMIT 1)`;
  const [tot, withE, crawled, cand] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 1 ELSE 0 END) AS sites FROM listings l WHERE l.status = 'active'`),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM listings l WHERE l.status = 'active' AND (
        (l.email IS NOT NULL AND l.email != '') OR ${primaryEmail} IS NOT NULL
        OR EXISTS (SELECT 1 FROM owner_listings ol JOIN owners o ON o.id = ol.owner_id WHERE ol.listing_id = l.id))`),
    env.DB.prepare(`SELECT SUM(CASE WHEN status IN ('done','no_site','error') THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM enrichment_state`),
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS v, SUM(CASE WHEN status = 'primary' THEN 1 ELSE 0 END) AS p FROM email_candidates WHERE status != 'rejected'`),
  ]);
  const tr = tot.results[0] as { n: number; sites: number };
  return {
    total: tr.n,
    withEmail: (withE.results[0] as { n: number }).n,
    crawled: (crawled.results[0] as { done: number } | undefined)?.done ?? 0,
    pending: tr.sites - ((crawled.results[0] as { done: number } | undefined)?.done ?? 0),
    candidates: (cand.results[0] as { n: number }).n,
    verified: (cand.results[0] as { v: number } | undefined)?.v ?? 0,
    primary: (cand.results[0] as { p: number } | undefined)?.p ?? 0,
  };
}

// ---- Paid provider (Hunter.io) — powers the "very powerful" tier when HUNTER_API_KEY is set ----
export function hunterEnabled(): boolean { return !!env.HUNTER_API_KEY; }

// Domain search: pull the most likely emails Hunter has for a company's domain.
export async function hunterEnrich(listingId: number, host: string): Promise<number> {
  if (!env.HUNTER_API_KEY) return 0;
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(host)}&limit=5&api_key=${env.HUNTER_API_KEY}`);
    if (!res.ok) return 0;
    const j = (await res.json()) as { data?: { emails?: { value: string; confidence?: number }[] } };
    let n = 0;
    for (const e of j.data?.emails ?? []) {
      const c = classify(e.value); if (!c) continue;
      const mx = await mxOk(c.domain);
      const conf = Math.max(score('hunter', c, host, mx), e.confidence ?? 0);
      await env.DB.prepare(
        `INSERT INTO email_candidates(listing_id, email, source, confidence, mx_ok, is_role, is_free, is_disposable, status, checked_at)
         VALUES (?1,?2,'hunter',?3,?4,?5,?6,0,?7,unixepoch())
         ON CONFLICT(listing_id, email) DO UPDATE SET confidence = MAX(confidence, ?3), mx_ok = ?4, checked_at = unixepoch(), source = 'hunter'`,
      ).bind(listingId, c.email, conf, mx ? 1 : 0, c.is_role ? 1 : 0, c.is_free ? 1 : 0, mx && conf >= 60 ? 'verified' : 'candidate').run();
      n++;
    }
    if (n) await promoteBest(listingId);
    return n;
  } catch { return 0; }
}

// Verify a single address with Hunter's verifier; promotes/demotes by the result.
export async function hunterVerify(candidateId: number): Promise<string | null> {
  if (!env.HUNTER_API_KEY) return null;
  const row = await env.DB.prepare(`SELECT id, listing_id, email FROM email_candidates WHERE id = ?1`).bind(candidateId).first<{ id: number; listing_id: number; email: string }>();
  if (!row) return null;
  try {
    const res = await fetch(`https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(row.email)}&api_key=${env.HUNTER_API_KEY}`);
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { status?: string; score?: number } };
    const st = j.data?.status ?? '';
    const status = st === 'valid' ? 'verified' : st === 'invalid' ? 'rejected' : 'candidate';
    await env.DB.prepare(`UPDATE email_candidates SET status = CASE WHEN status='primary' AND ?2!='rejected' THEN 'primary' ELSE ?2 END, confidence = ?3, checked_at = unixepoch() WHERE id = ?1`)
      .bind(row.id, status, j.data?.score ?? 0).run();
    await promoteBest(row.listing_id);
    return st;
  } catch { return null; }
}
