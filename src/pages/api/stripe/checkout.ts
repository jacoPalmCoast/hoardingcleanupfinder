import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect } from '../../../lib/util';
import { currentOwner, ownerOwns } from '../../../lib/services';
import { getListingById, isLive } from '../../../lib/db';
import { stripe, stripeConfigured } from '../../../lib/stripe';

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
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    line_items: [{ price: plan === 'annual' ? env.STRIPE_PRICE_ANNUAL! : env.STRIPE_PRICE_MONTHLY!, quantity: 1 }],
    client_reference_id: String(l.id),
    metadata: { listing_id: String(l.id), plan },
    subscription_data: { metadata: { listing_id: String(l.id) } },
    allow_promotion_codes: true,
    success_url: `${env.SITE_URL}/account?msg=featured`,
    cancel_url: `${env.SITE_URL}/featured/${l.slug}?msg=cancelled`,
  });
  return redirect(session.url!, 303);
};
