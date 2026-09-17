import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { getOffers, saveOffers, type Offer } from '../../../lib/offers';

const day = (v: FormDataEntryValue | null) => { const s = clean(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };
const planOf = (v: FormDataEntryValue | null) => { const s = clean(v, 10); return s === 'monthly' || s === 'annual' ? s : 'any'; };

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 16);
  const id = clean(form.get('id'), 40);
  let offers = await getOffers();
  const done = (q = '') => redirect(`/admin/offers${q}`);

  if (action === 'delete') {
    await saveOffers(offers.filter((o) => o.id !== id));
    return done('?msg=deleted');
  }
  if (action === 'activate' || action === 'deactivate') {
    const makeActive = action === 'activate';
    offers = offers.map((o) => ({ ...o, active: o.id === id ? makeActive : makeActive ? false : o.active }));
    await saveOffers(offers);
    return done(makeActive ? '?msg=activated' : '?msg=off');
  }
  if (action === 'save') {
    const active = !!form.get('active');
    const next: Offer = {
      id: id || crypto.randomUUID().slice(0, 8),
      name: clean(form.get('name'), 80) || 'Untitled offer',
      active,
      plan: planOf(form.get('plan')) as Offer['plan'],
      trialDays: Math.min(365, Math.max(0, Math.floor(Number(clean(form.get('trial_days'), 5)) || 0))),
      couponId: clean(form.get('coupon_id'), 60),
      headline: clean(form.get('headline'), 120),
      subtext: clean(form.get('subtext'), 200),
      rampText: clean(form.get('ramp_text'), 200),
      startsOn: day(form.get('starts')),
      endsOn: day(form.get('ends')),
    };
    const exists = offers.some((o) => o.id === next.id);
    // Enforce a single live offer: activating this one deactivates the rest.
    offers = (exists ? offers.map((o) => (o.id === next.id ? next : o)) : [...offers, next])
      .map((o) => (active && o.id !== next.id ? { ...o, active: false } : o));
    await saveOffers(offers);
    return done('?msg=saved');
  }
  return done();
};
