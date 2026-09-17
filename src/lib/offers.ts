import { getSetting, setSetting } from './settings';

// A library of composable intro offers, stored as a JSON array in the `settings` table (key
// `offers_json`). One offer is "live" at a time. An offer composes Stripe-native primitives so the
// money stays in Stripe: a free trial (trial_period_days) + an optional coupon/promotion code for the
// intro discount, applied to the base plan. e.g. "30 days free → $15/mo for 3 months → $49/mo" =
// trialDays 30 + a repeating Stripe coupon ($34 off, 3 months) on the $49 plan.
export interface Offer {
  id: string;
  name: string;              // internal label
  active: boolean;           // only one should be true; enforced on save
  plan: 'any' | 'monthly' | 'annual'; // which checkout plan it applies to
  trialDays: number;         // 0 = no free trial
  couponId: string;          // Stripe coupon id, or a promotion code id (promo_…); '' = none
  headline: string;          // banner headline on /featured
  subtext: string;           // banner subtext
  rampText: string;          // human price-ramp summary shown by the price (admin-authored to match the coupon)
  startsOn: string;          // '' or YYYY-MM-DD
  endsOn: string;
}

function normalize(o: any): Offer {
  return {
    id: String(o?.id ?? ''),
    name: String(o?.name ?? 'Offer').slice(0, 80),
    active: !!o?.active,
    plan: o?.plan === 'monthly' || o?.plan === 'annual' ? o.plan : 'any',
    trialDays: Math.min(365, Math.max(0, Math.floor(Number(o?.trialDays) || 0))),
    couponId: String(o?.couponId ?? '').slice(0, 60),
    headline: String(o?.headline ?? '').slice(0, 120),
    subtext: String(o?.subtext ?? '').slice(0, 200),
    rampText: String(o?.rampText ?? '').slice(0, 200),
    startsOn: /^\d{4}-\d{2}-\d{2}$/.test(o?.startsOn ?? '') ? o.startsOn : '',
    endsOn: /^\d{4}-\d{2}-\d{2}$/.test(o?.endsOn ?? '') ? o.endsOn : '',
  };
}

export async function getOffers(): Promise<Offer[]> {
  try {
    const raw = await getSetting('offers_json');
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.map(normalize) : [];
  } catch { return []; }
}
export async function saveOffers(offers: Offer[]): Promise<void> {
  await setSetting('offers_json', JSON.stringify(offers.slice(0, 30).map(normalize)));
}
export async function getOffer(id: string): Promise<Offer | null> {
  return (await getOffers()).find((o) => o.id === id) ?? null;
}

// The single live offer: active AND inside its date window. Used by /featured and checkout.
export async function activeOffer(): Promise<Offer | null> {
  const today = new Date().toISOString().slice(0, 10);
  for (const o of await getOffers()) {
    if (!o.active || !o.headline) continue;
    if (o.startsOn && today < o.startsOn) continue;
    if (o.endsOn && today > o.endsOn) continue;
    return o;
  }
  return null;
}

// Does the active offer apply to the plan being purchased?
export function offerAppliesTo(offer: Offer | null, plan: 'monthly' | 'annual'): boolean {
  return !!offer && (offer.plan === 'any' || offer.plan === plan);
}
