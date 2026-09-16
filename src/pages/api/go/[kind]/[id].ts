import type { APIRoute } from 'astro';
import { getListingById } from '../../../../lib/db';
import { trackEvent, waitCtx, type EventSource } from '../../../../lib/events';
import { safeUrl } from '../../../../lib/util';

// Outbound click tracker. A listing's phone / website / directions links point here; we log the
// click (bots filtered) and 302 to the real target. Keeps click-to-call and website-click counts
// without any client JS. `?s=` carries the source page (city, search, …) for attribution.
const KINDS = new Set(['call', 'website', 'directions']);

export const GET: APIRoute = async ({ params, request, locals, url }) => {
  const kind = params.kind ?? '';
  const id = Number(params.id);
  if (!KINDS.has(kind) || !Number.isInteger(id)) return new Response('Not found', { status: 404 });
  const l = await getListingById(id);
  if (!l || l.status === 'removed') return new Response('Not found', { status: 404 });

  let target: string | null = null;
  if (kind === 'call') target = l.phone_digits ? `tel:${l.phone_digits}` : null;
  else if (kind === 'website') target = safeUrl(l.website);
  else if (kind === 'directions') {
    target = l.place_id
      ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(l.place_id)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${l.address ?? ''} ${l.city}, ${l.state}`)}`;
  }
  if (!target) return new Response('Not found', { status: 404 });

  const source = (url.searchParams.get('s') as EventSource) || 'company';
  trackEvent(kind as 'call' | 'website' | 'directions', id, request, source, waitCtx(locals));
  return new Response(null, { status: 302, headers: { location: target, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
};
