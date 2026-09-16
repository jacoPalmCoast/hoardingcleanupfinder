import { env as cfEnv } from 'cloudflare:workers';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SITE_URL: string;
  SITE_NAME: string;
  FROM_EMAIL: string;
  ADMIN_EMAIL?: string;             // where operator notifications go (leads, reports, reviews, claims). Falls back to FROM_EMAIL.
  FEATURED_MONTHLY_USD: string;
  FEATURED_ANNUAL_USD: string;
  ADMIN_PASSWORD?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_PUBLISHABLE_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MONTHLY?: string;
  STRIPE_PRICE_ANNUAL?: string;
  RESEND_API_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  TURNSTILE_SECRET_KEY?: string;
  SESSION_SECRET?: string;
  DEV_BYPASS_TURNSTILE?: string;
  INDEXNOW_KEY?: string;
  RESEND_WEBHOOK_SECRET?: string;   // Svix signing secret for the Resend delivery webhook (whsec_...)
  CRON_SECRET?: string;             // bearer secret for POST /api/cron/run
  MAILING_ADDRESS?: string;         // physical postal address for the CAN-SPAM marketing footer (P2)
  WEB_ANALYTICS_TOKEN?: string;     // Cloudflare Web Analytics beacon token; if set, the beacon loads (aggregate traffic)
}

export const env = cfEnv as unknown as Env;

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env[key];
  if (v === undefined || v === null || v === '') throw new Error(`Missing env: ${String(key)}`);
  return v as NonNullable<Env[K]>;
}
