import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { env } from '../../../lib/env';
import { getSettings, setSetting } from '../../../lib/settings';
import { createRecurringPrice, archivePrice } from '../../../lib/stripeProducts';

// Manage the Featured product's Stripe prices from admin. Stripe prices are immutable, so changing
// a plan's amount creates a NEW price, points the site's setting at it, and archives the old one.
// Existing subscribers keep their current price until they change plans (standard Stripe behaviour).
export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  if (!env.STRIPE_SECRET_KEY) return redirect('/admin/pricing?msg=nostripe');

  const form = await request.formData();
  const action = clean(form.get('action'), 20);

  try {
    if (action === 'create_price') {
      const role = clean(form.get('role'), 8);                 // 'monthly' | 'annual'
      const intervalIn = clean(form.get('interval'), 6);       // 'month' | 'year'
      const interval = intervalIn === 'year' ? 'year' : 'month';
      const amountUsd = Number(clean(form.get('amount'), 12)) || 0;
      const intervalCount = Number(clean(form.get('interval_count'), 4)) || 1;
      if (amountUsd <= 0) return redirect('/admin/pricing?msg=error');

      const price = await createRecurringPrice({ amountUsd, interval, intervalCount });

      if (role === 'monthly' || role === 'annual') {
        const key = role === 'monthly' ? 'stripe_price_monthly' : 'stripe_price_annual';
        const displayKey = role === 'monthly' ? 'price_monthly_usd' : 'price_annual_usd';
        const prev = (await getSettings([key]))[key] || '';
        await setSetting(key, price.id);
        await setSetting(displayKey, String(Math.round(amountUsd)));
        // Archive the price this role used to point at, so the catalogue stays tidy.
        if (prev && prev !== price.id) { try { await archivePrice(prev); } catch { /* already gone */ } }
      }
      return redirect('/admin/pricing?msg=priced');
    }

    if (action === 'set_role') {
      const id = clean(form.get('id'), 60);
      const role = clean(form.get('role'), 8);
      if (!/^price_[A-Za-z0-9]+$/.test(id)) return redirect('/admin/pricing?msg=error');
      if (role === 'monthly') await setSetting('stripe_price_monthly', id);
      else if (role === 'annual') await setSetting('stripe_price_annual', id);
      else return redirect('/admin/pricing?msg=error');
      return redirect('/admin/pricing?msg=assigned');
    }

    if (action === 'archive_price') {
      const id = clean(form.get('id'), 60);
      const assigned = await getSettings(['stripe_price_monthly', 'stripe_price_annual']);
      if (id && (assigned.stripe_price_monthly === id || assigned.stripe_price_annual === id)) {
        // Refuse to archive the price the site is actively selling — reassign first.
        return redirect('/admin/pricing?msg=inuse');
      }
      if (/^price_[A-Za-z0-9]+$/.test(id)) await archivePrice(id);
      return redirect('/admin/pricing?msg=archived');
    }
  } catch (e) {
    console.error('stripe plans op failed', (e as Error)?.message);
    return redirect('/admin/pricing?msg=error');
  }
  return redirect('/admin/pricing');
};
