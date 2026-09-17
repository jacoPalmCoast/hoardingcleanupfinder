import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect, returnOrigin } from '../../../lib/util';
import { currentOwner, ownerOwns } from '../../../lib/services';
import { getListingById, isLive } from '../../../lib/db';
import { stripe, stripeConfigured } from '../../../lib/stripe';
import { featuredPricing } from '../../../lib/settings';
import { activeOffer, offerAppliesTo } from '../../../lib/offers';

export const POST: APIRoute = async ({ request }) => {
  const owner = await currentOwner(request);
  if (!owner) return redirect('/account', 302);
  const form = await request.formData();
  const id = Number(clean(form.get('listing_id'), 12));
  const plan = clean(form.get('plan'), 10) === 'annual' ? 'annual' : 'monthly';
  const l = await getListingById(id);
  if (!l || l.status !== 'active') return redirect('/account');
  if (!(await ownerOwns(owner.id, l.id))) return new Response('Forbidden', { status: 403 });
  if (!stripeConfigured()) return redirect(`/featured/${l.slug}?msg=unavailable`);
  if (isLive(l)) return redirect(`/featured/${l.slug}`);

  const s = stripe();
  let customer = l.stripe_customer_id;
  if (!customer) {
    const c = await s.customers.create({ email: owner.email, name: l.name, metadata: { listing_id: String(l.id) } });
    customer = c.id;
    await env.DB.prepare(`UPDATE listings SET stripe_customer_id = ?2 WHERE id = ?1`).bind(l.id, customer).run();
  }
  const pricing = await featuredPricing();
  const priceId = plan === 'annual' ? pricing.stripeAnnual : pricing.stripeMonthly;

  // The live offer composes Stripe primitives: a free trial + an intro coupon on the base plan.
  // If it applies to this plan, use its trial + coupon; otherwise let the customer enter any promo
  // code. (Stripe forbids discounts and allow_promotion_codes together.)
  const offer = await activeOffer();
  const applies = offerAppliesTo(offer, plan);
  const subData: Record<string, unknown> = { metadata: { listing_id: String(l.id) } };
  if (applies && offer!.trialDays > 0) subData.trial_period_days = offer!.trialDays;
  const discount = applies && offer!.couponId
    ? { discounts: [offer!.couponId.startsWith('promo_') ? { promotion_code: offer!.couponId } : { coupon: offer!.couponId }] }
    : { allow_promotion_codes: true };
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: priceId || (plan === 'annual' ? env.STRIPE_PRICE_ANNUAL! : env.STRIPE_PRICE_MONTHLY!), quantity: 1 }],
    client_reference_id: String(l.id),
    metadata: { listing_id: String(l.id), plan, offer: applies ? offer!.id : '' },
    subscription_data: subData,
    ...discount,
    success_url: `${returnOrigin(request, env.SITE_URL)}/account?msg=featured`,
    cancel_url: `${returnOrigin(request, env.SITE_URL)}/featured/${l.slug}?msg=cancelled`,
  });
  return redirect(session.url!, 303);
};
