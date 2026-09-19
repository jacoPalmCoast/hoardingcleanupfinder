// CSV export of one listing's daily performance, for the signed-in owner of that listing.
import type { APIRoute } from 'astro';
import { currentOwner, ownerOwns } from '../../../lib/services';
import { getListingById, listingSeries } from '../../../lib/db';

const esc = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const dayToIso = (day: number) => new Date(day * 86400 * 1000).toISOString().slice(0, 10);

export const GET: APIRoute = async ({ request, url }) => {
  const owner = await currentOwner(request);
  if (!owner) return new Response('Forbidden', { status: 403 });
  const id = Number(url.searchParams.get('id') ?? 0);
  if (!Number.isInteger(id) || !(await ownerOwns(owner.id, id))) return new Response('Forbidden', { status: 403 });
  const listing = await getListingById(id);
  if (!listing) return new Response('Not found', { status: 404 });
  const daysRaw = Number(url.searchParams.get('days'));
  const days = [7, 30, 90].includes(daysRaw) ? daysRaw : 30;
  const series = await listingSeries(id, days);
  const rows: (string | number)[][] = [['date', 'views', 'call_taps', 'website_clicks']];
  for (const p of series) rows.push([dayToIso(p.day), p.views, p.calls, p.website]);
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
  return new Response(body, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="performance-${listing.slug}-${days}d.csv"`, 'cache-control': 'private, no-store' } });
};
