import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, sha256, now, timingSafeEqual } from '../../../lib/util';
import { createOwnerSession, isSecure } from '../../../lib/services';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const email = clean(form.get('email'), 254).toLowerCase();
  const code = clean(form.get('code'), 6);
  const back = `/account?step=code&email=${encodeURIComponent(email)}&msg=wrong-code`;
  if (!isEmail(email) || !/^\d{6}$/.test(code)) return redirect(back);
  const row = await env.DB.prepare(`SELECT id, code, attempts FROM login_codes WHERE email = ?1 AND used = 0 AND expires_at > ?2 ORDER BY id DESC LIMIT 1`)
    .bind(email, now())
    .first<{ id: number; code: string; attempts: number }>();
  if (!row || row.attempts >= 5) return redirect(back);
  if (!timingSafeEqual(row.code, await sha256(code))) {
    await env.DB.prepare(`UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?1`).bind(row.id).run();
    return redirect(back);
  }
  await env.DB.prepare(`UPDATE login_codes SET used = 1 WHERE id = ?1`).bind(row.id).run();
  const owner = await env.DB.prepare(`SELECT id FROM owners WHERE email = ?1`).bind(email).first<{ id: number }>();
  if (!owner) return redirect(back);
  return redirect('/account', 303, { 'set-cookie': await createOwnerSession(owner.id, isSecure(request)) });
};
