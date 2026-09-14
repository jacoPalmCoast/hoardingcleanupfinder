import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, isEmail, redirect, digits, safeUrl } from '../../../lib/util';
import { currentOwner, ownerOwns } from '../../../lib/services';
import { SERVICE_BY_SLUG } from '../../../data/services';

export const POST: APIRoute = async ({ request }) => {
  const owner = await currentOwner(request);
  if (!owner) return redirect('/account', 302);
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  if (!Number.isInteger(id) || !(await ownerOwns(owner.id, id))) return new Response('Forbidden', { status: 403 });
  const name = clean(form.get('name'), 120);
  const phone = clean(form.get('phone'), 30);
  const pd = digits(phone);
  const website = safeUrl(clean(form.get('website'), 200));
  const email = clean(form.get('email'), 254).toLowerCase();
  const address = clean(form.get('address'), 200);
  const services = form.getAll('services').map(String).filter((s) => s in SERVICE_BY_SLUG);
  const description = clean(form.get('description'), 600);
  if (!name || pd.length !== 10 || (email && !isEmail(email)) || services.length === 0 || !description) return redirect(`/account/edit/${id}?msg=invalid`);
  await env.DB.prepare(
    `UPDATE listings SET name = ?2, phone = ?3, phone_digits = ?4, website = ?5, email = ?6, address = ?7, services = ?8, description = ?9, updated_at = unixepoch() WHERE id = ?1`,
  )
    .bind(id, name, phone, pd, website, email || null, address || null, JSON.stringify(services), description)
    .run();
  return redirect('/account?msg=saved');
};
