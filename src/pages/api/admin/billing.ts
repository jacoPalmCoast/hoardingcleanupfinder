// Admin billing actions. Currently: sync invoice history from Stripe for one listing's customer,
// so the local invoices table (which otherwise fills from webhooks going forward) has full history.
import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
import { stripe, stripeConfigured } from '../../../lib/stripe';
import { upsertInvoice } from '../../../lib/billing';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  const action = clean(form.get('action'), 12);
  if (!Number.isInteger(id)) return redirect('/admin/billing');

  if (action === 'sync') {
    if (!stripeConfigured()) return redirect(`/admin/billing?id=${id}&msg=sync-error`);
    const row = await env.DB.prepare(`SELECT stripe_customer_id AS c FROM listings WHERE id = ?1`).bind(id).first<{ c: string | null }>();
    if (!row?.c) return redirect(`/admin/billing?id=${id}&msg=sync-error`);
    try {
      const list = await stripe().invoices.list({ customer: row.c, limit: 100 });
      for (const inv of list.data) await upsertInvoice(inv, id);
    } catch {
      return redirect(`/admin/billing?id=${id}&msg=sync-error`);
    }
    return redirect(`/admin/billing?id=${id}&msg=synced`);
  }
  return redirect(`/admin/billing?id=${id}`);
};
