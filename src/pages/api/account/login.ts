import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, randomCode, sha256, now } from '../../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell } from '../../../lib/services';
import { rateLimit } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  const email = clean(form.get('email'), 254).toLowerCase();
  if (!isEmail(email)) return redirect('/account?msg=invalid');
  if (!(await rateLimit(`login:${ip}`, 10, 3600))) return redirect('/account?msg=invalid');
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect('/account?msg=invalid');
  if (!(await rateLimit(`login:${email}`, 5, 3600))) return redirect('/account?msg=invalid');
  // Only send codes to known owners; respond the same way either way so emails can't be enumerated.
  const owner = await env.DB.prepare(`SELECT id FROM owners WHERE email = ?1`).bind(email).first();
  if (owner) {
    const code = randomCode(6);
    await env.DB.prepare(`INSERT INTO login_codes(email, code, expires_at) VALUES (?1, ?2, ?3)`).bind(email, await sha256(code), now() + 15 * 60).run();
    await sendEmail(email, `Your sign-in code: ${code}`, emailShell('Sign in', `<p>Your code is:</p><p style="font-size:28px;letter-spacing:4px;font-weight:700">${code}</p><p>Valid for 15 minutes.</p>`));
  }
  return redirect(`/account?step=code&email=${encodeURIComponent(email)}`);
};
