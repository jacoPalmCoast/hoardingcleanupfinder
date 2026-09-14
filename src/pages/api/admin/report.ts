import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  const action = clean(form.get('action'), 20);
  const r = await env.DB.prepare(`SELECT listing_id FROM reports WHERE id = ?1`).bind(id).first<{ listing_id: number }>();
  if (!r) return redirect('/admin/reports');
  if (action === 'remove-listing') await env.DB.prepare(`UPDATE listings SET status = 'removed', updated_at = unixepoch() WHERE id = ?1`).bind(r.listing_id).run();
  await env.DB.prepare(`UPDATE reports SET status = 'closed' WHERE id = ?1`).bind(id).run();
  return redirect('/admin/reports');
};
