import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, digits, slugify, safeUrl, escapeHtml } from '../../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell } from '../../../lib/services';
import { rateLimit } from '../../../lib/db';
import { SERVICE_BY_SLUG } from '../../../data/services';
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
  const services = form.getAll('services').map(String).filter((s) => s in SERVICE_BY_SLUG);
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
  await sendEmail(env.FROM_EMAIL.replace(/.*<|>.*/g, ''), `[pending] ${name} (${city}, ${state})`, emailShell('New listing submitted', `<p>${escapeHtml(name)}, ${escapeHtml(city)}, ${state}. <a href="${env.SITE_URL}/admin/pending">Review in admin</a>.</p>`));
  await sendEmail(email, `We received your listing for ${name}`, emailShell('Listing received', `<p>Thanks. We review every listing within one business day and will email you when it is live. Once it is, you can claim it to manage details and photos.</p>`));
  return redirect('/add-listing?msg=submitted');
};
