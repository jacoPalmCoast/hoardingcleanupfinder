# Hoarding Cleanup Finder

National directory of hoarding, biohazard, unattended-death and estate cleanup companies. Astro on Cloudflare Workers, D1, Stripe, Resend, Turnstile.

## Deploy (Cloudflare Workers Builds)

Connected to GitHub `jacoPalmCoast/hoardingcleanupfinder`, branch `main`.

- Build command: `npm run build`
- Deploy command: `npm run deploy:ci` (migrations → seed → deploy; seed is idempotent)

Every push to `main` redeploys.

## Secrets (Worker → Settings → Variables and Secrets, type Secret)

| Name | Where to get it |
|---|---|
| `ADMIN_PASSWORD` | Choose one. Used at `/admin/login`. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys (`sk_test_…` then `sk_live_…`) |
| `STRIPE_PUBLISHABLE_KEY` | same page (`pk_…`) |
| `STRIPE_PRICE_MONTHLY` | Stripe → Product catalog → create product "Featured listing" → price $49/month → copy `price_…` |
| `STRIPE_PRICE_ANNUAL` | same product → second price $399/year → `price_…` |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → Add endpoint `https://hoardingcleanupfinder.com/api/stripe/webhook`, events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` → Signing secret `whsec_…` |
| `RESEND_API_KEY` | resend.com → API keys. Also add and verify the domain `hoardingcleanupfinder.com` under Domains (DNS records go into Cloudflare DNS). Until verified, set `FROM_EMAIL` var to `onboarding@resend.dev` for testing. |
| `TURNSTILE_SITE_KEY` / `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile → Add widget → hostname `hoardingcleanupfinder.com` (add `workers.dev` too for testing) → Managed mode |

Stripe Customer Portal: Stripe → Settings → Billing → Customer portal → enable "Cancel subscriptions" and "Update payment method". Stripe → Settings → Billing → Subscriptions and emails → set "cancel subscription" after failed retries so cancellation reaches the webhook.

Without `TURNSTILE_SECRET_KEY` every form fails closed. Without `RESEND_API_KEY` no email is sent (claims and logins cannot complete). Without the Stripe vars the "Get featured" page shows a "payments not switched on" notice.

## Custom domain

Worker → Settings → Domains & Routes → Add → Custom domain → `hoardingcleanupfinder.com` (and `www`, redirected). Requires the zone to be active on Cloudflare.

## Local development

```
cp .dev.vars.example .dev.vars   # set ADMIN_PASSWORD; DEV_BYPASS_TURNSTILE=1 prints emails to the console instead of sending
npm install
npx wrangler d1 migrations apply hcf-db --local
npm run db:seed:local
npm run build && npx wrangler dev
```

## Data pipeline

`data/raw/*.json.gz` → `data/listings.json` (normalized) → `node scripts/import.mjs data/listings.json > data/seed.sql`. Import dedupes on phone, drops non-operational, groups listings under the metro they were queried in, infers services from name/category/query, and marks verified when Google-verified + website + 3 reviews.

## Admin

`/admin` — counts, pending listings, claims awaiting review, leads, reports, listing editor. Featured state is set only by Stripe webhooks.

## Structure

- `src/pages` — routes (`[st]/[city]` metro pages generate only with ≥3 listings)
- `src/lib` — db queries, env, email/turnstile/auth, stripe
- `src/data` — services taxonomy, states, guides content
- `src/middleware.ts` — admin guard and security headers
- `migrations/` — D1 schema
- `DESIGN.md` — design, invariants, acceptance tests
