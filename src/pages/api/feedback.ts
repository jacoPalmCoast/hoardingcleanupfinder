import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { clean, isEmail, redirect, escapeHtml } from '../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell, adminEmail } from '../../lib/services';
import { rateLimit } from '../../lib/db';
import { addFeedback, isFeedbackType } from '../../lib/feedback';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  if (!(await rateLimit(`feedback:${ip}`, 6, 3600))) return redirect('/feedback?msg=rate-limited');
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect('/feedback?msg=captcha');

  const typeRaw = clean(form.get('type'), 10);
  const type = isFeedbackType(typeRaw) ? typeRaw : 'other';
  const message = clean(form.get('message'), 2000);
  const emailRaw = clean(form.get('email'), 254).toLowerCase();
  const email = emailRaw && isEmail(emailRaw) ? emailRaw : null;
  // Only keep an on-site page path, never an arbitrary URL from the field.
  const pageRaw = clean(form.get('page_url'), 300);
  const pageUrl = /^\/[\w\-/?=&.]*$/.test(pageRaw) ? pageRaw : null;
  if (message.length < 4) return redirect('/feedback');

  const id = await addFeedback({ type, message, email, pageUrl, session: null });
  // Notify admin, but don't let a mail hiccup fail the submit.
  try {
    await sendEmail(adminEmail(), `[feedback:${type}] ${message.slice(0, 60)}`,
      emailShell('New feedback', `<p><strong>${type}</strong>${email ? ` from ${escapeHtml(email)}` : ''}${pageUrl ? ` · on ${escapeHtml(pageUrl)}` : ''}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p><a href="${env.SITE_URL}/admin/feedback">Open the feedback pipeline</a></p>`),
      { type: 'admin_feedback' });
  } catch { /* noop */ }
  return redirect(id ? '/feedback?msg=sent' : '/feedback');
};
