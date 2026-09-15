import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { redirect, returnOrigin } from '../../../lib/util';
import { currentOwner } from '../../../lib/services';
import { stripe, stripeConfigured } from '../../../lib/stripe';

// POST-only: creating a billing-portal session is a state-changing action tied to the owner's cookie;
// a GET could be triggered cross-site. The same-origin form + middleware Origin guard gate it.
export const POST: APIRoute = async ({ request }) => {
  const owner = await currentOwner(request);
  if (!owner) return redirect('/account', 302);
  if (!stripeConfigured()) return redirect('/account');
  const row = await env.DB.prepare(
    `SELECT l.stripe_customer_id AS c FROM listings l JOIN owner_listings ol ON ol.listing_id = l.id WHERE ol.owner_id = ?1 AND l.stripe_customer_id IS NOT NULL LIMIT 1`,
  )
    .bind(owner.id)
    .first<{ c: string }>();
  if (!row) return redirect('/account');
  const session = await stripe().billingPortal.sessions.create({ customer: row.c, return_url: `${returnOrigin(request, env.SITE_URL)}/account` });
  return redirect(session.url, 303);
};
