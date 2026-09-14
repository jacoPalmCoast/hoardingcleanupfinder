import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect, digits, safeUrl, escapeHtml } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
import { sendEmail, emailShell } from '../../../lib/services';
import { getListingById } from '../../../lib/db';
import { SERVICE_BY_SLUG, isService } from '../../../data/services';
import { slugify, isEmail } from '../../../lib/util';
import { isState } from '../../../data/states';
import { parseAttrs, attrsFromForm, faqFromForm, parseFaq } from '../../../data/attrs';
import { audit, diff } from '../../../lib/audit';
import { queueIndexNow, listingPaths } from '../../../lib/indexnow';

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  const action = clean(form.get('action'), 20);
  const l = await getListingById(id);
  if (!l) return redirect('/admin');

  if (action === 'approve') {
    await env.DB.prepare(`UPDATE listings SET status = 'active', updated_at = unixepoch() WHERE id = ?1`).bind(id).run();
    await env.DB.prepare(`INSERT OR IGNORE INTO cities(slug, name, state) VALUES (?1, ?2, ?3)`).bind(l.city_slug, l.city, l.state).run();
    await audit('admin', 'admin', id, 'listing.approve', { status: l.status }, { status: 'active' });
    queueIndexNow(locals, listingPaths(l));
    if (l.email) await sendEmail(l.email, `${l.name} is now listed`, emailShell('Your listing is live', `<p><a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a> is live. <a href="${env.SITE_URL}/claim/${l.slug}">Claim it</a> to manage details, or <a href="${env.SITE_URL}/featured/${l.slug}">get featured</a> in ${escapeHtml(l.city)}.</p>`));
    return redirect('/admin/pending');
  }
  if (action === 'remove') {
    await env.DB.prepare(`UPDATE listings SET status = 'removed', updated_at = unixepoch() WHERE id = ?1`).bind(id).run();
    await audit('admin', 'admin', id, 'listing.remove', { status: l.status }, { status: 'removed' });
    queueIndexNow(locals, listingPaths(l));
    return redirect('/admin/pending');
  }
  if (action === 'save') {
    const services = form.getAll('services').map(String).filter((s) => isService(s));
    const status = ['active', 'pending', 'removed'].includes(clean(form.get('status'), 10)) ? clean(form.get('status'), 10) : l.status;
    const city = clean(form.get('city'), 80) || l.city;
    const stateRaw = clean(form.get('state'), 2).toUpperCase();
    const state = isState(stateRaw) ? stateRaw : l.state;
    const emailRaw = clean(form.get('email'), 254).toLowerCase();
    const email = isEmail(emailRaw) ? emailRaw : null;
    const phone = clean(form.get('phone'), 30);
    // Admin edits with the featured tier so every attribute is reachable; the public page still
    // only renders featured-only content while the subscription is live (Invariant 2).
    const attrs = attrsFromForm(form, 'featured', parseAttrs(l.attrs));
    const longAbout = clean(form.get('long_about'), 2500) || null;
    const customFaq = JSON.stringify(faqFromForm(form));
    const after = { name: clean(form.get('name'), 120) || l.name, phone: phone || null, website: safeUrl(clean(form.get('website'), 200)), email, address: clean(form.get('address'), 200) || null, city, state, zip: clean(form.get('zip'), 5) || null, services: JSON.stringify(services.length ? services : ['hoarding-cleanup']), description: clean(form.get('description'), 600) || null, is_verified: form.get('is_verified') ? 1 : 0, status, attrs, long_about: longAbout, custom_faq: parseFaq(customFaq) };
    const before = { name: l.name, phone: l.phone, website: l.website, email: l.email, address: l.address, city: l.city, state: l.state, zip: l.zip, services: l.services, description: l.description, is_verified: l.is_verified, status: l.status, attrs: parseAttrs(l.attrs), long_about: l.long_about, custom_faq: parseFaq(l.custom_faq) };
    await env.DB.prepare(
      `UPDATE listings SET name = ?2, phone = ?3, phone_digits = ?4, website = ?5, email = ?6, address = ?7, city = ?8, city_slug = ?9, state = ?10, zip = ?11, services = ?12, description = ?13, is_verified = ?14, status = ?15, attrs = ?16, long_about = ?17, custom_faq = ?18, updated_at = unixepoch() WHERE id = ?1`,
    )
      .bind(id, after.name, after.phone, digits(phone) || null, after.website, email, after.address, city, slugify(city), state, after.zip, after.services, after.description, after.is_verified, status, JSON.stringify(attrs), longAbout, customFaq)
      .run();
    await env.DB.prepare(`INSERT OR IGNORE INTO cities(slug, name, state) VALUES (?1, ?2, ?3)`).bind(slugify(city), city, state).run();
    const d = diff(before as Record<string, unknown>, after as Record<string, unknown>);
    await audit('admin', 'admin', id, 'listing.save', d.before, d.after);
    queueIndexNow(locals, [...listingPaths(l), ...listingPaths({ slug: l.slug, state, city_slug: slugify(city), services: after.services })]);
    return redirect(`/admin/listings?id=${id}&msg=saved`);
  }
  return redirect('/admin');
};
