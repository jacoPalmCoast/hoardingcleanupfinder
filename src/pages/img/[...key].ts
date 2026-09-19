// Public serve route for listing photos held in the hcf-photos R2 bucket. Keys are unguessable
// (listingId/uuid.ext), objects are immutable once written, so we cache hard. The bucket itself has
// no public domain; this route is the only door and returns nothing but image bytes.
import type { APIRoute } from 'astro';
import { env } from '../../lib/env';

const ALLOWED_EXT = /\.(jpg|jpeg|png|webp)$/i;
const CT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const GET: APIRoute = async ({ params }) => {
  const key = (params.key ?? '').replace(/^\/+/, '');
  // Only ever serve our own key shape: "<digits>/<name>.<imgext>". No traversal, no odd paths.
  if (!key || key.includes('..') || !/^\d+\/[A-Za-z0-9._-]+$/.test(key) || !ALLOWED_EXT.test(key)) {
    return new Response('Not found', { status: 404 });
  }
  if (!env.PHOTOS) return new Response('Not found', { status: 404 });
  const obj = await env.PHOTOS.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const ext = key.split('.').pop()!.toLowerCase();
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || CT[ext] || 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
      etag: obj.httpEtag,
    },
  });
};
