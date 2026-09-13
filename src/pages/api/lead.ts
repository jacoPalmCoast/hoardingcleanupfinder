import type { APIRoute } from 'astro';
import { env } from '../../lib/env';
import { clean, isEmail, redirect, formatPhone, escapeHtml, now } from '../../lib/util';
import { verifyTurnstile, clientIp, sendEmail, emailShell } from '../../lib/services';
import { getListingById, rateLimit } from '../../lib/db';
import type { Listing } from '../../lib/db';
import { SERVICE_BY_SLUG } from '../../data/services';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData();
  const ip = clientIp(request);
  const ret = clean(form.get('return'), 200);
  const back = ret.startsWith('/') && !ret.startsWith('//') ? ret : '/';
  if (!(await rateLimit(`lead:${ip}`, 5, 3600))) return redirect(`${back}?msg=rate-limited`);
  if (!(await verifyTurnstile(clean(form.get('cf-turnstile-response'), 5000), ip))) return redirect(`${back}?msg=captcha`);

  const name = clean(form.get('name'), 100);
  const email = clean(form.get('email'), 254).toLowerCase();
  const phone = clean(form.get('phone'), 30);
  const zip = clean(form.get('zip'), 5);
  const city = clean(form.get('city'), 80);
  const state = clean(form.get('state'), 2).toUpperCase();
  const serviceRaw = clean(form.get('service'), 40);
  const service = serviceRaw in SERVICE_BY_SLUG ? serviceRaw : 'hoarding-cleanup';
  const message = clean(form.get('message'), 1500);
  const listingIdRaw = clean(form.get('listing_id'), 12);
  if (!name || !isEmail(email) || !/^\d{5}$/.test(zip)) return redirect(`${back}?msg=invalid`);

  // Route: to the chosen listing, else featured-first companies in the same ZIP prefix / state.
  let targets: Listing[] = [];
  if (listingIdRaw) {
    const l = await getListingById(Number(listingIdRaw));
    if (l && l.status === 'active') targets = [l];
  }
  if (targets.length === 0) {
    const t = now();
    const r = await env.DB.prepare(
      `SELECT * FROM listings WHERE status = 'active' AND services LIKE ?2 AND (zip LIKE ?3 OR (state = ?4 AND ?4 != ''))
       ORDER BY (is_featured = 1 AND featured_until > ?1) DESC, (zip LIKE ?3) DESC, is_verified DESC, review_count DESC LIMIT 3`,
    )
      .bind(t, `%"${service}"%`, `${zip.slice(0, 3)}%`, state)
      .all<Listing>();
    targets = r.results;
  }

  const routed = targets.map((l) => l.id);
  const ins = await env.DB.prepare(
    `INSERT INTO leads(listing_id, name, phone, email, zip, city, state, service, message, routed_to) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10)`,
  )
    .bind(listingIdRaw ? Number(listingIdRaw) : null, name, phone || null, email, zip, city || null, state || null, service, message || null, JSON.stringify(routed))
    .run();
  const leadId = ins.meta.last_row_id;

  const svcName = SERVICE_BY_SLUG[service].name;
  const body = `<p>A new quote request came in through ${env.SITE_NAME}.</p>
<p><strong>Service:</strong> ${svcName}<br><strong>Name:</strong> ${escapeHtml(name)}<br><strong>Email:</strong> ${escapeHtml(email)}<br><strong>Phone:</strong> ${escapeHtml(formatPhone(phone) || '—')}<br><strong>ZIP:</strong> ${zip}${city ? ` (${escapeHtml(city)})` : ''}</p>
${message ? `<p><strong>Notes:</strong><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>` : ''}
<p>Reply directly to the customer. This request was ${targets.length > 1 ? `sent to ${targets.length} companies` : 'sent only to you'}.</p>`;
  await Promise.all(targets.filter((l) => l.email).map((l) => sendEmail(l.email!, `Quote request: ${svcName} in ${zip}`, emailShell('New quote request', body))));
  // Owner copy, so leads without a company email can still be worked by hand.
  await sendEmail(env.FROM_EMAIL.replace(/.*<|>.*/g, ''), `[lead #${leadId}] ${svcName} ${zip} → ${targets.map((l) => l.name).join(', ') || 'no match'}`, emailShell('Lead copy', body));
  await sendEmail(email, `We sent your request to ${targets.length || 'a'} cleanup ${targets.length === 1 ? 'company' : 'companies'}`, emailShell('Your quote request', `<p>Thanks, ${escapeHtml(name)}. Your ${svcName.toLowerCase()} request for ZIP ${zip} went to: ${targets.map((l) => escapeHtml(l.name)).join(', ') || 'our team, who will find a company for you'}.</p><p>If you hear nothing within one business day, reply to this email and we will chase it.</p>`));

  return redirect(`${back}?msg=lead-sent#quote`);
};
