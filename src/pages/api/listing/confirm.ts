import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, sha256, now, timingSafeEqual } from '../../../lib/util';
import { getOrCreateOwner, createOwnerSession, isSecure, clientIp } from '../../../lib/services';
import { getListingBySlug, rateLimit } from '../../../lib/db';
import { audit } from '../../../lib/audit';

// Second step of self-submit onboarding: the submitter enters the code we emailed. Confirming proves
// they control the address and links them as owner of their own new listing so they can manage and
// preview it immediately. The listing itself stays 'pending' until an admin approves it for public
// display — this only grants owner access, so nothing is published without review.
export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  const email = clean(form.get('email'), 254).toLowerCase();
  const slug = clean(form.get('slug'), 200);
  const code = clean(form.get('code'), 6);
  const back = `/add-listing?step=code&email=${encodeURIComponent(email)}&slug=${encodeURIComponent(slug)}&msg=wrong-code`;
  if (!isEmail(email) || !/^\d{6}$/.test(code) || !slug) return redirect(back);
  if (!(await rateLimit(`confirm:${ip}`, 10, 3600))) return redirect(back);

  const row = await env.DB.prepare(`SELECT id, code, attempts FROM login_codes WHERE email = ?1 AND used = 0 AND expires_at > ?2 ORDER BY id DESC LIMIT 1`)
    .bind(email, now())
    .first<{ id: number; code: string; attempts: number }>();
  if (!row || row.attempts >= 5) return redirect(back);
  if (!timingSafeEqual(row.code, await sha256(code))) {
    await env.DB.prepare(`UPDATE login_codes SET attempts = attempts + 1 WHERE id = ?1`).bind(row.id).run();
    return redirect(back);
  }
  await env.DB.prepare(`UPDATE login_codes SET used = 1 WHERE id = ?1`).bind(row.id).run();

  // Only link a listing the same person just self-submitted with this exact address, and only if
  // it is not already claimed by someone else.
  const l = await getListingBySlug(slug);
  if (!l || l.source !== 'self-submit' || (l.email ?? '').toLowerCase() !== email) {
    return redirect('/account?msg=welcome');
  }
  const ownerId = await getOrCreateOwner(email);
  if (l.is_claimed !== 1) {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO owner_listings(owner_id, listing_id) VALUES (?1, ?2)`).bind(ownerId, l.id),
      env.DB.prepare(`UPDATE listings SET is_claimed = 1, updated_at = unixepoch() WHERE id = ?1`).bind(l.id),
    ]);
    await audit('owner', email, l.id, 'listing.self_submit_confirm', null, { email });
  }
  const cookie = await createOwnerSession(ownerId, isSecure(request));
  return redirect('/account?msg=welcome', 303, { 'set-cookie': cookie });
};
