import { env } from './env';
import { getSetting, setSetting } from './settings';
import { slugify, digits, safeUrl } from './util';
import { isService } from '../data/services';
import { isState } from '../data/states';

// New-listing discovery agent. Uses Google Places API (New) Text Search to sweep target
// cities on a weekly rotation, dedupes finds against existing listings by phone number, and
// inserts new cleanup businesses as `pending` (source='discovery') into the admin review queue
// — nothing goes public without approval. OFF by default: needs both the `discovery_enabled`
// setting AND the GOOGLE_PLACES_KEY secret. A hard monthly call cap bounds the API bill.
//
// It never scrapes search-result pages or third-party directories — only the official Places API.

const SEARCH_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.addressComponents';

// Each query costs one Places call per city. Ordered by value; queriesPerCity picks the first N.
const QUERIES: { q: string; service: string }[] = [
  { q: 'hoarding cleanup', service: 'hoarding-cleanup' },
  { q: 'biohazard cleanup', service: 'biohazard-cleanup' },
  { q: 'crime scene cleanup', service: 'unattended-death-cleanup' },
  { q: 'estate cleanout', service: 'estate-cleanout' },
];

export interface DiscoveryConfig {
  enabled: boolean;
  citiesPerRun: number;
  queriesPerCity: number;
  monthlyCap: number;
  intervalDays: number;
  lastRun: number | null;
  callsThisMonth: number;
}

const posInt = (v: string | null | undefined, d: number) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : d; };
const anyInt = (v: string | null | undefined) => { const n = parseInt(v ?? '0', 10); return Number.isFinite(n) ? n : 0; };

export function discoveryKeyReady(): boolean { return !!env.GOOGLE_PLACES_KEY; }
function monthKey(ts = Date.now()): string { const d = new Date(ts); return `discovery_calls_${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; }

export async function discoveryConfig(): Promise<DiscoveryConfig> {
  const [enabled, cpr, qpc, cap, last, used] = await Promise.all([
    getSetting('discovery_enabled'), getSetting('discovery_cities_per_run'), getSetting('discovery_queries_per_city'),
    getSetting('discovery_monthly_cap'), getSetting('discovery_last_run'), getSetting(monthKey()),
  ]);
  return {
    enabled: enabled === 'on',
    citiesPerRun: posInt(cpr, 8),
    queriesPerCity: Math.min(QUERIES.length, posInt(qpc, 2)),
    monthlyCap: posInt(cap, 2000),
    intervalDays: 7,
    lastRun: last ? Number(last) : null,
    callsThisMonth: anyInt(used),
  };
}

interface PlaceHit { placeId: string; name: string; phone: string | null; website: string | null; address: string | null; city: string | null; state: string | null; zip: string | null }

function parsePlace(p: any): PlaceHit | null {
  const name = (p?.displayName?.text ?? '').trim();
  if (!name) return null;
  let city: string | null = null, state: string | null = null, zip: string | null = null;
  for (const c of (p?.addressComponents ?? [])) {
    const types: string[] = c?.types ?? [];
    if (types.includes('locality') && !city) city = c.longText ?? c.shortText ?? null;
    if (types.includes('administrative_area_level_1') && !state) state = (c.shortText ?? '').toUpperCase() || null;
    if (types.includes('postal_code') && !zip) zip = (c.longText ?? c.shortText ?? '').slice(0, 5) || null;
  }
  return { placeId: p?.id ?? '', name, phone: p?.nationalPhoneNumber ?? null, website: p?.websiteUri ?? null, address: p?.formattedAddress ?? null, city, state, zip };
}

async function searchCity(query: string, city: string, state: string): Promise<PlaceHit[]> {
  const res = await fetch(SEARCH_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_PLACES_KEY!, 'X-Goog-FieldMask': FIELD_MASK },
    body: JSON.stringify({ textQuery: `${query} in ${city}, ${state}`, maxResultCount: 20, regionCode: 'US' }),
  });
  if (!res.ok) throw new Error(`places ${res.status}`);
  const j = (await res.json()) as { places?: any[] };
  return (j.places ?? []).map(parsePlace).filter((h): h is PlaceHit => !!h);
}

// Returns true if a new pending listing was inserted.
async function considerHit(h: PlaceHit, qCity: string, qState: string, service: string): Promise<boolean> {
  const pd = digits(h.phone);
  if (pd.length !== 10) return false; // need a phone: it's how we dedupe, and a quality signal
  if (await env.DB.prepare(`SELECT id FROM listings WHERE phone_digits = ?1 AND status != 'removed'`).bind(pd).first()) return false;
  if (h.placeId && (await env.DB.prepare(`SELECT id FROM listings WHERE place_id = ?1`).bind(h.placeId).first())) return false;
  const name = h.name.slice(0, 120);
  const city = (h.city || qCity).slice(0, 80);
  const state = h.state && isState(h.state) ? h.state : qState;
  if (!isState(state)) return false;
  const svc = isService(service) ? service : 'hoarding-cleanup';
  const website = h.website ? safeUrl(h.website) : null;
  let slug = slugify(`${name} ${city} ${state}`);
  if (await env.DB.prepare(`SELECT 1 FROM listings WHERE slug = ?1`).bind(slug).first()) slug = `${slug}-${pd.slice(-4)}`;
  await env.DB.prepare(
    `INSERT INTO listings(slug, name, phone, phone_digits, website, address, city, city_slug, state, zip, description, services, status, source, place_id)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,'pending','discovery',?13)`,
  ).bind(slug, name, h.phone, pd, website, h.address, city, slugify(city), state, h.zip, `Found via directory scan in ${city}, ${state}. Details are unverified until reviewed.`, JSON.stringify([svc]), h.placeId || null).run();
  return true;
}

export interface DiscoveryResult { found: number; scanned: number; calls: number; skipped: string }

// Runs one discovery pass. From the nightly cron it self-gates to weekly and honours the toggle;
// from the admin "Run now" pass force:true to bypass those (the monthly cap still applies).
export async function runDiscovery(opts: { force?: boolean; maxCities?: number } = {}): Promise<DiscoveryResult> {
  const cfg = await discoveryConfig();
  if (!discoveryKeyReady()) return { found: 0, scanned: 0, calls: 0, skipped: 'no-key' };
  if (!cfg.enabled && !opts.force) return { found: 0, scanned: 0, calls: 0, skipped: 'off' };
  if (!opts.force && cfg.lastRun && Date.now() / 1000 - cfg.lastRun < cfg.intervalDays * 86400) {
    return { found: 0, scanned: 0, calls: 0, skipped: 'interval' };
  }
  const mk = monthKey();
  const used = cfg.callsThisMonth;
  if (used >= cfg.monthlyCap) return { found: 0, scanned: 0, calls: 0, skipped: 'cap' };

  // Rotate through the cities table by id using a saved cursor so every metro gets swept over time.
  const cursor = anyInt(await getSetting('discovery_cursor'));
  const limit = Math.max(1, opts.maxCities ?? cfg.citiesPerRun);
  let cities = (await env.DB.prepare(`SELECT id, name, state FROM cities WHERE id > ?1 ORDER BY id LIMIT ?2`).bind(cursor, limit).all<{ id: number; name: string; state: string }>()).results;
  let wrapped = false;
  if (cities.length === 0) { wrapped = true; cities = (await env.DB.prepare(`SELECT id, name, state FROM cities ORDER BY id LIMIT ?1`).bind(limit).all<{ id: number; name: string; state: string }>()).results; }

  let found = 0, calls = 0, scanned = 0, lastId = cursor;
  outer: for (const c of cities) {
    scanned++; lastId = c.id;
    for (let qi = 0; qi < cfg.queriesPerCity; qi++) {
      if (used + calls >= cfg.monthlyCap) break outer;
      const { q, service } = QUERIES[qi];
      calls++;
      try {
        for (const h of await searchCity(q, c.name, c.state)) if (await considerHit(h, c.name, c.state, service)) found++;
      } catch (e) { console.error('discovery', c.name, q, (e as Error)?.message); }
    }
  }
  // Advance the cursor; if we reached the end (fewer rows than asked, or we already wrapped), reset to 0.
  await setSetting('discovery_cursor', String(wrapped || cities.length < limit ? 0 : lastId));
  await setSetting(mk, String(used + calls));
  await setSetting('discovery_last_run', String(Math.floor(Date.now() / 1000)));
  return { found, scanned, calls, skipped: '' };
}
