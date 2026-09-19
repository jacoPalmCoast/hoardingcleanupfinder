import { env as cfEnv } from 'cloudflare:workers';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  ATTACH?: R2Bucket;                // private R2 bucket for inbound support-email attachments
  PHOTOS?: R2Bucket;                // listing photos, served via the /img/ route
  FEEDBACK?: R2Bucket;              // feedback screenshots, served only via the admin route
  AI?: { run: (model: string, input: unknown) => Promise<unknown> };  // Workers AI (LLM extraction + admin agent fallback)
  ANTHROPIC_API_KEY?: string;   // when set, the admin agent uses Claude; otherwise Workers AI
  AGENT_MODEL?: string;         // optional Claude model override for the admin agent
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
  CF_ANALYTICS_TOKEN?: string;      // Cloudflare API token (read-only Account Analytics) — pulls Web Analytics into admin
  CF_ACCOUNT_ID?: string;           // Cloudflare account tag for the GraphQL Analytics query (public)
  CF_RUM_SITE_TAG?: string;         // Web Analytics site tag to filter RUM events on (public)
  HUNTER_API_KEY?: string;          // optional Hunter.io key — powers provider-based email enrichment + verification
  OPENCORPORATES_TOKEN?: string;    // optional OpenCorporates API token — owner/officer names from state filings
  GOOGLE_PLACES_KEY?: string;       // optional Google Places API key — extra business details by place_id
  GOOGLE_SITE_VERIFICATION?: string; // optional GSC HTML-tag token (env fallback; admin setting preferred)
  BING_SITE_VERIFICATION?: string;   // optional Bing Webmaster msvalidate.01 token (env fallback; admin setting preferred)
}

export const env = cfEnv as unknown as Env;

export function requireEnv<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const v = env[key];
  if (v === undefined || v === null || v === '') throw new Error(`Missing env: ${String(key)}`);
  return v as NonNullable<Env[K]>;
}
