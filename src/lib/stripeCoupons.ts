// Read-side helpers for managing Stripe coupons from the admin module. Writes (create/delete)
// live in /api/admin/discounts. Coupons are the raw Stripe discount objects; an Offer (offers.ts)
// references one by id to build an intro ramp. All money is in USD cents on Stripe's side.
import { stripe } from './stripe';
import { env } from './env';

export interface CouponView {
  id: string;
  name: string;
  terms: string;     // human summary, e.g. "$34.00 off for 3 months"
  valid: boolean;    // Stripe's own validity flag (max redemptions / date window)
  redeemed: number;
}

export function couponTerms(c: {
  amount_off?: number | null;
  percent_off?: number | null;
  currency?: string | null;
  duration?: string;
  duration_in_months?: number | null;
}): string {
  const off = c.amount_off != null
    ? `$${(c.amount_off / 100).toFixed(2)} off`
    : `${c.percent_off}% off`;
  const dur = c.duration === 'repeating'
    ? `for ${c.duration_in_months} month${c.duration_in_months === 1 ? '' : 's'}`
    : c.duration === 'forever' ? 'forever' : 'once';
  return `${off} ${dur}`;
}

export async function listCoupons(): Promise<CouponView[]> {
  if (!env.STRIPE_SECRET_KEY) return [];
  try {
    const res = await stripe().coupons.list({ limit: 100 });
    return res.data.map((c) => ({
      id: c.id,
      name: c.name || c.id,
      terms: couponTerms(c),
      valid: c.valid,
      redeemed: c.times_redeemed,
    }));
  } catch {
    return [];
  }
}
