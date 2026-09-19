import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { clean, isEmail, redirect, escapeHtml } from '../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell, adminEmail } from '../../lib/services';
import { rateLimit } from '../../lib/db';
import { addFeedback, isFeedbackType, isSeverity } from '../../lib/feedback';

const ALLOWED_SHOT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const MAX_SHOT = 4 * 1024 * 1024;
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  const widget = request.headers.get('x-fbw') === '1';
  const form = await request.formData();
  const ip = clientIp(request);

  // Honeypot — bots fill hidden fields; drop silently so they think it worked.
  if (clean(form.get('company_website'), 100)) return widget ? json({ ok: true }) : redirect('/feedback?msg=sent');

  if (!(await rateLimit(`feedback:${ip}`, 8, 3600))) return widget ? json({ ok: false, error: 'rate' }, 429) : redirect('/feedback?msg=rate-limited');
  // The no-JS page path carries a Turnstile token; the widget path relies on honeypot + rate limit.
  const token = clean(form.get('cf-turnstile-response'), 5000);
  if (token && !(await verifyTurnstile(token, ip))) return redirect('/feedback?msg=captcha');

  const typeRaw = clean(form.get('type'), 10);
  const type = isFeedbackType(typeRaw) ? typeRaw : 'other';
  const sevRaw = clean(form.get('severity'), 10);
  const severity = type === 'bug' && isSeverity(sevRaw) ? sevRaw : null;
  const message = clean(form.get('message'), 2000);
  const emailRaw = clean(form.get('email'), 254).toLowerCase();
  const email = emailRaw && isEmail(emailRaw) ? emailRaw : null;
  const pageRaw = clean(form.get('page_url'), 300);
  const pageUrl = /^\/[\w\-/?=&.%]*$/.test(pageRaw) ? pageRaw : null;
  // Context is JSON we generated client-side; store bounded, and only if it parses.
  let context: string | null = null;
  const ctxRaw = clean(form.get('context'), 4000);
  if (ctxRaw) { try { context = JSON.stringify(JSON.parse(ctxRaw)).slice(0, 4000); } catch { context = null; } }
  if (message.length < 4) return widget ? json({ ok: false, error: 'short' }, 400) : redirect('/feedback');

  // Screenshot → private R2, keyed by a random id. Best-effort: a bad image never blocks the report.
  let shotKey: string | null = null;
  const file = form.get('file');
  if (file instanceof File && env.FEEDBACK && ALLOWED_SHOT[file.type] && file.size > 0 && file.size <= MAX_SHOT) {
    try {
      const key = `${crypto.randomUUID()}.${ALLOWED_SHOT[file.type]}`;
      await env.FEEDBACK.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
      shotKey = key;
    } catch { shotKey = null; }
  }

  const id = await addFeedback({ type, message, email, pageUrl, severity, shotKey, context, session: null });
  try {
    await sendEmail(adminEmail(), `[feedback:${type}${severity ? '/' + severity : ''}] ${message.slice(0, 60)}`,
      emailShell('New feedback', `<p><strong>${type}${severity ? ` · ${severity}` : ''}</strong>${email ? ` from ${escapeHtml(email)}` : ''}${pageUrl ? ` · on ${escapeHtml(pageUrl)}` : ''}${shotKey ? ' · 📷 screenshot attached' : ''}</p><p>${escapeHtml(message).replace(/\n/g, '<br>')}</p><p><a href="${env.SITE_URL}/admin/feedback${id ? `/${id}` : ''}">Open in the feedback pipeline</a></p>`),
      { type: 'admin_feedback' });
  } catch { /* noop */ }

  return widget ? json({ ok: !!id, id }) : redirect(id ? '/feedback?msg=sent' : '/feedback');
};
