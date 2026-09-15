import type { APIRoute } from 'astro';
import { clean, redirect } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
import { moderateReview } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  const action = clean(form.get('action'), 20);
  if (id && (action === 'approve' || action === 'reject')) {
    await moderateReview(id, action === 'approve' ? 'approved' : 'rejected');
  }
  return redirect('/admin/reviews');
};
