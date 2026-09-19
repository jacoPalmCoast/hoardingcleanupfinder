// Serves a feedback screenshot from the private hcf-feedback R2 bucket. Admin-authed only; the bucket
// has no public access, so this route is the only door and fails closed.
import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { env } from '../../../lib/env';

const CT: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };

export const GET: APIRoute = async ({ request, url }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const id = Number(url.searchParams.get('id'));
  if (!Number.isInteger(id) || !env.FEEDBACK) return new Response('Not found', { status: 404 });
  const row = await env.DB.prepare(`SELECT shot_key FROM feedback WHERE id = ?1`).bind(id).first<{ shot_key: string | null }>();
  if (!row?.shot_key) return new Response('Not found', { status: 404 });
  const obj = await env.FEEDBACK.get(row.shot_key);
  if (!obj) return new Response('Not found', { status: 404 });
  const ext = row.shot_key.split('.').pop()?.toLowerCase() ?? 'jpg';
  return new Response(obj.body, {
    headers: {
      'content-type': obj.httpMetadata?.contentType || CT[ext] || 'application/octet-stream',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox",
    },
  });
};
