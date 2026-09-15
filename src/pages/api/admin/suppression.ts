import type { APIRoute } from 'astro';
import { clean, redirect, isEmail } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
import { removeSuppression } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const email = clean(form.get('email'), 254).toLowerCase();
  const action = clean(form.get('action'), 20);
  if (action === 'remove' && isEmail(email)) await removeSuppression(email);
  return redirect('/admin/suppressions');
};
