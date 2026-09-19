// CSV export of analytics. Admin-gated by middleware (/api/admin/*). Two shapes:
//   ?days=30            → one row per listing (summary over the window, through yesterday)
//   ?days=30&id=887     → daily series for one listing
import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { now } from '../../../lib/util';
import { listingSeries, getListingById } from '../../../lib/db';

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const csv = (rows: (string | number)[][]) => rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
const dayToIso = (day: number) => new Date(day * 86400 * 1000).toISOString().slice(0, 10);
const respond = (body: string, filename: string) =>
  new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${filename}"`, 'cache-control': 'private, no-store' } });

export const GET: APIRoute = async ({ url }) => {
  const daysRaw = Number(url.searchParams.get('days'));
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const id = Number(url.searchParams.get('id') ?? 0);

  if (Number.isInteger(id) && id > 0) {
    const listing = await getListingById(id);
    if (!listing) return new Response('Not found', { status: 404 });
    const series = await listingSeries(id, days);
    const rows: (string | number)[][] = [['date', 'views', 'call_taps', 'website_clicks']];
    for (const p of series) rows.push([dayToIso(p.day), p.views, p.calls, p.website]);
    return respond(csv(rows), `analytics-${listing.slug}-${days}d.csv`);
  }

  const startDay = Math.floor(now() / 86400) - days;
  const startTs = startDay * 86400;
  const data = (await env.DB.prepare(
    `SELECT l.id, l.name, l.city, l.state,
       COALESCE(SUM(CASE WHEN ed.kind='view'       THEN ed.n END),0)        AS views,
       COALESCE(SUM(CASE WHEN ed.kind='view'       THEN ed.uniques END),0)  AS uniques,
       COALESCE(SUM(CASE WHEN ed.kind='call'       THEN ed.n END),0)        AS calls,
       COALESCE(SUM(CASE WHEN ed.kind='website'    THEN ed.n END),0)        AS website,
       COALESCE(SUM(CASE WHEN ed.kind='impression' THEN ed.n END),0)        AS impressions,
       COALESCE(ld.c,0) AS leads
     FROM events_daily ed
     JOIN listings l ON l.id = ed.listing_id
     LEFT JOIN (SELECT listing_id, COUNT(*) AS c FROM leads WHERE created_at >= ?2 GROUP BY listing_id) ld ON ld.listing_id = l.id
     WHERE ed.day >= ?1 AND ed.listing_id > 0
     GROUP BY l.id ORDER BY views DESC`,
  ).bind(startDay, startTs).all<{ id: number; name: string; city: string; state: string; views: number; uniques: number; calls: number; website: number; impressions: number; leads: number }>()).results;

  const rows: (string | number)[][] = [['listing_id', 'name', 'city', 'state', 'unique_visitors', 'page_views', 'call_taps', 'website_clicks', 'impressions', 'quote_requests']];
  for (const r of data) rows.push([r.id, r.name, r.city, r.state, r.uniques, r.views, r.calls, r.website, r.impressions, r.leads]);
  return respond(csv(rows), `analytics-all-listings-${days}d.csv`);
};
