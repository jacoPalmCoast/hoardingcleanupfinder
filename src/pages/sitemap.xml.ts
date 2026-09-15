import type { APIRoute } from 'astro';
import { env } from '../lib/env';
import { allCityPages, statesWithCounts, countByCityService, MIN_LISTINGS_FOR_PAGE } from '../lib/db';
import { SERVICES } from '../data/services';
import { GUIDES } from '../data/guides';
import { isoDay } from '../lib/util';

export const GET: APIRoute = async () => {
  const base = env.SITE_URL;
  const urls: string[] = ['/', '/state', '/guides', '/about', '/add-listing'];
  for (const s of SERVICES) urls.push(`/services/${s.slug}`);
  for (const g of GUIDES) urls.push(`/guides/${g.slug}`);
  for (const s of await statesWithCounts()) urls.push(`/state/${s.state.toLowerCase()}`);
  const cities = await allCityPages();
  for (const c of cities) {
    urls.push(`/${c.state.toLowerCase()}/${c.slug}`);
    const counts = await countByCityService(c.state, c.slug);
    for (const s of SERVICES) if ((counts[s.slug] ?? 0) >= MIN_LISTINGS_FOR_PAGE) urls.push(`/${c.state.toLowerCase()}/${c.slug}/${s.slug}`);
  }
  const listings = await env.DB.prepare(`SELECT slug, updated_at FROM listings WHERE status = 'active' ORDER BY id`).all<{ slug: string; updated_at: number | string }>();
  const body =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `<url><loc>${base}${u}</loc></url>`).join('\n') +
    '\n' +
    listings.results.map((l) => { const lm = isoDay(l.updated_at); return `<url><loc>${base}/company/${l.slug}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`; }).join('\n') +
    `\n</urlset>`;
  return new Response(body, { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } });
};
