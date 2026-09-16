// Serves a support-email attachment from the PRIVATE R2 bucket — admin-authed only. The bucket has
// no public access; this route is the only door, and it fails closed (403) without an admin session.
import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { env } from '../../../lib/env';
import { getAttachment } from '../../../lib/tickets';

export const GET: APIRoute = async ({ request, url }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 });

  const row = await getAttachment(id);
  if (!row || !env.ATTACH) return new Response('Not found', { status: 404 });

  const obj = await env.ATTACH.get(row.r2_key);
  if (!obj) return new Response('Not found', { status: 404 });

  const inline = /^image\//i.test(row.content_type);
  // ASCII-only filename in the header; strip quotes/control chars to keep the header well-formed.
  const safeName = row.filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '');
  return new Response(obj.body, {
    headers: {
      'content-type': row.content_type || 'application/octet-stream',
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
};
