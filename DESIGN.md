# Hoarding Cleanup Finder — Design

Domain: hoardingcleanupfinder.com. National directory of hoarding, biohazard, unattended-death and estate cleanup companies. Standalone brand.

## Purpose and users
- **Buyers**: adult children, executors, landlords, property managers, APS/social workers. Acute, embarrassed, time-pressed. Need a vetted, discreet shortlist and a plain cost guide. Never marketed to.
- **Operators**: independent cleanup companies and junk haulers who added hoarding as a service. Get a free page; pay $49/mo or $399/yr for featured placement (pinned to top of their metro page, badge, photos, quote requests routed to them first).
- **Owner (Jaco)**: admin route to approve, verify, merge, view leads, see counts.

## Pages
| Route | Purpose | Notes |
|---|---|---|
| `/` | Search by city/zip, top metros, three services, cost guide teaser | |
| `/search?q=&service=` | Results | FTS on name/city/state/zip |
| `/state/[st]` | State page | 50 pages; state licensing note; metros list; listings |
| `/[st]/[city]` | Metro page | only when ≥3 listings; featured → verified → rest |
| `/[st]/[city]/[service]` | Service in metro | only when ≥3 listings in that service |
| `/company/[slug]` | Listing page | LocalBusiness schema; call; quote; claim; report |
| `/guides/[slug]` | Guides | 10 at launch |
| `/add-listing` | Self-submission | Turnstile; pending until approved |
| `/claim/[slug]` | Claim listing | email code verification |
| `/featured/[slug]` | Featured upgrade | Stripe Checkout |
| `/account` | Owner portal | magic link; edit; billing portal |
| `/admin` | Owner admin | password (ADMIN_PASSWORD secret), cookie session |
| `/api/stripe/webhook` | Stripe events | constructEventAsync |
| `/sitemap.xml`, `/robots.txt` | | generated from D1 |

## Data model (D1)
- `listings`(id, slug UNIQUE, name, phone, website, email, address, city, state, zip, lat, lng, description, services TEXT(json), rating, review_count, is_verified, is_claimed, is_featured, featured_until, stripe_customer_id, stripe_subscription_id, status['pending','active','removed'], source, place_id, created_at, updated_at)
- `cities`(id, slug, name, state, lat, lng, population, listing_count)
- `leads`(id, listing_id NULL, name, phone, email, zip, city, state, service, message, routed_to TEXT(json), status, created_at)
- `claims`(id, listing_id, email, code(sha256), status['pending','review','verified','rejected','expired'], attempts, created_at, verified_at)
- `owners`(id, email UNIQUE, created_at); `owner_listings`(owner_id, listing_id)
- `sessions`(token(sha256), owner_id, expires_at); `admin_sessions`(token(sha256), expires_at); `login_codes`(email, code(sha256), attempts, expires_at, used)
- `stripe_events`(id, type) idempotency, written after successful processing; `rate_limits`(key, count, window_start)
- listings also carry `phone_digits`, `city_slug` (metro grouping), `subscription_status`
- `reports`(id, listing_id, message, email, status, created_at)
- `listings_fts` FTS5 (name, city, state, zip, services)

## Invariants
1. Secrets only from Worker secrets/env; never in repo, never logged.
2. `is_featured` is set only by the Stripe webhook; render checks `is_featured=1 AND featured_until > now`.
3. No metro/service page is generated with fewer than 3 active listings (Google scaled-content/doorway policy).
4. Every listing page has claim, correct, and remove links; removal requests honoured within 24h.
5. No scraped review text or photos; descriptions are ours; only owner-uploaded photos.
6. All forms behind Turnstile; server-side siteverify.
7. Admin fails closed: no or invalid cookie = 302 to login (403 on /api/admin); wrong password = redirect to login with error; sessions are random tokens with server-side expiry, revoked on logout.
8. Owner can edit only listings in `owner_listings`.
9. No "AI" in UI labels; plain, respectful tone; WCAG 2.1 AA.
10. Never delete listings; `status='removed'`.

## Review log
- 2026-09-14 independent review: FAIL (B1 JSON-LD XSS, H1 webhook idempotency, H2 out-of-order events, M1–M6, L1–L13). All fixed except L4 (doc updated instead) and L13 (this update). Re-verified live: prototype-key pages 404, uppercase metro 301, open redirect neutralised, admin logout revokes, malformed cookie 302.

## Phases and acceptance
1. Core: pages render from D1 with seed sample; search works; sitemap lists real routes; schema validates.
2. Claim/leads/admin: claim code emailed and verified; quote form writes lead and emails routed operators; admin counts correct; admin fails closed.
3. Stripe: test checkout → webhook → listing featured; cancel in portal → unfeatured; failed payment email.
4. Data: ≥800 verified listings, dedupe on phone; ≥30 metros with ≥3 listings.
5. Deploy: live on domain, DNS, secrets set, independent review PASS, live positive/negative checks, a11y pass.
