import Stripe from 'stripe';
import { env, requireEnv } from './env';

export function stripe(): Stripe {
  return new Stripe(requireEnv('STRIPE_SECRET_KEY'), { httpClient: Stripe.createFetchHttpClient() });
}

export function stripeConfigured(): boolean {
  return !!(env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_MONTHLY && env.STRIPE_PRICE_ANNUAL && env.STRIPE_WEBHOOK_SECRET);
}

export const GRACE_SECONDS = 3 * 24 * 3600;
