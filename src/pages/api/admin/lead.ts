import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 12);
  const id = Number(clean(form.get('id'), 12));
  if (!Number.isInteger(id)) return redirect('/admin/leads');

  if (action === 'delete') {
    await env.DB.prepare(`DELETE FROM leads WHERE id = ?1`).bind(id).run();
    return redirect('/admin/leads?msg=deleted');
  }

  const status = clean(form.get('status'), 12);
  if (['new', 'contacted', 'sold', 'closed', 'spam'].includes(status)) {
    await env.DB.prepare(`UPDATE leads SET status = ?2 WHERE id = ?1`).bind(id, status).run();
    return redirect('/admin/leads?msg=saved');
  }
  return redirect('/admin/leads');
};
