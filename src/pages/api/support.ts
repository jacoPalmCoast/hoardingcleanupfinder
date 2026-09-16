import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { clean, isEmail, redirect, escapeHtml } from '../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell, adminEmail } from '../../lib/services';
import { rateLimit } from '../../lib/db';
import { createTicket } from '../../lib/tickets';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  if (!(await rateLimit(`support:${ip}`, 3, 3600))) return redirect('/support?msg=rate-limited');
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect('/support?msg=captcha');
  const email = clean(form.get('email'), 254).toLowerCase();
  const subject = clean(form.get('subject'), 150);
  const message = clean(form.get('message'), 4000);
  if (!isEmail(email) || !subject || message.length < 10) return redirect('/support?msg=invalid');
  const id = await createTicket(email, subject, message);
  await sendEmail(adminEmail(), `[support] ${subject}`, emailShell('New support message', `<p>From ${escapeHtml(email)}</p><p><strong>${escapeHtml(subject)}</strong></p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p><a href="${env.SITE_URL}/admin/crm/ticket/${id}">Open ticket in admin</a></p>`), { type: 'admin_support' });
  return redirect('/support?msg=received');
};
