import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { audit } from '../../../lib/audit';
import { clean, isEmail, redirect, sha256, now, hostOf, escapeHtml, timingSafeEqual } from '../../../lib/util';
import { getOrCreateOwner, createOwnerSession, isSecure, sendEmail, emailShell } from '../../../lib/services';
import { getListingById } from '../../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const l = await getListingById(Number(clean(form.get('listing_id'), 12)));
  if (!l || l.status !== 'active' || l.is_claimed === 1) return redirect('/');
  const email = clean(form.get('email'), 254).toLowerCase();
  const code = clean(form.get('code'), 6);
  if (!isEmail(email) || !/^\d{6}$/.test(code)) return redirect(`/claim/${l.slug}?msg=invalid`);
  const back = `/claim/${l.slug}?step=code&email=${encodeURIComponent(email)}&msg=wrong-code`;

  const claim = await env.DB.prepare(
    `SELECT id, code, attempts, created_at FROM claims WHERE listing_id = ?1 AND email = ?2 AND status = 'pending' ORDER BY id DESC LIMIT 1`,
  )
    .bind(l.id, email)
    .first<{ id: number; code: string; attempts: number; created_at: number }>();
  if (!claim || claim.attempts >= 5 || now() - claim.created_at > 20 * 60) return redirect(back);
  if (!timingSafeEqual(claim.code, await sha256(code))) {
    await env.DB.prepare(`UPDATE claims SET attempts = attempts + 1 WHERE id = ?1`).bind(claim.id).run();
    return redirect(back);
  }

  // Domain match → instant approval; otherwise the claim is verified but ownership waits for admin approval.
  const siteHost = hostOf(l.website);
  const emailHost = email.split('@')[1];
  const SHARED_HOSTS = ['facebook.com', 'sites.google.com', 'google.com', 'linktr.ee', 'wixsite.com', 'wix.com', 'squarespace.com', 'weebly.com', 'godaddysites.com', 'yelp.com', 'angi.com', 'thumbtack.com', 'homeadvisor.com', 'business.site', 'instagram.com', 'nextdoor.com', 'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'];
  const shared = SHARED_HOSTS.some((h) => siteHost === h || siteHost.endsWith(`.${h}`));
  const instant = !!siteHost && !shared && (emailHost === siteHost || emailHost.endsWith(`.${siteHost}`));
  const ownerId = await getOrCreateOwner(email);
  await env.DB.prepare(`UPDATE claims SET status = ?2, verified_at = ?3 WHERE id = ?1`).bind(claim.id, instant ? 'verified' : 'review', now()).run();
  if (instant) {
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO owner_listings(owner_id, listing_id) VALUES (?1, ?2)`).bind(ownerId, l.id),
      env.DB.prepare(`UPDATE listings SET is_claimed = 1, email = COALESCE(email, ?2), updated_at = unixepoch() WHERE id = ?1`).bind(l.id, email),
    ]);
    await audit('system', email, l.id, 'claim.instant', null, { email, matched_host: siteHost });
  } else {
    await audit('system', email, l.id, 'claim.review', null, { email, site_host: siteHost || null });
    await sendEmail(env.FROM_EMAIL.replace(/.*<|>.*/g, ''), `[claim review] ${l.name} by ${email}`, emailShell('Claim needs review', `<p>${escapeHtml(email)} verified a code for <a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a> but the email domain does not match the website (${escapeHtml(siteHost || 'none')}). <a href="${env.SITE_URL}/admin/claims">Approve or reject</a>.</p>`));
  }
  const cookie = await createOwnerSession(ownerId, isSecure(request));
  return redirect(instant ? `/account?msg=claimed` : `/account?msg=claim-review`, 303, { 'set-cookie': cookie });
};
