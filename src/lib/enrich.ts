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
  let s = source === 'mailto' ? 55 : source === 'listing' ? 50 : source === 'website' ? 42 : source === 'hunter' ? 60 : 20;
  // Own-domain bonus only for addresses actually found (a guess is on the domain by construction).
  if (source !== 'guess' && siteHost && sameDomain(c.domain, siteHost)) s += 30;
  if (mx) s += 18;
  if (c.is_free) s -= 8;
  return Math.max(0, Math.min(100, s));
}

async function upsertCandidate(listingId: number, c: Classified, source: string, siteHost: string | null): Promise<void> {
  if (c.is_disposable) return; // never store disposable
  const mx = await mxOk(c.domain);
  const conf = score(source, c, siteHost, mx);
  // A guess is never "verified" — only an address actually found (or provider-confirmed) can be.
  const status = source !== 'guess' && mx && conf >= 60 ? 'verified' : 'candidate';
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
  const pages: string[] = [];
  const home = await fetchText(base) ?? await fetchText(`https://www.${host}`);
  if (home) pages.push(home);
  // People (and often more emails) live on about/team pages — fetch a couple.
  for (const path of ['/about', '/about-us', '/team', '/our-team', '/staff', '/leadership']) {
    if (pages.length >= 4) break;
    const html = await fetchText(base + path);
    if (html) pages.push(html);
  }
  for (const html of pages) extractEmails(html).forEach((e) => emails.add(e));
  if (emails.size === 0) {
    for (const path of ['/contact', '/contact-us', '/contact.html']) {
      const html = await fetchText(base + path);
      if (html) { pages.push(html); extractEmails(html).forEach((e) => emails.add(e)); if (emails.size > 0) break; }
    }
  }
  let found = 0;
  const homeHtml = pages[0] ?? '';
  for (const e of emails) { const c = classify(e); if (c) { await upsertCandidate(listing.id, c, homeHtml.includes('mailto:' + e) ? 'mailto' : 'website', host); found++; } }

  // People: schema.org Person data + team/about heuristics across the fetched pages.
  const people = new Map<string, ExtractedPerson>();
  for (const html of pages) for (const p of extractPeople(html)) mergePerson(people, p);
  for (const p of people.values()) await upsertPerson(listing.id, p.name, p.role, null, p.conf >= 80 ? 'schema' : 'team_page', p.conf);

  // Provider fallback for the hard cases: only when the site published nothing AND a key is set —
  // bounded to one domain-search call per listing, so it targets Hunter spend where it adds most.
  if (found === 0 && hunterEnabled()) { found += await hunterEnrich(listing.id, host); }
  // If still nothing but the domain is real, guess role addresses on the validated domain.
  if (found === 0 && (await mxOk(host))) {
    for (const local of ['info', 'contact', 'office', 'hello']) {
      const c = classify(`${local}@${host}`); if (c) { await upsertCandidate(listing.id, c, 'guess', host); found++; }
    }
  }
  await promoteBest(listing.id);
  await inferNameFromPrimaryEmail(listing.id); // john.smith@ -> John Smith, linked to that address
  await promotePerson(listing.id);
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

// ---- People (owner/contact names + roles) ----
export interface ExtractedPerson { name: string; role: string | null; conf: number }

const ROLE_PATTERNS: [RegExp, string][] = [
  [/\b(owner\s*\/\s*operator|owner-operator)\b/i, 'Owner/Operator'],
  [/\bco-?owner\b/i, 'Co-Owner'],
  [/\bowner\b/i, 'Owner'],
  [/\bco-?founder\b/i, 'Co-Founder'],
  [/\bfounder\b/i, 'Founder'],
  [/\b(president|chief executive officer|ceo)\b/i, 'President'],
  [/\b(principal|proprietor)\b/i, 'Principal'],
  [/\bgeneral manager\b/i, 'General Manager'],
  [/\boperations manager\b/i, 'Operations Manager'],
  [/\boffice manager\b/i, 'Office Manager'],
  [/\b(managing director|director of operations|director)\b/i, 'Director'],
  [/\b(vice president|vp)\b/i, 'Vice President'],
  [/\bmanager\b/i, 'Manager'],
];
function normRole(text: string): string | null { for (const [re, label] of ROLE_PATTERNS) if (re.test(text)) return label; return null; }
const ROLE_ALT = 'owner\\s*\\/\\s*operator|owner-operator|co-?owner|owner|co-?founder|founder|president|ceo|principal|proprietor|general manager|operations manager|office manager|managing director|director|vice president|manager';
// Words that disqualify a "Name" match (company/section words, not people).
const NAME_STOP = /\b(LLC|Inc|Co|Corp|Company|Services?|Cleanup|Cleaning|Restoration|Hoarding|Biohazard|Junk|Removal|Estate|Estates|Trauma|Crime|Scene|Group|Team|Solutions?|Property|Properties|Management|Realty|Construction|Contracting|Enterprises?|Industries|Systems?|Professional|Pros?|Experts?|Specialists?|Emergency|Response|Home|House|Family|America|American|National|Local|Best|Top|Quality|Care|About|Contact|Menu|Privacy|Terms|Copyright|Reserved|Rights|Google|Facebook|Reviews?|Service|Areas?|Free|Call|Today|Learn|More|Read|View|Click|Us)\b/i;
function looksLikeName(s: string): boolean {
  const parts = s.trim().split(/\s+/);
  if (parts.length < 2 || parts.length > 3) return false;
  if (NAME_STOP.test(s)) return false;
  return parts.every((p) => /^[A-Z][a-z'’\-]{1,20}$/.test(p) || /^[A-Z]\.$/.test(p));
}
function stripTags(html: string): string {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ');
}
export function mergePerson(map: Map<string, ExtractedPerson>, p: ExtractedPerson): void {
  const key = p.name.toLowerCase();
  const ex = map.get(key);
  if (!ex) { map.set(key, p); return; }
  map.set(key, { name: p.name, role: ex.role ?? p.role, conf: Math.max(ex.conf, p.conf) });
}
export function extractPeople(html: string): ExtractedPerson[] {
  const out = new Map<string, ExtractedPerson>();
  // 1) schema.org Person (highest confidence)
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data: unknown; try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const persons: Record<string, unknown>[] = [];
    const seen = new Set<unknown>();
    const walk = (o: unknown): void => {
      if (!o || typeof o !== 'object' || seen.has(o)) return; seen.add(o);
      const obj = o as Record<string, unknown>;
      const t = obj['@type'];
      const isPerson = t === 'Person' || (Array.isArray(t) && t.includes('Person'));
      if (isPerson && typeof obj.name === 'string') persons.push(obj);
      for (const v of Object.values(obj)) { if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') walk(v); }
    };
    walk(data);
    for (const p of persons) {
      const name = String(p.name).trim();
      if (looksLikeName(name)) mergePerson(out, { name, role: typeof p.jobTitle === 'string' ? (normRole(p.jobTitle) ?? p.jobTitle.trim().slice(0, 40)) : null, conf: 85 });
    }
  }
  // 2) heuristic "Name, Role" / "Role: Name" over the visible text
  const text = stripTags(html).slice(0, 200000);
  for (const m of text.matchAll(new RegExp(`([A-Z][a-z'’\\-]+(?:\\s+[A-Z][a-z'’\\-]+){1,2}),?\\s+(?:is\\s+(?:the\\s+|our\\s+)?)?(${ROLE_ALT})\\b`, 'gi'))) {
    if (looksLikeName(m[1])) mergePerson(out, { name: m[1].trim(), role: normRole(m[2]), conf: 55 });
  }
  for (const m of text.matchAll(new RegExp(`\\b(${ROLE_ALT})\\s*[:\\-–]\\s*([A-Z][a-z'’\\-]+(?:\\s+[A-Z][a-z'’\\-]+){1,2})`, 'gi'))) {
    if (looksLikeName(m[2])) mergePerson(out, { name: m[2].trim(), role: normRole(m[1]), conf: 50 });
  }
  return [...out.values()].slice(0, 12);
}
export function nameFromEmail(local: string): { first: string; last: string | null; name: string; conf: number } | null {
  const l = local.toLowerCase().replace(/\d+$/, '');
  if (ROLE.has(l) || l.length < 3) return null;
  const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const two = l.match(/^([a-z]{2,})[._-]([a-z]{2,})$/);
  if (two) return { first: cap(two[1]), last: cap(two[2]), name: `${cap(two[1])} ${cap(two[2])}`, conf: 55 };
  if (/^[a-z]{3,15}$/.test(l)) return { first: cap(l), last: null, name: cap(l), conf: 30 };
  return null;
}
async function upsertPerson(listingId: number, name: string, role: string | null, email: string | null, source: string, conf: number): Promise<void> {
  const parts = name.trim().split(/\s+/);
  const first = parts[0] ?? null;
  const last = parts.length > 1 ? parts.slice(1).join(' ') : null;
  await env.DB.prepare(
    `INSERT INTO people(listing_id, name, first_name, last_name, role, email, source, confidence)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8)
     ON CONFLICT(listing_id, name) DO UPDATE SET
       role = COALESCE(people.role, ?5), email = COALESCE(people.email, ?6), confidence = MAX(people.confidence, ?8)`,
  ).bind(listingId, name, first, last, role, email, source, conf).run();
}
async function inferNameFromPrimaryEmail(listingId: number): Promise<void> {
  const row = await env.DB.prepare(`SELECT email FROM email_candidates WHERE listing_id = ?1 AND status = 'primary' LIMIT 1`).bind(listingId).first<{ email: string }>();
  if (!row) return;
  const local = row.email.split('@')[0];
  const n = nameFromEmail(local);
  if (n) await upsertPerson(listingId, n.name, null, row.email, 'email_infer', n.conf);
}
// Flag the best contact for personalization: owner-type roles first, then any named role, then confidence.
export async function promotePerson(listingId: number): Promise<void> {
  const best = await env.DB.prepare(
    `SELECT id FROM people WHERE listing_id = ?1
     ORDER BY (role IN ('Owner','Owner/Operator','Co-Owner','Founder','Co-Founder','President','Principal')) DESC,
              (role IS NOT NULL) DESC, confidence DESC LIMIT 1`,
  ).bind(listingId).first<{ id: number }>();
  if (!best) return;
  await env.DB.batch([
    env.DB.prepare(`UPDATE people SET is_primary = 0 WHERE listing_id = ?1`).bind(listingId),
    env.DB.prepare(`UPDATE people SET is_primary = 1 WHERE id = ?1`).bind(best.id),
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

export interface Coverage { total: number; withEmail: number; crawled: number; pending: number; candidates: number; verified: number; primary: number; withName: number; people: number }
export async function coverage(): Promise<Coverage> {
  const t = now();
  const primaryEmail = `(SELECT ec.email FROM email_candidates ec WHERE ec.listing_id = l.id AND ec.status = 'primary' LIMIT 1)`;
  const [tot, withE, crawled, cand, ppl] = await env.DB.batch([
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN l.website IS NOT NULL AND l.website != '' THEN 1 ELSE 0 END) AS sites FROM listings l WHERE l.status = 'active'`),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM listings l WHERE l.status = 'active' AND (
        (l.email IS NOT NULL AND l.email != '') OR ${primaryEmail} IS NOT NULL
        OR EXISTS (SELECT 1 FROM owner_listings ol JOIN owners o ON o.id = ol.owner_id WHERE ol.listing_id = l.id))`),
    env.DB.prepare(`SELECT SUM(CASE WHEN status IN ('done','no_site','error') THEN 1 ELSE 0 END) AS done, SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending FROM enrichment_state`),
    env.DB.prepare(`SELECT COUNT(*) AS n, SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS v, SUM(CASE WHEN status = 'primary' THEN 1 ELSE 0 END) AS p FROM email_candidates WHERE status != 'rejected'`),
    env.DB.prepare(`SELECT COUNT(*) AS total, COUNT(DISTINCT listing_id) AS listings FROM people`),
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
    people: (ppl.results[0] as { total: number } | undefined)?.total ?? 0,
    withName: (ppl.results[0] as { listings: number } | undefined)?.listings ?? 0,
  };
}

export interface PersonRow { id: number; name: string; role: string | null; email: string | null; source: string; confidence: number; is_primary: number }
export async function listingPeople(listingId: number): Promise<PersonRow[]> {
  return (await env.DB.prepare(
    `SELECT id, name, role, email, source, confidence, is_primary FROM people WHERE listing_id = ?1 ORDER BY is_primary DESC, confidence DESC LIMIT 12`,
  ).bind(listingId).all<PersonRow>()).results;
}
// Re-run name-from-email inference across all primary emails without re-fetching sites (fast pass).
export async function inferAllNames(limit = 2000): Promise<number> {
  const rows = (await env.DB.prepare(
    `SELECT ec.listing_id, ec.email FROM email_candidates ec
     WHERE ec.status = 'primary' AND NOT EXISTS (SELECT 1 FROM people p WHERE p.listing_id = ec.listing_id AND p.source = 'email_infer') LIMIT ?1`,
  ).bind(limit).all<{ listing_id: number; email: string }>()).results;
  let n = 0;
  for (const r of rows) {
    const nm = nameFromEmail(r.email.split('@')[0]);
    if (nm) { await upsertPerson(r.listing_id, nm.name, null, r.email, 'email_infer', nm.conf); await promotePerson(r.listing_id); n++; }
  }
  return n;
}

// ---- Paid provider (Hunter.io) — powers the "very powerful" tier when HUNTER_API_KEY is set ----
export function hunterEnabled(): boolean { return !!env.HUNTER_API_KEY; }

// Domain search: pull the most likely emails Hunter has for a company's domain.
export async function hunterEnrich(listingId: number, host: string): Promise<number> {
  if (!env.HUNTER_API_KEY) return 0;
  try {
    const res = await fetch(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(host)}&limit=5&api_key=${env.HUNTER_API_KEY}`);
    if (!res.ok) return 0;
    const j = (await res.json()) as { data?: { emails?: { value: string; confidence?: number; first_name?: string; last_name?: string; position?: string }[] } };
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
      // Hunter gives a name + position with each email — capture the person.
      const nm = `${e.first_name ?? ''} ${e.last_name ?? ''}`.trim();
      if (nm && /\s/.test(nm)) await upsertPerson(listingId, nm, e.position ? (normRole(e.position) ?? e.position.slice(0, 40)) : null, c.email, 'hunter', 80);
      n++;
    }
    if (n) { await promoteBest(listingId); await promotePerson(listingId); }
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
