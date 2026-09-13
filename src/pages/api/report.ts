import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { clean, isEmail, redirect, escapeHtml } from '../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell } from '../../lib/services';
import { getListingById, rateLimit } from '../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  if (!(await rateLimit(`report:${ip}`, 5, 3600))) return redirect('/?msg=rate-limited');
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect('/?msg=captcha');
  const l = await getListingById(Number(clean(form.get('listing_id'), 12)));
  if (!l) return redirect('/');
  const kind = ['correction', 'closed', 'removal', 'other'].includes(clean(form.get('kind'), 20)) ? clean(form.get('kind'), 20) : 'other';
  const message = clean(form.get('message'), 1500);
  const email = clean(form.get('email'), 254).toLowerCase();
  if (!message || !isEmail(email)) return redirect(`/company/${l.slug}/report`);
  await env.DB.prepare(`INSERT INTO reports(listing_id, kind, message, email) VALUES (?1,?2,?3,?4)`).bind(l.id, kind, message, email).run();
  await sendEmail(env.FROM_EMAIL.replace(/.*<|>.*/g, ''), `[report:${kind}] ${l.name} (${l.city}, ${l.state})`, emailShell('Listing report', `<p><a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a></p><p><strong>${kind}</strong> from ${escapeHtml(email)}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p><a href="${env.SITE_URL}/admin/reports">Open in admin</a></p>`));
  return redirect(`/company/${l.slug}?msg=report-sent`);
};
