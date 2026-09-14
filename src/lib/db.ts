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
  status: string;
  source: string | null;
  place_id: string | null;
  created_at: number;
  updated_at: number;
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
  listing_count?: number;
}

export const MIN_LISTINGS_FOR_PAGE = 3;

// Ordering: featured (and paid-up) first, then verified, then by review count. Invariant 2.
const ORDER = `ORDER BY (is_featured = 1 AND featured_until > ?1) DESC, is_verified DESC, (services LIKE '%hoarding-cleanup%') DESC, review_count DESC, name ASC`;

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
  const r = await env.DB.prepare(
    `SELECT l.* FROM listings_fts f JOIN listings l ON l.id = f.rowid
     WHERE listings_fts MATCH ?2 AND l.status = 'active'${svc}
     ORDER BY (l.is_featured = 1 AND l.featured_until > ?1) DESC, l.is_verified DESC, bm25(listings_fts), l.review_count DESC LIMIT ?3`,
  )
    .bind(t, match, limit)
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
