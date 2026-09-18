import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { stripe } from '../../../lib/stripe';
import { env } from '../../../lib/env';

// Create / delete Stripe coupons from the admin module, so discounts are managed on-site instead
// of in the Stripe dashboard. Coupons are then referenced by id from an Offer (Offers page).
export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!env.STRIPE_SECRET_KEY) return redirect('/admin/discounts?msg=nostripe');

  const form = await request.formData();
  const action = clean(form.get('action'), 16);

  try {
    if (action === 'delete') {
      const id = clean(form.get('id'), 80);
      if (id) await stripe().coupons.del(id);
      return redirect('/admin/discounts?msg=deleted');
    }

    if (action === 'create') {
      const kind = clean(form.get('kind'), 10);        // 'amount' | 'percent'
      const duration = clean(form.get('duration'), 12); // 'once' | 'repeating' | 'forever'
      const dur = duration === 'repeating' || duration === 'forever' ? duration : 'once';
      const params: Record<string, unknown> = { duration: dur };
      const name = clean(form.get('name'), 60);
      if (name) params.name = name;

      if (kind === 'percent') {
        const pct = Math.min(100, Math.max(1, Math.round(Number(clean(form.get('percent'), 5)) || 0)));
        params.percent_off = pct;
      } else {
        const dollars = Number(clean(form.get('amount'), 12)) || 0;
        const cents = Math.max(1, Math.round(dollars * 100));
        params.amount_off = cents;
        params.currency = 'usd';
      }
      if (dur === 'repeating') {
        params.duration_in_months = Math.max(1, Math.floor(Number(clean(form.get('months'), 4)) || 1));
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await stripe().coupons.create(params as any);
      return redirect('/admin/discounts?msg=created');
    }
  } catch (e) {
    console.error('stripe coupon op failed', (e as Error)?.message);
    return redirect('/admin/discounts?msg=error');
  }
  return redirect('/admin/discounts');
};
