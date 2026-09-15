import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { env } from '../../../lib/env';
import { audit } from '../../../lib/audit';
import { queueIndexNow } from '../../../lib/indexnow';
import { stripe, GRACE_SECONDS } from '../../../lib/stripe';
import { sendEmail, emailShell } from '../../../lib/services';
import { escapeHtml, now } from '../../../lib/util';

// Invariant 2: this handler is the only writer of is_featured / featured_until.
export const POST: APIRoute = async ({ request, locals }) => {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY) return new Response('not configured', { status: 503 });
  const sig = request.headers.get('stripe-signature');
  if (!sig) return new Response('missing signature', { status: 400 });
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = await stripe().webhooks.constructEventAsync(body, sig, env.STRIPE_WEBHOOK_SECRET, undefined, Stripe.createSubtleCryptoProvider());
  } catch (e) {
    return new Response('bad signature', { status: 400 });
  }

  // Idempotency: skip events already fully processed. The row is written only after the
  // handler succeeds, so a transient failure leaves the event retryable by Stripe.
  const seen = await env.DB.prepare(`SELECT 1 AS ok FROM stripe_events WHERE id = ?1`).bind(event.id).first();
  if (seen) return new Response('duplicate', { status: 200 });

  const s = stripe();
  const listingIdFrom = async (customer: string | null, sub?: Stripe.Subscription | null): Promise<number | null> => {
    const meta = sub?.metadata?.listing_id;
    if (meta && /^\d+$/.test(meta)) return Number(meta);
    if (!customer) return null;
    const row = await env.DB.prepare(`SELECT id FROM listings WHERE stripe_customer_id = ?1`).bind(customer).first<{ id: number }>();
    return row?.id ?? null;
  };

  const setFeatured = async (listingId: number, sub: Stripe.Subscription) => {
    const exists = await env.DB.prepare(`SELECT 1 AS ok FROM listings WHERE id = ?1`).bind(listingId).first();
    if (!exists) {
      console.warn(`stripe webhook: no listing ${listingId} for subscription ${sub.id}`);
      return;
    }
    const active = sub.status === 'active' || sub.status === 'trialing' || sub.status === 'past_due';
    const item = sub.items.data[0];
    const rawEnd = (item as any)?.current_period_end ?? (sub as any).current_period_end;
    const pe = Number(rawEnd);
    // Never leave an active (paid) subscription without a featured window: if Stripe omits/garbles the
    // period end, fall back to 31 days out so the customer isn't charged and shown as not-featured.
    const hasEnd = Number.isFinite(pe) && pe > 0;
    if (active && !hasEnd) console.warn(`stripe webhook: missing current_period_end for sub ${sub.id}, listing ${listingId}; using 31-day fallback`);
    const periodEnd = hasEnd ? pe : now() + 31 * 86400;
    const until = active ? periodEnd + GRACE_SECONDS : 0;
    await env.DB.prepare(
      `UPDATE listings SET is_featured = ?2, featured_until = ?3, stripe_subscription_id = ?4, subscription_status = ?5, updated_at = unixepoch() WHERE id = ?1`,
    )
      .bind(listingId, active ? 1 : 0, until || null, sub.id, sub.status)
      .run();
    await audit('system', 'stripe', listingId, 'featured.sync', null, { is_featured: active ? 1 : 0, featured_until: until || null, subscription_status: sub.status });
    const row = await env.DB.prepare(`SELECT slug, state, city_slug, services FROM listings WHERE id = ?1`).bind(listingId).first<{ slug: string; state: string; city_slug: string; services: string }>();
    if (row) queueIndexNow(locals, [`/company/${row.slug}`, `/${row.state.toLowerCase()}/${row.city_slug}`]);
  };

  switch (event.type) {
    case 'checkout.session.completed': {
      const cs = event.data.object as Stripe.Checkout.Session;
      const listingId = Number(cs.metadata?.listing_id ?? cs.client_reference_id ?? 0);
      if (listingId && cs.subscription) {
        const sub = await s.subscriptions.retrieve(String(cs.subscription));
        await env.DB.prepare(`UPDATE listings SET stripe_customer_id = COALESCE(stripe_customer_id, ?2) WHERE id = ?1`).bind(listingId, String(cs.customer)).run();
        await setFeatured(listingId, sub);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      // Events can arrive out of order; the payload is only a hint. Re-fetch the current state.
      const hint = event.data.object as Stripe.Subscription;
      let sub = hint;
      try {
        sub = await s.subscriptions.retrieve(hint.id);
      } catch (e) {
        // A deleted subscription may not be retrievable; the deleted payload is then authoritative.
        if (event.type !== 'customer.subscription.deleted') throw e;
      }
      const listingId = await listingIdFrom(String(sub.customer), sub);
      if (listingId) await setFeatured(listingId, sub);
      break;
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      const subId = (inv as any).subscription ?? (inv as any).parent?.subscription_details?.subscription;
      if (subId) {
        const sub = await s.subscriptions.retrieve(String(subId));
        const listingId = await listingIdFrom(String(inv.customer), sub);
        if (listingId) await setFeatured(listingId, sub);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const email = inv.customer_email;
      const listingId = await listingIdFrom(String(inv.customer));
      const l = listingId ? await env.DB.prepare(`SELECT name, slug FROM listings WHERE id = ?1`).bind(listingId).first<{ name: string; slug: string }>() : null;
      if (email) {
        await sendEmail(email, `Payment failed for ${l?.name ?? 'your featured listing'}`, emailShell('Payment failed', `<p>We could not charge the card on file for the featured listing${l ? ` <a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a>` : ''}. Stripe will retry over the next few days. To update the card, <a href="${env.SITE_URL}/api/stripe/portal">open billing</a>. If the retries fail the listing goes back to free; nothing is deleted.</p>`));
      }
      break;
    }
    default:
      break;
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO stripe_events(id, type) VALUES (?1, ?2)`).bind(event.id, event.type).run();
  return new Response('ok', { status: 200 });
};
