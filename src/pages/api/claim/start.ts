import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, randomCode, sha256 } from '../../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell } from '../../../lib/services';
import { getListingById, rateLimit } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  const l = await getListingById(Number(clean(form.get('listing_id'), 12)));
  if (!l || l.status !== 'active') return redirect('/');
  const email = clean(form.get('email'), 254).toLowerCase();
  if (!isEmail(email)) return redirect(`/claim/${l.slug}?msg=invalid`);
  if (!(await rateLimit(`claim:${ip}`, 5, 3600)) || !(await rateLimit(`claim:${l.id}`, 5, 3600))) return redirect(`/claim/${l.slug}?msg=invalid`);
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect(`/claim/${l.slug}?msg=captcha`);
  if (l.is_claimed === 1) return redirect(`/claim/${l.slug}`);

  const code = randomCode(6);
  await env.DB.prepare(`UPDATE claims SET status = 'expired' WHERE listing_id = ?1 AND status = 'pending'`).bind(l.id).run();
  await env.DB.prepare(`INSERT INTO claims(listing_id, email, code) VALUES (?1, ?2, ?3)`).bind(l.id, email, await sha256(code)).run();
  await sendEmail(email, `Your code to claim ${l.name}: ${code}`, emailShell('Confirm your listing', `<p>Your confirmation code is:</p><p style="font-size:28px;letter-spacing:4px;font-weight:700">${code}</p><p>Enter it on the claim page within 20 minutes. If you did not request this, ignore this email.</p>`));
  return redirect(`/claim/${l.slug}?step=code&email=${encodeURIComponent(email)}`);
};
