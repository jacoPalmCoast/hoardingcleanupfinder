// Native cancel / resume for the advertiser's featured subscription. Cancel sets
// cancel_at_period_end so they keep what they've paid for (featured until the period ends);
// resume clears it. Card changes still go through the Stripe billing portal. The webhook syncs
// cancel_at_period_end back into the listing, but we also write it here for an instant UI update.
import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect } from '../../../lib/util';
import { currentOwner, ownerOwns } from '../../../lib/services';
import { stripe, stripeConfigured } from '../../../lib/stripe';
import { audit } from '../../../lib/audit';

export const POST: APIRoute = async ({ request }) => {
  const owner = await currentOwner(request);
  if (!owner) return redirect('/account', 302);
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  const action = clean(form.get('action'), 10); // 'cancel' | 'resume'
  if (!Number.isInteger(id) || !(await ownerOwns(owner.id, id))) return new Response('Forbidden', { status: 403 });
  if (!stripeConfigured()) return redirect(`/account/billing/${id}`);

  const row = await env.DB.prepare(`SELECT stripe_subscription_id AS sub FROM listings WHERE id = ?1`).bind(id).first<{ sub: string | null }>();
  if (!row?.sub) return redirect(`/account/billing/${id}`);

  const cancel = action !== 'resume';
  try {
    await stripe().subscriptions.update(row.sub, { cancel_at_period_end: cancel });
  } catch {
    return redirect(`/account/billing/${id}?msg=error`);
  }
  await env.DB.prepare(`UPDATE listings SET cancel_at_period_end = ?2, updated_at = unixepoch() WHERE id = ?1`).bind(id, cancel ? 1 : 0).run();
  await audit('owner', owner.email, id, cancel ? 'billing.cancel' : 'billing.resume');
  return redirect(`/account/billing/${id}?msg=${cancel ? 'canceled' : 'resumed'}`);
};
