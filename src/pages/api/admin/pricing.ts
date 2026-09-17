import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { setSetting } from '../../../lib/settings';

const money = (v: FormDataEntryValue | null) => String(Math.max(0, Math.round(Number(clean(v, 12)) || 0)));
const priceId = (v: FormDataEntryValue | null) => { const s = clean(v, 60); return /^price_[A-Za-z0-9]+$/.test(s) ? s : ''; };
const day = (v: FormDataEntryValue | null) => { const s = clean(v, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ''; };

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 24);

  if (action === 'save_pricing') {
    await setSetting('price_monthly_usd', money(form.get('price_monthly_usd')));
    await setSetting('price_annual_usd', money(form.get('price_annual_usd')));
    // Stripe Price IDs must look like price_… ; an empty/invalid value clears the override (env fallback used).
    await setSetting('stripe_price_monthly', priceId(form.get('stripe_price_monthly')));
    await setSetting('stripe_price_annual', priceId(form.get('stripe_price_annual')));
    return redirect('/admin/pricing?saved=1');
  }

  if (action === 'save_special') {
    await setSetting('special_enabled', form.get('special_enabled') ? 'on' : 'off');
    await setSetting('special_headline', clean(form.get('special_headline'), 120));
    await setSetting('special_subtext', clean(form.get('special_subtext'), 200));
    // Stripe promotion code object id (promo_…) to auto-apply at checkout; blank = customer types the code.
    const promo = clean(form.get('special_promo_id'), 60);
    await setSetting('special_promo_id', /^promo_[A-Za-z0-9]+$/.test(promo) ? promo : '');
    await setSetting('special_starts', day(form.get('special_starts')));
    await setSetting('special_ends', day(form.get('special_ends')));
    return redirect('/admin/specials?saved=1');
  }
  return redirect('/admin/pricing');
};
