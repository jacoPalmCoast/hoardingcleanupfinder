import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, digits, safeUrl } from '../../../lib/util';
import { currentOwner, ownerOwns } from '../../../lib/services';
import { getListingById, isLive } from '../../../lib/db';
import { isService } from '../../../data/services';
import { parseAttrs, attrsFromForm, faqFromForm, parseFaq } from '../../../data/attrs';
import { audit, diff } from '../../../lib/audit';
import { queueIndexNow, listingPaths } from '../../../lib/indexnow';

export const POST: APIRoute = async ({ request, locals }) => {
  const owner = await currentOwner(request);
  if (!owner) return redirect('/account', 302);
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  if (!Number.isInteger(id) || !(await ownerOwns(owner.id, id))) return new Response('Forbidden', { status: 403 });
  const l = await getListingById(id);
  if (!l) return new Response(null, { status: 404 });
  // Tier is decided server-side from the live subscription, never from the form. Invariant 2.
  const tier: 'free' | 'featured' = isLive(l) ? 'featured' : 'free';

  const name = clean(form.get('name'), 120);
  const phone = clean(form.get('phone'), 30);
  const pd = digits(phone);
  const website = safeUrl(clean(form.get('website'), 200));
  const email = clean(form.get('email'), 254).toLowerCase();
  const address = clean(form.get('address'), 200);
  const services = form.getAll('services').map(String).filter((s) => isService(s));
  const description = clean(form.get('description'), 600);
  if (!name || pd.length !== 10 || (email && !isEmail(email)) || services.length === 0 || !description) return redirect(`/account/edit/${id}?msg=invalid`);

  const prevAttrs = parseAttrs(l.attrs);
  const attrs = attrsFromForm(form, tier, prevAttrs);
  // Featured-only content: a free owner cannot change it (the fields are disabled client-side,
  // and ignored here), but whatever they wrote while featured is kept for when they re-subscribe.
  const longAbout = tier === 'featured' ? clean(form.get('long_about'), 2500) || null : l.long_about;
  const customFaq = tier === 'featured' ? JSON.stringify(faqFromForm(form)) : l.custom_faq;

  const before = { name: l.name, phone: l.phone, website: l.website, email: l.email, address: l.address, services: l.services, description: l.description, attrs: prevAttrs, long_about: l.long_about, custom_faq: parseFaq(l.custom_faq) };
  const after = { name, phone, website, email: email || null, address: address || null, services: JSON.stringify(services), description, attrs, long_about: longAbout, custom_faq: parseFaq(customFaq) };

  await env.DB.prepare(
    `UPDATE listings SET name = ?2, phone = ?3, phone_digits = ?4, website = ?5, email = ?6, address = ?7, services = ?8, description = ?9, attrs = ?10, long_about = ?11, custom_faq = ?12, updated_at = unixepoch() WHERE id = ?1`,
  )
    .bind(id, name, phone, pd, website, email || null, address || null, JSON.stringify(services), description, JSON.stringify(attrs), longAbout, customFaq)
    .run();
  const d = diff(before as Record<string, unknown>, after as Record<string, unknown>);
  await audit('owner', owner.email, id, 'listing.save', d.before, d.after);
  queueIndexNow(locals, listingPaths({ ...l, services: JSON.stringify(services) }));
  return redirect('/account?msg=saved');
};
