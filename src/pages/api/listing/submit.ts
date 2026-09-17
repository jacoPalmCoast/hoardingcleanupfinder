import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, digits, slugify, safeUrl, escapeHtml, randomCode, sha256, now } from '../../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell, adminEmail } from '../../../lib/services';
import { rateLimit } from '../../../lib/db';
import { isService } from '../../../data/services';
import { isState } from '../../../data/states';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  if (!(await rateLimit(`submit:${ip}`, 3, 3600))) return redirect('/add-listing?msg=rate-limited');
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect('/add-listing?msg=captcha');

  const name = clean(form.get('name'), 120);
  const phone = clean(form.get('phone'), 30);
  const pd = digits(phone);
  const website = safeUrl(clean(form.get('website'), 200));
  const email = clean(form.get('email'), 254).toLowerCase();
  const address = clean(form.get('address'), 200);
  const city = clean(form.get('city'), 80);
  const state = clean(form.get('state'), 2).toUpperCase();
  const zip = clean(form.get('zip'), 5);
  const services = form.getAll('services').map(String).filter((s) => isService(s));
  const description = clean(form.get('description'), 400);
  if (!name || pd.length !== 10 || !isEmail(email) || !city || !isState(state) || !/^\d{5}$/.test(zip) || services.length === 0 || !description) {
    return redirect('/add-listing?msg=invalid');
  }
  const dup = await env.DB.prepare(`SELECT id FROM listings WHERE phone_digits = ?1 AND status != 'removed'`).bind(pd).first();
  if (dup) return redirect('/add-listing?msg=duplicate');

  let slug = slugify(`${name} ${city} ${state}`);
  const exists = await env.DB.prepare(`SELECT 1 FROM listings WHERE slug = ?1`).bind(slug).first();
  if (exists) slug = `${slug}-${pd.slice(-4)}`;

  await env.DB.prepare(
    `INSERT INTO listings(slug, name, phone, phone_digits, website, email, address, city, city_slug, state, zip, description, services, status, source)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'pending','self-submit')`,
  )
    .bind(slug, name, phone, pd, website, email, address || null, city, slugify(city), state, zip, description, JSON.stringify(services))
    .run();

  // The submitter is the presumptive owner of a listing they just created. Email a code so they can
  // confirm they control the address, then manage and PREVIEW the listing right away (see /api/listing/confirm).
  // The listing stays 'pending' until an admin approves it for public display — confirming only unlocks
  // owner access to it, so nothing goes public without review.
  const code = randomCode(6);
  await env.DB.prepare(`INSERT INTO login_codes(email, code, expires_at) VALUES (?1, ?2, ?3)`).bind(email, await sha256(code), now() + 30 * 60).run();
  await sendEmail(
    email,
    `Confirm your email to manage ${name}`,
    emailShell('Listing received', `<p>Thanks for adding <strong>${escapeHtml(name)}</strong>. We review every listing within one business day and will email you when it goes live.</p><p>To manage and preview your listing now, enter this code on the site:</p><p style="font-size:28px;letter-spacing:4px;font-weight:700">${code}</p><p>It is valid for 30 minutes. If you did not do this, ignore this email.</p>`),
  );
  await sendEmail(adminEmail(), `[pending] ${name} (${city}, ${state})`, emailShell('New listing submitted', `<p>${escapeHtml(name)}, ${escapeHtml(city)}, ${state} — self-submitted by ${escapeHtml(email)}. <a href="${env.SITE_URL}/admin/pending">Review in admin</a>.</p>`), { type: 'admin_pending' });
  return redirect(`/add-listing?step=code&email=${encodeURIComponent(email)}&slug=${encodeURIComponent(slug)}`);
};
