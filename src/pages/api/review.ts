import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { clean, isEmail, redirect, escapeHtml } from '../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell, adminEmail } from '../../lib/services';
import { getListingById, rateLimit, addReview } from '../../lib/db';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  // Tighter than the report cap: a person reviewing several companies is fine, a script is not.
  if (!(await rateLimit(`review:${ip}`, 3, 3600))) return redirect('/?msg=rate-limited');
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect('/?msg=captcha');
  const l = await getListingById(Number(clean(form.get('listing_id'), 12)));
  if (!l || l.status !== 'active') return redirect('/');
  const rating = Number(clean(form.get('rating'), 2));
  const body = clean(form.get('body'), 2000);
  const author = clean(form.get('author'), 80);
  const email = clean(form.get('email'), 254).toLowerCase();
  if (!(rating >= 1 && rating <= 5) || body.length < 20 || !author || !isEmail(email)) {
    return redirect(`/company/${l.slug}/review?msg=invalid`);
  }
  // Held as 'pending' — never shown until a person approves it in the admin moderation queue.
  await addReview({ listingId: l.id, author, rating, body, email, ip });
  await sendEmail(
    adminEmail(),
    `[review:${rating}★] ${l.name} (${l.city}, ${l.state})`,
    emailShell('New review — needs moderation', `<p><a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a></p><p><strong>${rating}★</strong> from ${escapeHtml(author)} (${escapeHtml(email)})</p><p>${escapeHtml(body).replace(/\n/g, '<br>')}</p><p><a href="${env.SITE_URL}/admin/reviews">Moderate in admin</a></p>`),
    { type: 'admin_review', listingId: l.id },
  );
  return redirect(`/company/${l.slug}?msg=review-received`);
};
