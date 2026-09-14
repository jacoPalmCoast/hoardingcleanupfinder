import type { APIRoute } from 'astro';
import { env } from '../lib/env';
import { allCityPages, MIN_LISTINGS_FOR_PAGE } from '../lib/db';
import { SERVICES, SERVICE_BY_SLUG } from '../data/services';
import { parseServices } from '../lib/util';

// Every crawlable page with a one-line description. Large but plain; cached an hour.
export const GET: APIRoute = async () => {
  const base = env.SITE_URL;
  const cities = await allCityPages();
  // Two queries total (no per-city fan-out): service counts are aggregated in memory.
  const rows = await env.DB.prepare(`SELECT slug, name, city, city_slug, state, services, is_verified FROM listings WHERE status = 'active' ORDER BY state, city, name`).all<{ slug: string; name: string; city: string; city_slug: string; state: string; services: string; is_verified: number }>();
  const counts = new Map<string, Record<string, number>>();
  for (const l of rows.results) {
    const key = `${l.state}/${l.city_slug}`;
    const c = counts.get(key) ?? {};
    for (const s of parseServices(l.services)) c[s] = (c[s] ?? 0) + 1;
    counts.set(key, c);
  }
  const out: string[] = [`# ${env.SITE_NAME} — full page index`, ''];
  out.push('## Metro pages');
  for (const c of cities) {
    out.push(`- [Hoarding cleanup in ${c.name}, ${c.state}](${base}/${c.state.toLowerCase()}/${c.slug}): ${c.listing_count} companies`);
    const cc = counts.get(`${c.state}/${c.slug}`) ?? {};
    for (const s of SERVICES) if ((cc[s.slug] ?? 0) >= MIN_LISTINGS_FOR_PAGE) out.push(`  - [${s.name} in ${c.name}, ${c.state}](${base}/${c.state.toLowerCase()}/${c.slug}/${s.slug}): ${cc[s.slug]} companies`);
  }
  out.push('', '## Companies');
  for (const l of rows.results) {
    const svc = parseServices(l.services).map((s) => SERVICE_BY_SLUG[s]?.name.toLowerCase()).filter(Boolean).join(', ');
    out.push(`- [${l.name}](${base}/company/${l.slug}): ${svc} in ${l.city}, ${l.state}${l.is_verified ? ' (verified)' : ''}`);
  }
  out.push('');
  return new Response(out.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
