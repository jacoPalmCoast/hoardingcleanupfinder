import type { APIRoute } from 'astro';
import Stripe from 'stripe';
import { env } from '../../../lib/env';
import { audit } from '../../../lib/audit';
import { queueIndexNow } from '../../../lib/indexnow';
import { stripe, GRACE_SECONDS } from '../../../lib/stripe';
import { sendEmail, emailShell } from '../../../lib/services';
import { escapeHtml, now } from '../../../lib/util';
import { upsertInvoice, money } from '../../../lib/billing';

// Invariant 2: this handler is the primary writer of is_featured / featured_until. The one other
// writer is the daily dunning job (lib/cron.ts billingDunning), which demotes to free after 7 unpaid
// days; a later invoice.paid here re-features automatically.
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
    const price = (item as any)?.price;
    const planInterval = price?.recurring?.interval ?? null; // 'month' | 'year'
    const rawAmt = Number(price?.unit_amount);
    const planAmount = Number.isFinite(rawAmt) ? rawAmt : null; // cents
    const cancelAtEnd = (sub as any).cancel_at_period_end ? 1 : 0;
    await env.DB.prepare(
      `UPDATE listings SET is_featured = ?2, featured_until = ?3, stripe_subscription_id = ?4, subscription_status = ?5, plan_interval = ?6, plan_amount = ?7, cancel_at_period_end = ?8, updated_at = unixepoch() WHERE id = ?1`,
    )
      .bind(listingId, active ? 1 : 0, until || null, sub.id, sub.status, planInterval, planAmount, cancelAtEnd)
      .run();
    await audit('system', 'stripe', listingId, 'featured.sync', null, { is_featured: active ? 1 : 0, featured_until: until || null, subscription_status: sub.status, cancel_at_period_end: cancelAtEnd });
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
      let listingId: number | null = null;
      if (subId) {
        const sub = await s.subscriptions.retrieve(String(subId));
        listingId = await listingIdFrom(String(inv.customer), sub);
        if (listingId) await setFeatured(listingId, sub);
      } else {
        listingId = await listingIdFrom(String(inv.customer));
      }
      if (listingId) {
        // Per-invoice idempotency: if this invoice is already recorded paid, a webhook retry is
        // replaying — do the (idempotent) state writes but never re-send the receipt.
        const prevStatus = (await env.DB.prepare(`SELECT status FROM invoices WHERE id = ?1`).bind(inv.id).first<{ status: string | null }>())?.status ?? null;
        await upsertInvoice(inv, listingId);
        // Payment succeeded: clear any dunning clock so the daily sequence stops.
        await env.DB.prepare(`UPDATE listings SET dunning_started_at = NULL WHERE id = ?1`).bind(listingId).run();
        // Branded receipt — only for a real charge (skip $0 trial-start invoices) and only the first
        // time this invoice is seen paid.
        const paid = typeof inv.amount_paid === 'number' ? inv.amount_paid : 0;
        if (paid > 0 && prevStatus !== 'paid') {
          const l = await env.DB.prepare(`SELECT name, slug, featured_until FROM listings WHERE id = ?1`).bind(listingId).first<{ name: string; slug: string; featured_until: number | null }>();
          const email = inv.customer_email || (await env.DB.prepare(`SELECT o.email AS e FROM owner_listings ol JOIN owners o ON o.id = ol.owner_id WHERE ol.listing_id = ?1 ORDER BY ol.owner_id LIMIT 1`).bind(listingId).first<{ e: string }>())?.e;
          if (email && l) {
            const renews = l.featured_until ? new Date(l.featured_until * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null;
            const link = inv.hosted_invoice_url;
            const body = `<p>Thanks — we've received your payment of <strong>${money(paid, inv.currency)}</strong> for the featured listing <a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a>.</p>`
              + (renews ? `<p>Your featured placement is paid through <strong>${renews}</strong>; it renews automatically on the card on file.</p>` : '')
              + (link ? `<p><a href="${link}">View or download your receipt</a>.</p>` : '')
              + `<p>Manage your card or cancel any time from <a href="${env.SITE_URL}/account/billing/${listingId}">your billing page</a>.</p>`;
            await sendEmail(email, `Payment received — ${l.name}`, emailShell('Payment received', body), { stream: 'txn', type: 'billing_receipt', listingId });
          }
        }
      }
      break;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const listingId = await listingIdFrom(String(inv.customer));
      const l = listingId ? await env.DB.prepare(`SELECT name, slug, dunning_started_at FROM listings WHERE id = ?1`).bind(listingId).first<{ name: string; slug: string; dunning_started_at: number | null }>() : null;
      // Stripe fires this on every failed retry attempt. Treat the first one (clock not yet running)
      // as the start of dunning; only then send the immediate notice. The daily cron owns the rest.
      const firstFailure = !!listingId && !l?.dunning_started_at;
      if (listingId) {
        await upsertInvoice(inv, listingId);
        await env.DB.prepare(`UPDATE listings SET dunning_started_at = COALESCE(dunning_started_at, ?2) WHERE id = ?1`).bind(listingId, now()).run();
        await audit('system', 'stripe', listingId, 'billing.payment_failed', null, { invoice: inv.id });
      }
      const email = firstFailure ? (inv.customer_email || (listingId ? (await env.DB.prepare(`SELECT o.email AS e FROM owner_listings ol JOIN owners o ON o.id = ol.owner_id WHERE ol.listing_id = ?1 ORDER BY ol.owner_id LIMIT 1`).bind(listingId).first<{ e: string }>())?.e : null)) : null;
      if (email) {
        const body = `<p>We couldn't charge the card on file for the featured listing${l ? ` <a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a>` : ''}. We'll try again and remind you daily for the next few days.</p>`
          + `<p>To fix it now, update your card on <a href="${env.SITE_URL}/account/billing/${listingId ?? ''}">your billing page</a>. If it isn't sorted within 7 days the listing drops back to a free listing — nothing is deleted, and it returns to the top the moment payment goes through.</p>`;
        await sendEmail(email, `Payment failed — ${l?.name ?? 'your featured listing'}`, emailShell('Payment needs attention', body), { stream: 'txn', type: 'billing_failed', listingId: listingId ?? undefined });
      }
      break;
    }
    case 'invoice.voided':
    case 'invoice.marked_uncollectible':
    case 'invoice.finalized':
    case 'invoice.updated': {
      // Keep the local mirror's status/amounts current so the advertiser never sees a phantom
      // balance for an invoice Stripe has since voided or written off.
      const inv = event.data.object as Stripe.Invoice;
      const listingId = await listingIdFrom(String(inv.customer));
      if (listingId) await upsertInvoice(inv, listingId);
      break;
    }
    default:
      break;
  }
  await env.DB.prepare(`INSERT OR IGNORE INTO stripe_events(id, type) VALUES (?1, ?2)`).bind(event.id, event.type).run();
  return new Response('ok', { status: 200 });
};
