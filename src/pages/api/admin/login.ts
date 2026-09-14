import type { APIRoute } from 'astro';
import { clean, redirect } from '../../../lib/util';
import { adminLogin, adminCookieHeader, isSecure, clientIp } from '../../../lib/services';
import { rateLimit } from '../../../lib/db';
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  if (!(await rateLimit(`admin-login:${clientIp(request)}`, 10, 3600))) return new Response('Too many attempts', { status: 429 });
  const token = await adminLogin(clean(form.get('password'), 200));
  if (!token) return redirect('/admin/login?msg=bad');
  return redirect('/admin', 303, { 'set-cookie': adminCookieHeader(token, isSecure(request)) });
};
