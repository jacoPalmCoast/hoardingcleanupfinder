import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { setSetting, SETTING_KEYS } from '../../../lib/settings';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  for (const key of SETTING_KEYS) {
    if (form.has(key)) await setSetting(key, clean(form.get(key), 400));
  }
  return redirect('/admin/setup?saved=1');
};
