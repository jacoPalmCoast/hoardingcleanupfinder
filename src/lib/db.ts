import { env } from './env';
import { now } from './util';

export interface Listing {
  id: number;
  slug: string;
  name: string;
  phone: string | null;
  phone_digits: string | null;
  website: string | null;
  email: string | null;
  address: string | null;
  city: string;
  city_slug: string;
  state: string;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  services: string;
  rating: number | null;
  review_count: number;
  is_verified: number;
  is_claimed: number;
  is_featured: number;
  featured_until: number | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  plan_interval: string | null;
  plan_amount: number | null;
  cancel_at_period_end: number;
  dunning_started_at: number | null;
  status: string;
  source: string | null;
  place_id: string | null;
  created_at: number;
  updated_at: number;
  attrs: string;
  long_about: string | null;
  custom_faq: string | null;
}

export interface City {
  id: number;
  slug: string;
  name: string;
  state: string;
  lat: number | null;
  lng: number | null;
  population: number | null;
  intro: string | null;
  body: string | null;      // bespoke local HTML for top metros; null falls back to generated context
  listing_count?: number;
}

export const MIN_LISTINGS_FOR_PAGE = 3;

// Ordering: featured (and paid-up) first, then verified, then owner-managed (claimed), then by review count. Invariant 2.
const ORDER = `ORDER BY (is_featured = 1 AND featured_until > ?1) DESC, is_verified DESC, is_claimed DESC, (services LIKE '%hoarding-cleanup%') DESC, review_count DESC, name ASC`;

export function isLive(l: Pick<Listing, 'is_featured' | 'featured_until'>): boolean {
  return l.is_featured === 1 && (l.featured_until ?? 0) > now();
}

export async function getListingBySlug(slug: string): Promise<Listing | null> {
  return (await env.DB.prepare(`SELECT * FROM listings WHERE slug = ?1 AND status != 'removed'`).bind(slug).first<Listing>()) ?? null;
}

export async function getListingById(id: number): Promise<Listing | null> {
  return (await env.DB.prepare(`SELECT * FROM listings WHERE id = ?1`).bind(id).first<Listing>()) ?? null;
}

export async function listingsForCity(state: string, citySlug: string, service?: string, limit = 200): Promise<Listing[]> {
  const t = now();
  if (service) {
    const r = await env.DB.prepare(
      `SELECT * FROM listings WHERE state = ?2 AND city_slug = ?3 AND status = 'active' AND services LIKE ?4 ${ORDER} LIMIT ?5`,
    )
      .bind(t, state, citySlug, `%"${service}"%`, limit)
      .all<Listing>();
    return r.results;
  }
  const r = await env.DB.prepare(`SELECT * FROM listings WHERE state = ?2 AND city_slug = ?3 AND status = 'active' ${ORDER} LIMIT ?4`)
    .bind(t, state, citySlug, limit)
    .all<Listing>();
  return r.results;
}

export async function listingsForState(state: string, limit = 60): Promise<Listing[]> {
  const t = now();
  const r = await env.DB.prepare(`SELECT * FROM listings WHERE state = ?2 AND status = 'active' ${ORDER} LIMIT ?3`).bind(t, state, limit).all<Listing>();
  return r.results;
}

export async function citiesForState(state: string): Promise<City[]> {
  const r = await env.DB.prepare(
    `SELECT c.*, COUNT(l.id) AS listing_count FROM cities c
     LEFT JOIN listings l ON l.state = c.state AND l.city_slug = c.slug AND l.status = 'active'
     WHERE c.state = ?1 GROUP BY c.id HAVING listing_count >= ?2 ORDER BY listing_count DESC, c.name ASC`,
  )
    .bind(state, MIN_LISTINGS_FOR_PAGE)
    .all<City>();
  return r.results;
}

export async function topCities(limit = 24): Promise<City[]> {
  const r = await env.DB.prepare(
    `SELECT c.*, COUNT(l.id) AS listing_count FROM cities c
     JOIN listings l ON l.state = c.state AND l.city_slug = c.slug AND l.status = 'active'
     GROUP BY c.id HAVING listing_count >= ?1 ORDER BY listing_count DESC, c.population DESC LIMIT ?2`,
  )
    .bind(MIN_LISTINGS_FOR_PAGE, limit)
    .all<City>();
  return r.results;
}

export async function allCityPages(): Promise<City[]> {
  const r = await env.DB.prepare(
    `SELECT c.*, COUNT(l.id) AS listing_count FROM cities c
     JOIN listings l ON l.state = c.state AND l.city_slug = c.slug AND l.status = 'active'
     GROUP BY c.id HAVING listing_count >= ?1 ORDER BY c.state, c.name`,
  )
    .bind(MIN_LISTINGS_FOR_PAGE)
    .all<City>();
  return r.results;
}

export async function getCity(state: string, slug: string): Promise<City | null> {
  const c = await env.DB.prepare(`SELECT * FROM cities WHERE state = ?1 AND slug = ?2`).bind(state, slug).first<City>();
  return c ?? null;
}

export async function statesWithCounts(): Promise<{ state: string; n: number }[]> {
  const r = await env.DB.prepare(`SELECT state, COUNT(*) AS n FROM listings WHERE status = 'active' GROUP BY state ORDER BY state`).all<{ state: string; n: number }>();
  return r.results;
}

export async function countByCityService(state: string, citySlug: string): Promise<Record<string, number>> {
  const r = await env.DB.prepare(`SELECT services FROM listings WHERE state = ?1 AND city_slug = ?2 AND status = 'active'`).bind(state, citySlug).all<{ services: string }>();
  const out: Record<string, number> = {};
  for (const row of r.results) {
    try {
      for (const s of JSON.parse(row.services)) out[s] = (out[s] ?? 0) + 1;
    } catch {}
  }
  return out;
}

export async function searchListings(q: string, service?: string, limit = 50): Promise<Listing[]> {
  const t = now();
  const cleaned = q.replace(/[^\w\s]/g, ' ').trim();
  if (!cleaned) return [];
  // Prefix-match every term; FTS5 MATCH with quoted terms to avoid syntax errors.
  const match = cleaned
    .split(/\s+/)
    .slice(0, 6)
    .map((w) => `"${w}"*`)
    .join(' ');
  const svc = service ? ` AND l.services LIKE '%"${service.replace(/[^a-z-]/g, '')}"%'` : '';
  // Location relevance first: a company in the searched city/state must always rank above one that only
  // matched on name or services text (e.g. a Denver firm named "Phoenix Restoration" must not outrank
  // actual Phoenix companies in a "Phoenix" search). Featured placement then applies *within* the
  // correct location, not across it. For free-text queries no row matches location and ranking falls
  // through to featured + bm25 exactly as before. ?4 = query lowercased ("phoenix", "phoenix az"),
  // ?5 = query uppercased for a bare state code ("FL"). City+state stored as "City" / "AZ".
  const qLower = cleaned.toLowerCase();
  const qUpper = cleaned.toUpperCase();
  const r = await env.DB.prepare(
    `SELECT l.* FROM listings_fts f JOIN listings l ON l.id = f.rowid
     WHERE listings_fts MATCH ?2 AND l.status = 'active'${svc}
     ORDER BY
       (lower(l.city) = ?4 OR lower(l.city) || ' ' || lower(l.state) = ?4 OR l.state = ?5) DESC,
       (l.is_featured = 1 AND l.featured_until > ?1) DESC,
       l.is_verified DESC, bm25(listings_fts), l.review_count DESC LIMIT ?3`,
  )
    .bind(t, match, limit, qLower, qUpper)
    .all<Listing>();
  return r.results;
}

export async function searchByZip(zip: string, limit = 50): Promise<Listing[]> {
  const t = now();
  const r = await env.DB.prepare(`SELECT * FROM listings WHERE zip LIKE ?2 AND status = 'active' ${ORDER} LIMIT ?3`).bind(t, `${zip.slice(0, 3)}%`, limit).all<Listing>();
  return r.results;
}

export async function nearbyListings(lat: number, lng: number, limit = 12, excludeId?: number): Promise<Listing[]> {
  const t = now();
  const r = await env.DB.prepare(
    `SELECT *, ((lat - ?2)*(lat - ?2) + (lng - ?3)*(lng - ?3)) AS d2 FROM listings
     WHERE status = 'active' AND lat IS NOT NULL AND id != ?4
     ORDER BY (is_featured = 1 AND featured_until > ?1) DESC, d2 ASC LIMIT ?5`,
  )
    .bind(t, lat, lng, excludeId ?? -1, limit)
    .all<Listing>();
  return r.results;
}

export async function adminCounts() {
  const t = now();
  const row = await env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM listings WHERE status = 'active') AS active,
      (SELECT COUNT(*) FROM listings WHERE status = 'pending') AS pending,
      (SELECT COUNT(*) FROM listings WHERE status = 'removed') AS removed,
      (SELECT COUNT(*) FROM listings WHERE is_claimed = 1) AS claimed,
      (SELECT COUNT(*) FROM listings WHERE is_verified = 1) AS verified,
      (SELECT COUNT(*) FROM listings WHERE is_featured = 1 AND featured_until > ?1) AS featured,
      (SELECT COUNT(*) FROM leads WHERE created_at > ?1 - 2592000) AS leads_30d,
      (SELECT COUNT(*) FROM reports WHERE status = 'open') AS open_reports,
      (SELECT COUNT(*) FROM reviews WHERE status = 'pending') AS pending_reviews,
      (SELECT COUNT(*) FROM cities) AS cities`,
  )
    .bind(t)
    .first<Record<string, number>>();
  return row!;
}

// Fixed-window rate limit in D1, atomic via upsert. Returns true when allowed.
export async function rateLimit(key: string, max: number, windowSec: number): Promise<boolean> {
  const t = now();
  const row = await env.DB.prepare(
    `INSERT INTO rate_limits(key, count, window_start) VALUES (?1, 1, ?2)
     ON CONFLICT(key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start <= ?2 - ?3 THEN ?2 ELSE rate_limits.window_start END
     RETURNING count`,
  )
    .bind(key, t, windowSec)
    .first<{ count: number }>();
  if (Math.random() < 0.02) await env.DB.prepare(`DELETE FROM rate_limits WHERE window_start < ?1`).bind(t - 86400).run();
  return (row?.count ?? max + 1) <= max;
}

// ---------- P0 email log + suppression ----------
export async function isSuppressed(email: string): Promise<boolean> {
  const r = await env.DB.prepare(`SELECT 1 AS ok FROM suppressions WHERE email = ?1`).bind(email.toLowerCase()).first();
  return !!r;
}
export async function addSuppression(email: string, reason: 'unsubscribe' | 'bounce' | 'complaint', source?: string): Promise<void> {
  await env.DB.prepare(`INSERT OR IGNORE INTO suppressions(email, reason, source) VALUES (?1, ?2, ?3)`)
    .bind(email.toLowerCase(), reason, source ?? null).run();
}
export interface EmailLog {
  to_email: string; stream: string; type?: string; subject?: string;
  listing_id?: number; owner_id?: number; resend_id?: string; status: 'sent' | 'failed' | 'suppressed'; error?: string;
}
export async function logEmail(e: EmailLog): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO emails(to_email, stream, type, subject, listing_id, owner_id, resend_id, status, error)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  ).bind(e.to_email.toLowerCase(), e.stream, e.type ?? null, e.subject ?? null, e.listing_id ?? null, e.owner_id ?? null, e.resend_id ?? null, e.status, e.error ?? null).run();
}
// field is from a fixed allowlist (never user input) — safe to interpolate.
export async function markEmailByResendId(resendId: string, field: 'delivered_at' | 'opened_at' | 'clicked_at' | 'bounced_at' | 'complained_at'): Promise<void> {
  await env.DB.prepare(`UPDATE emails SET ${field} = unixepoch() WHERE resend_id = ?1`).bind(resendId).run();
}

// ---------- Native visitor reviews ----------
// Collected on-site, moderated before display, and kept separate from the Google
// rating on the listing. Only `status = 'approved'` rows are ever shown publicly.
export interface Review {
  id: number;
  listing_id: number;
  author: string;
  rating: number;
  body: string;
  email: string | null;
  ip: string | null;
  status: string;
  created_at: number;
  moderated_at: number | null;
}

export async function addReview(r: { listingId: number; author: string; rating: number; body: string; email?: string; ip?: string }): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO reviews(listing_id, author, rating, body, email, ip) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
  ).bind(r.listingId, r.author, r.rating, r.body, r.email ?? null, r.ip ?? null).run();
}

// Public: approved reviews for a listing, newest first.
export async function approvedReviews(listingId: number, limit = 30): Promise<Review[]> {
  const r = await env.DB.prepare(
    `SELECT * FROM reviews WHERE listing_id = ?1 AND status = 'approved' ORDER BY created_at DESC LIMIT ?2`,
  ).bind(listingId, limit).all<Review>();
  return r.results;
}

// Admin: the moderation queue (pending first, then recently moderated for context).
export async function reviewsForModeration(limit = 200): Promise<(Review & { name: string; slug: string })[]> {
  const r = await env.DB.prepare(
    `SELECT rv.*, l.name, l.slug FROM reviews rv JOIN listings l ON l.id = rv.listing_id
     WHERE rv.status = 'pending' ORDER BY rv.created_at ASC LIMIT ?1`,
  ).bind(limit).all<Review & { name: string; slug: string }>();
  return r.results;
}

export async function moderateReview(id: number, status: 'approved' | 'rejected'): Promise<void> {
  await env.DB.prepare(`UPDATE reviews SET status = ?2, moderated_at = unixepoch() WHERE id = ?1`).bind(id, status).run();
}

// ---------- Admin: email log + suppression management ----------
export interface EmailRow {
  id: number; to_email: string; stream: string; type: string | null; subject: string | null;
  status: string; error: string | null; created_at: number;
  delivered_at: number | null; opened_at: number | null; clicked_at: number | null;
  bounced_at: number | null; complained_at: number | null;
}
export async function recentEmails(limit = 100): Promise<EmailRow[]> {
  return (await env.DB.prepare(`SELECT id, to_email, stream, type, subject, status, error, created_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at FROM emails ORDER BY created_at DESC LIMIT ?1`).bind(limit).all<EmailRow>()).results;
}
export interface EmailStats { total: number; sent: number; failed: number; suppressed: number; bounced: number; complained: number }
export async function emailStats(): Promise<EmailStats> {
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
      SUM(status='sent') AS sent, SUM(status='failed') AS failed, SUM(status='suppressed') AS suppressed,
      SUM(bounced_at IS NOT NULL) AS bounced, SUM(complained_at IS NOT NULL) AS complained
     FROM emails WHERE created_at > ?1`,
  ).bind(now() - 30 * 86400).first<EmailStats>();
  return r ?? { total: 0, sent: 0, failed: 0, suppressed: 0, bounced: 0, complained: 0 };
}
export interface Suppression { email: string; reason: string; source: string | null; created_at: number }
export async function listSuppressions(limit = 200): Promise<Suppression[]> {
  return (await env.DB.prepare(`SELECT email, reason, source, created_at FROM suppressions ORDER BY created_at DESC LIMIT ?1`).bind(limit).all<Suppression>()).results;
}
export async function removeSuppression(email: string): Promise<void> {
  await env.DB.prepare(`DELETE FROM suppressions WHERE email = ?1`).bind(email.toLowerCase()).run();
}

// ---------- Visitor analytics (reporting side) ----------
// Reads durable per-day counts from events_daily (rolled up nightly) and adds the current day's raw
// click events so today isn't missing. Impressions are reported through the last rollup (yesterday).
export interface ListingStats {
  views: number; unique_views: number; calls: number; website: number; directions: number;
  impressions: number; leads: number; reviews: number;
}
const emptyStats = (): ListingStats => ({ views: 0, unique_views: 0, calls: 0, website: 0, directions: 0, impressions: 0, leads: 0, reviews: 0 });
function addKind(s: ListingStats, kind: string, n: number, u: number): void {
  if (kind === 'view') { s.views += n; s.unique_views += u; }
  else if (kind === 'call') s.calls += n;
  else if (kind === 'website') s.website += n;
  else if (kind === 'directions') s.directions += n;
  else if (kind === 'impression') s.impressions += n;
}

export async function listingStats(listingId: number, days: number): Promise<ListingStats> {
  const dayNum = Math.floor(now() / 86400);
  const startDay = dayNum - (days - 1);
  const startTs = startDay * 86400;
  const todayTs = dayNum * 86400;
  const [rollup, today, leadsRow, revRow] = await env.DB.batch([
    env.DB.prepare(`SELECT kind, SUM(n) AS n, SUM(uniques) AS u FROM events_daily WHERE listing_id = ?1 AND day >= ?2 GROUP BY kind`).bind(listingId, startDay),
    env.DB.prepare(`SELECT kind, COUNT(*) AS n, COUNT(DISTINCT session) AS u FROM events WHERE listing_id = ?1 AND created_at >= ?2 GROUP BY kind`).bind(listingId, todayTs),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE listing_id = ?1 AND created_at >= ?2`).bind(listingId, startTs),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE listing_id = ?1 AND created_at >= ?2`).bind(listingId, startTs),
  ]);
  const s = emptyStats();
  for (const r of rollup.results as { kind: string; n: number; u: number }[]) addKind(s, r.kind, r.n || 0, r.u || 0);
  for (const r of today.results as { kind: string; n: number; u: number }[]) addKind(s, r.kind, r.n || 0, r.u || 0);
  s.leads = (leadsRow.results[0] as { n: number } | undefined)?.n || 0;
  s.reviews = (revRow.results[0] as { n: number } | undefined)?.n || 0;
  return s;
}

// Fixed calendar window (both day numbers inclusive) — used by the monthly report. Fully in the
// past, so events_daily has it all; no today-raw merge needed.
export async function statsForDayRange(listingId: number, startDay: number, endDay: number): Promise<ListingStats> {
  const startTs = startDay * 86400;
  const endTs = (endDay + 1) * 86400;
  const [rollup, leadsRow, revRow] = await env.DB.batch([
    env.DB.prepare(`SELECT kind, SUM(n) AS n, SUM(uniques) AS u FROM events_daily WHERE listing_id = ?1 AND day BETWEEN ?2 AND ?3 GROUP BY kind`).bind(listingId, startDay, endDay),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE listing_id = ?1 AND created_at >= ?2 AND created_at < ?3`).bind(listingId, startTs, endTs),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE listing_id = ?1 AND created_at >= ?2 AND created_at < ?3`).bind(listingId, startTs, endTs),
  ]);
  const s = emptyStats();
  for (const r of rollup.results as { kind: string; n: number; u: number }[]) addKind(s, r.kind, r.n || 0, r.u || 0);
  s.leads = (leadsRow.results[0] as { n: number } | undefined)?.n || 0;
  s.reviews = (revRow.results[0] as { n: number } | undefined)?.n || 0;
  return s;
}

// Per-listing breakdown by traffic source, device and country. Reads the raw `events` table (kept
// ~92 days), which is why the analytics UI caps the window at 90 days — the breakdown is always
// complete for the offered ranges. view/call/website only (impressions carry no per-listing source).
export interface SourceRow { ref: string; views: number; calls: number; website: number }
export interface DimRow { label: string; n: number }
export interface ListingBreakdown { sources: SourceRow[]; devices: DimRow[]; countries: DimRow[] }
export async function listingBreakdown(listingId: number, days: number): Promise<ListingBreakdown> {
  const startTs = (Math.floor(now() / 86400) - (days - 1)) * 86400;
  const rows = (await env.DB.prepare(
    `SELECT ref, kind, ua, country, COUNT(*) AS n FROM events
     WHERE listing_id = ?1 AND kind IN ('view','call','website') AND created_at >= ?2
     GROUP BY ref, kind, ua, country`,
  ).bind(listingId, startTs).all<{ ref: string | null; kind: string; ua: string | null; country: string | null; n: number }>()).results;
  const src = new Map<string, SourceRow>();
  const dev = new Map<string, number>();
  const cty = new Map<string, number>();
  for (const r of rows) {
    const ref = r.ref || 'direct';
    const s = src.get(ref) ?? { ref, views: 0, calls: 0, website: 0 };
    if (r.kind === 'view') s.views += r.n; else if (r.kind === 'call') s.calls += r.n; else if (r.kind === 'website') s.website += r.n;
    src.set(ref, s);
    if (r.kind === 'view') {
      dev.set(r.ua || 'unknown', (dev.get(r.ua || 'unknown') || 0) + r.n);
      cty.set(r.country || '—', (cty.get(r.country || '—') || 0) + r.n);
    }
  }
  const total = (s: SourceRow) => s.views + s.calls + s.website;
  return {
    sources: [...src.values()].sort((a, b) => total(b) - total(a)),
    devices: [...dev.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n),
    countries: [...cty.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n).slice(0, 8),
  };
}

// ---------- Search demand ----------
export interface SearchRow { q: string; service: string; searches: number; avg_results: number; max_featured: number; max_results: number }
export async function topSearches(days: number, limit = 40): Promise<SearchRow[]> {
  const startTs = (Math.floor(now() / 86400) - (days - 1)) * 86400;
  return (await env.DB.prepare(
    `SELECT q, service, COUNT(*) AS searches, AVG(results_n) AS avg_results, MAX(featured_n) AS max_featured, MAX(results_n) AS max_results
     FROM searches WHERE created_at >= ?1 GROUP BY q, service ORDER BY searches DESC, q LIMIT ?2`,
  ).bind(startTs, limit).all<SearchRow>()).results;
}
// Queries that never surfaced a featured seller — the sell/recruit opportunity list.
export async function unmetDemand(days: number, limit = 40): Promise<SearchRow[]> {
  const startTs = (Math.floor(now() / 86400) - (days - 1)) * 86400;
  return (await env.DB.prepare(
    `SELECT q, service, COUNT(*) AS searches, AVG(results_n) AS avg_results, MAX(featured_n) AS max_featured, MAX(results_n) AS max_results
     FROM searches WHERE created_at >= ?1 GROUP BY q, service HAVING MAX(featured_n) = 0 ORDER BY searches DESC, q LIMIT ?2`,
  ).bind(startTs, limit).all<SearchRow>()).results;
}
export async function searchCount(days: number): Promise<number> {
  const startTs = (Math.floor(now() / 86400) - (days - 1)) * 86400;
  return ((await env.DB.prepare(`SELECT COUNT(*) AS n FROM searches WHERE created_at >= ?1`).bind(startTs).first<{ n: number }>())?.n) ?? 0;
}

export interface DayPoint { day: number; views: number; calls: number; website: number }
// Dense daily series (oldest→newest), gaps filled with zeros, for a sparkline.
export async function listingSeries(listingId: number, days: number): Promise<DayPoint[]> {
  const dayNum = Math.floor(now() / 86400);
  const startDay = dayNum - (days - 1);
  const rows = (await env.DB.prepare(
    `SELECT day,
        SUM(CASE WHEN kind='view' THEN n ELSE 0 END) AS views,
        SUM(CASE WHEN kind='call' THEN n ELSE 0 END) AS calls,
        SUM(CASE WHEN kind='website' THEN n ELSE 0 END) AS website
     FROM events_daily WHERE listing_id = ?1 AND day >= ?2 GROUP BY day`,
  ).bind(listingId, startDay).all<{ day: number; views: number; calls: number; website: number }>()).results;
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: DayPoint[] = [];
  for (let d = startDay; d <= dayNum; d++) {
    const r = byDay.get(d);
    out.push({ day: d, views: r?.views || 0, calls: r?.calls || 0, website: r?.website || 0 });
  }
  return out;
}

export interface TopListing { id: number; name: string; slug: string; city: string; state: string; views: number; calls: number; website: number }
export interface SiteOverview {
  totals: ListingStats;
  topListings: TopListing[];
  topCities: { city: string; state: string; views: number }[];
}
export async function siteOverview(days: number): Promise<SiteOverview> {
  const dayNum = Math.floor(now() / 86400);
  const startDay = dayNum - (days - 1);
  const startTs = startDay * 86400;
  const todayTs = dayNum * 86400;
  const [rollup, today, leadsRow, revRow, top, cities] = await env.DB.batch([
    env.DB.prepare(`SELECT kind, SUM(n) AS n, SUM(uniques) AS u FROM events_daily WHERE day >= ?1 GROUP BY kind`).bind(startDay),
    env.DB.prepare(`SELECT kind, COUNT(*) AS n, COUNT(DISTINCT session) AS u FROM events WHERE created_at >= ?1 AND kind != 'impression' GROUP BY kind`).bind(todayTs),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM leads WHERE created_at >= ?1`).bind(startTs),
    env.DB.prepare(`SELECT COUNT(*) AS n FROM reviews WHERE created_at >= ?1`).bind(startTs),
    env.DB.prepare(
      `SELECT ed.listing_id AS id, l.name, l.slug, l.city, l.state,
          SUM(CASE WHEN ed.kind='view' THEN ed.n ELSE 0 END) AS views,
          SUM(CASE WHEN ed.kind='call' THEN ed.n ELSE 0 END) AS calls,
          SUM(CASE WHEN ed.kind='website' THEN ed.n ELSE 0 END) AS website
       FROM events_daily ed JOIN listings l ON l.id = ed.listing_id
       WHERE ed.day >= ?1 AND ed.listing_id > 0
       GROUP BY ed.listing_id HAVING views > 0 ORDER BY views DESC LIMIT 20`,
    ).bind(startDay),
    env.DB.prepare(
      `SELECT l.city, l.state, SUM(ed.n) AS views
       FROM events_daily ed JOIN listings l ON l.id = ed.listing_id
       WHERE ed.day >= ?1 AND ed.kind = 'view' AND ed.listing_id > 0
       GROUP BY l.city, l.state ORDER BY views DESC LIMIT 15`,
    ).bind(startDay),
  ]);
  const totals = emptyStats();
  for (const r of rollup.results as { kind: string; n: number; u: number }[]) addKind(totals, r.kind, r.n || 0, r.u || 0);
  for (const r of today.results as { kind: string; n: number; u: number }[]) addKind(totals, r.kind, r.n || 0, r.u || 0);
  totals.leads = (leadsRow.results[0] as { n: number } | undefined)?.n || 0;
  totals.reviews = (revRow.results[0] as { n: number } | undefined)?.n || 0;
  return {
    totals,
    topListings: top.results as TopListing[],
    topCities: cities.results as { city: string; state: string; views: number }[],
  };
}

// ---------- Nightly rollup + prune (called by the daily cron) ----------
// Aggregate every raw day that is complete (day < today) and not yet rolled. Idempotent via
// events_rollup_state. Impression rows carry a JSON id list that is exploded into per-listing counts.
export async function rollupEvents(maxDays = 30): Promise<number> {
  const today = Math.floor(now() / 86400);
  const done = new Set((await env.DB.prepare(`SELECT day FROM events_rollup_state`).all<{ day: number }>()).results.map((r) => r.day));
  const daysWithData = (await env.DB.prepare(
    `SELECT DISTINCT created_at / 86400 AS day FROM events WHERE created_at < ?1 ORDER BY day`,
  ).bind(today * 86400).all<{ day: number }>()).results.map((r) => r.day).filter((d) => !done.has(d)).slice(0, maxDays);
  let rolled = 0;
  for (const day of daysWithData) {
    const from = day * 86400, to = (day + 1) * 86400;
    // Direct-kind events (view/call/website/directions): count + uniques per listing.
    const direct = (await env.DB.prepare(
      `SELECT listing_id, kind, COUNT(*) AS n, COUNT(DISTINCT session) AS u
       FROM events WHERE created_at >= ?1 AND created_at < ?2 AND kind != 'impression' AND listing_id IS NOT NULL
       GROUP BY listing_id, kind`,
    ).bind(from, to).all<{ listing_id: number; kind: string; n: number; u: number }>()).results;
    // Impression rows: explode the id lists into per-listing counts for the day.
    const impRows = (await env.DB.prepare(
      `SELECT ids FROM events WHERE created_at >= ?1 AND created_at < ?2 AND kind = 'impression' AND ids IS NOT NULL`,
    ).bind(from, to).all<{ ids: string }>()).results;
    const imp = new Map<number, number>();
    for (const row of impRows) {
      let arr: unknown;
      try { arr = JSON.parse(row.ids); } catch { arr = null; }
      if (Array.isArray(arr)) for (const id of arr) { const n = Number(id); if (Number.isInteger(n)) imp.set(n, (imp.get(n) || 0) + 1); }
    }
    const stmts = [
      ...direct.map((r) => env.DB.prepare(
        `INSERT INTO events_daily(day, listing_id, kind, n, uniques) VALUES (?1,?2,?3,?4,?5)
         ON CONFLICT(day, listing_id, kind) DO UPDATE SET n = n + ?4, uniques = uniques + ?5`,
      ).bind(day, r.listing_id, r.kind, r.n, r.u)),
      ...[...imp.entries()].map(([id, n]) => env.DB.prepare(
        `INSERT INTO events_daily(day, listing_id, kind, n, uniques) VALUES (?1,?2,'impression',?3,0)
         ON CONFLICT(day, listing_id, kind) DO UPDATE SET n = n + ?3`,
      ).bind(day, id, n)),
      env.DB.prepare(`INSERT OR IGNORE INTO events_rollup_state(day) VALUES (?1)`).bind(day),
    ];
    if (stmts.length) await env.DB.batch(stmts);
    rolled++;
  }
  return rolled;
}

// Drop raw rows once rolled up: impressions after 14 days, other events after 92.
export async function pruneEvents(): Promise<void> {
  const t = now();
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM events WHERE kind = 'impression' AND created_at < ?1`).bind(t - 14 * 86400),
    env.DB.prepare(`DELETE FROM events WHERE kind != 'impression' AND created_at < ?1`).bind(t - 92 * 86400),
    env.DB.prepare(`DELETE FROM events_rollup_state WHERE day < ?1`).bind(Math.floor(t / 86400) - 400),
    env.DB.prepare(`DELETE FROM searches WHERE created_at < ?1`).bind(t - 180 * 86400),
  ]);
}
