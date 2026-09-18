// Read/side helpers for managing the Featured product's Stripe prices from the admin module, so
// Jaco can create and swap recurring prices on-site instead of in the Stripe dashboard. Stripe
// prices are immutable: "changing" a price means creating a new one, pointing the site's settings
// at it, and archiving the old one. Writes live in /api/admin/plans. Money is USD cents on Stripe.
import Stripe from 'stripe';
import { stripe } from './stripe';
import { env } from './env';
import { getSetting, setSetting, featuredPricing } from './settings';

export interface PriceView {
  id: string;
  amount: number;          // dollars
  interval: string;        // 'month' | 'year' | 'week' | 'day'
  intervalCount: number;
  terms: string;           // "$49.00 / month", "$399.00 / year", "$120.00 / 3 months"
  active: boolean;
  role: '' | 'monthly' | 'annual'; // whether the site currently sells this price
}

const NAMES: Record<string, [string, string]> = {
  day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'],
};

export function priceTerms(unitAmount: number | null, interval?: string, count?: number | null): string {
  const dollars = ((unitAmount ?? 0) / 100).toFixed(2);
  const n = count && count > 1 ? count : 1;
  const [one, many] = NAMES[interval || 'month'] || ['period', 'periods'];
  const per = n > 1 ? `${n} ${many}` : one;
  return `$${dollars} / ${per}`;
}

// Resolve the product these prices attach to. Prefer the stored id; else infer from the current
// monthly price's product; else create a product once and remember it. Returns '' if Stripe unset.
export async function ensureFeaturedProductId(): Promise<string> {
  if (!env.STRIPE_SECRET_KEY) return '';
  const stored = await getSetting('stripe_product_id');
  if (stored) return stored;
  const s = stripe();
  const pricing = await featuredPricing();
  try {
    if (pricing.stripeMonthly) {
      const p = await s.prices.retrieve(pricing.stripeMonthly);
      const prod = typeof p.product === 'string' ? p.product : p.product?.id;
      if (prod) { await setSetting('stripe_product_id', prod); return prod; }
    }
  } catch { /* fall through to create */ }
  const created = await s.products.create({ name: env.SITE_NAME || 'Featured Listing', description: `Featured placement on ${env.SITE_URL || 'the directory'}` });
  await setSetting('stripe_product_id', created.id);
  return created.id;
}

// All recurring prices on the Featured product, newest first, tagged with the role the site assigns.
export async function listProductPrices(): Promise<PriceView[]> {
  if (!env.STRIPE_SECRET_KEY) return [];
  try {
    const productId = await ensureFeaturedProductId();
    if (!productId) return [];
    const pricing = await featuredPricing();
    const res = await stripe().prices.list({ product: productId, limit: 100 });
    return res.data
      .filter((p) => p.recurring)
      .map((p) => {
        const interval = p.recurring?.interval || 'month';
        const intervalCount = p.recurring?.interval_count || 1;
        const role: PriceView['role'] = p.id === pricing.stripeMonthly ? 'monthly' : p.id === pricing.stripeAnnual ? 'annual' : '';
        return {
          id: p.id,
          amount: (p.unit_amount ?? 0) / 100,
          interval,
          intervalCount,
          terms: priceTerms(p.unit_amount, interval, intervalCount),
          active: p.active,
          role,
        };
      })
      .sort((a, b) => (a.active === b.active ? 0 : a.active ? -1 : 1));
  } catch { return []; }
}

export interface CreatePriceInput { amountUsd: number; interval: 'month' | 'year'; intervalCount: number; }

// Create a recurring price on the Featured product and return its id.
export async function createRecurringPrice(input: CreatePriceInput): Promise<Stripe.Price> {
  const productId = await ensureFeaturedProductId();
  const cents = Math.max(1, Math.round(input.amountUsd * 100));
  const interval = input.interval === 'year' ? 'year' : 'month';
  const interval_count = Math.max(1, Math.min(interval === 'month' ? 12 : 3, Math.floor(input.intervalCount || 1)));
  return stripe().prices.create({
    product: productId,
    currency: 'usd',
    unit_amount: cents,
    recurring: { interval, interval_count },
  });
}

export async function archivePrice(id: string): Promise<void> {
  await stripe().prices.update(id, { active: false });
}
