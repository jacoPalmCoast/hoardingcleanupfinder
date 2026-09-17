// Editable business settings, stored in the `settings` table and managed from Admin → Setup.
// Read fresh each call (cheap PK lookups; changes take effect immediately across isolates). Env
// vars are the fallback so nothing breaks before a value is set.
import { env } from './env';

export const SETTING_KEYS = ['business_name', 'mailing_address', 'support_email', 'support_phone'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getSettings(keys: readonly string[] = SETTING_KEYS): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  try {
    const ph = keys.map((_, i) => `?${i + 1}`).join(',');
    const rows = (await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${ph})`).bind(...keys).all<{ key: string; value: string }>()).results;
    const out: Record<string, string> = {};
    for (const r of rows) if (r.value != null) out[r.key] = r.value;
    return out;
  } catch { return {}; }
}
export async function getSetting(key: string): Promise<string | null> {
  return (await getSettings([key]))[key] ?? null;
}
export async function setSetting(key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings(key, value, updated_at) VALUES (?1, ?2, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = unixepoch()`,
  ).bind(key, value.trim()).run();
}

// Convenience accessors with env fallback.
export async function mailingAddress(): Promise<string> { return (await getSetting('mailing_address')) || env.MAILING_ADDRESS || ''; }
export async function businessName(): Promise<string> { return (await getSetting('business_name')) || env.SITE_NAME || ''; }

// Featured pricing. Display amounts (what /featured shows) and the Stripe Price IDs that actually
// bill are editable here with env fallback, so Jaco can change price/plan without a redeploy. The
// charged amount is always whatever the Stripe Price ID resolves to — Stripe is the source of truth.
export interface FeaturedPricing { monthlyUsd: string; annualUsd: string; stripeMonthly: string; stripeAnnual: string }
export async function featuredPricing(): Promise<FeaturedPricing> {
  const s = await getSettings(['price_monthly_usd', 'price_annual_usd', 'stripe_price_monthly', 'stripe_price_annual']);
  return {
    monthlyUsd: s.price_monthly_usd || env.FEATURED_MONTHLY_USD || '49',
    annualUsd: s.price_annual_usd || env.FEATURED_ANNUAL_USD || '399',
    stripeMonthly: s.stripe_price_monthly || env.STRIPE_PRICE_MONTHLY || '',
    stripeAnnual: s.stripe_price_annual || env.STRIPE_PRICE_ANNUAL || '',
  };
}

// A running special/promo. Presentation (banner) lives here; any actual discount is a Stripe
// promotion code, so the money stays in Stripe. Returns null unless enabled AND inside its window.
export interface Special { headline: string; subtext: string; promoId: string; startsOn: string; endsOn: string }
export async function activeSpecial(): Promise<Special | null> {
  const s = await getSettings(['special_enabled', 'special_headline', 'special_subtext', 'special_promo_id', 'special_starts', 'special_ends']);
  if (s.special_enabled !== 'on') return null;
  const headline = (s.special_headline || '').trim();
  if (!headline) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (s.special_starts && today < s.special_starts) return null;
  if (s.special_ends && today > s.special_ends) return null;
  return { headline, subtext: (s.special_subtext || '').trim(), promoId: (s.special_promo_id || '').trim(), startsOn: s.special_starts || '', endsOn: s.special_ends || '' };
}
