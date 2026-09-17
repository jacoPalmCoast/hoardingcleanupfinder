import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { setSetting } from '../../../lib/settings';

const money = (v: FormDataEntryValue | null) => String(Math.max(0, Math.round(Number(clean(v, 12)) || 0)));
const priceId = (v: FormDataEntryValue | null) => { const s = clean(v, 60); return /^price_[A-Za-z0-9]+$/.test(s) ? s : ''; };

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
  return redirect('/admin/pricing');
};
