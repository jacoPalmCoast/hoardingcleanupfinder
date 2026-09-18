// Read-side helpers for customer-facing promotion codes, managed from the admin module. A promotion
// code (e.g. FOUNDING50) is a shareable code that applies an existing coupon at checkout. Writes
// (create / deactivate) live in /api/admin/discounts. Promotion codes can be deactivated but not
// deleted in Stripe, so "remove" means deactivate.
import { stripe } from './stripe';
import { env } from './env';
import { couponTerms } from './stripeCoupons';

export interface PromoCodeView {
  id: string;
  code: string;
  couponName: string;
  couponTerms: string;
  active: boolean;
  redeemed: number;
  max: number | null;      // max_redemptions
  expires: string;         // YYYY-MM-DD or ''
  firstTimeOnly: boolean;
}

export async function listPromotionCodes(): Promise<PromoCodeView[]> {
  if (!env.STRIPE_SECRET_KEY) return [];
  try {
    const res = await stripe().promotionCodes.list({ limit: 100 });
    return res.data.map((pc) => {
      const coupon = pc.promotion?.coupon;
      const c = coupon && typeof coupon !== 'string' ? coupon : null;
      return {
        id: pc.id,
        code: pc.code,
        couponName: c ? (c.name || c.id) : '',
        couponTerms: c ? couponTerms(c) : '',
        active: pc.active,
        redeemed: pc.times_redeemed,
        max: pc.max_redemptions ?? null,
        expires: pc.expires_at ? new Date(pc.expires_at * 1000).toISOString().slice(0, 10) : '',
        firstTimeOnly: !!pc.restrictions?.first_time_transaction,
      };
    });
  } catch { return []; }
}

export interface CreatePromoInput {
  couponId: string;
  code: string;                 // optional; Stripe generates one if blank
  maxRedemptions?: number;
  expiresAt?: number;           // unix seconds
  firstTimeOnly?: boolean;
  minAmountUsd?: number;
}

export async function createPromotionCode(input: CreatePromoInput) {
  const params: Record<string, unknown> = { promotion: { type: 'coupon', coupon: input.couponId } };
  if (input.code) params.code = input.code;
  if (input.maxRedemptions && input.maxRedemptions > 0) params.max_redemptions = Math.floor(input.maxRedemptions);
  if (input.expiresAt && input.expiresAt > Math.floor(Date.now() / 1000)) params.expires_at = input.expiresAt;
  const restrictions: Record<string, unknown> = {};
  if (input.firstTimeOnly) restrictions.first_time_transaction = true;
  if (input.minAmountUsd && input.minAmountUsd > 0) {
    restrictions.minimum_amount = Math.round(input.minAmountUsd * 100);
    restrictions.minimum_amount_currency = 'usd';
  }
  if (Object.keys(restrictions).length) params.restrictions = restrictions;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return stripe().promotionCodes.create(params as any);
}

export async function deactivatePromotionCode(id: string): Promise<void> {
  await stripe().promotionCodes.update(id, { active: false });
}
