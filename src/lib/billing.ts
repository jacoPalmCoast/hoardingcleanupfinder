import type Stripe from 'stripe';
import { env } from './env';
import { now } from './util';

// Local reflection of Stripe invoices. Stripe stays the source of truth; we mirror what we need to
// show billing history + balance on the advertiser account and in admin, without a live API call
// on every page view.
export interface InvoiceRow {
  id: string;
  listing_id: number | null;
  customer_id: string | null;
  subscription_id: string | null;
  number: string | null;
  status: string | null;
  amount_due: number | null;
  amount_paid: number | null;
  currency: string | null;
  hosted_invoice_url: string | null;
  invoice_pdf: string | null;
  period_start: number | null;
  period_end: number | null;
  created: number | null;
}

// Pull the fields we store off a Stripe invoice object (works for both webhook payloads and
// invoices.list results). Stripe's types drift across API versions, so read defensively.
export function invoiceFields(inv: Stripe.Invoice): Omit<InvoiceRow, 'listing_id'> {
  const anyInv = inv as any;
  const subId = anyInv.subscription ?? anyInv.parent?.subscription_details?.subscription ?? null;
  const line = inv.lines?.data?.[0] as any;
  const period = line?.period ?? {};
  return {
    id: inv.id!,
    customer_id: (typeof inv.customer === 'string' ? inv.customer : inv.customer?.id) ?? null,
    subscription_id: subId ? String(subId) : null,
    number: inv.number ?? null,
    status: inv.status ?? null,
    amount_due: typeof inv.amount_due === 'number' ? inv.amount_due : null,
    amount_paid: typeof inv.amount_paid === 'number' ? inv.amount_paid : null,
    currency: inv.currency ?? null,
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
    invoice_pdf: inv.invoice_pdf ?? null,
    period_start: typeof period.start === 'number' ? period.start : (inv.period_start ?? null),
    period_end: typeof period.end === 'number' ? period.end : (inv.period_end ?? null),
    created: typeof inv.created === 'number' ? inv.created : null,
  };
}

export async function upsertInvoice(inv: Stripe.Invoice, listingId: number | null): Promise<void> {
  const f = invoiceFields(inv);
  if (!f.id) return;
  await env.DB.prepare(
    `INSERT INTO invoices (id, listing_id, customer_id, subscription_id, number, status, amount_due, amount_paid, currency, hosted_invoice_url, invoice_pdf, period_start, period_end, created, synced_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15)
     ON CONFLICT(id) DO UPDATE SET
       listing_id=COALESCE(?2, listing_id), customer_id=?3, subscription_id=?4, number=?5, status=?6,
       amount_due=?7, amount_paid=?8, currency=?9, hosted_invoice_url=?10, invoice_pdf=?11,
       period_start=?12, period_end=?13, created=?14, synced_at=?15`,
  ).bind(
    f.id, listingId, f.customer_id, f.subscription_id, f.number, f.status, f.amount_due, f.amount_paid,
    f.currency, f.hosted_invoice_url, f.invoice_pdf, f.period_start, f.period_end, f.created, now(),
  ).run();
}

export async function listInvoices(listingId: number, limit = 24): Promise<InvoiceRow[]> {
  const r = await env.DB.prepare(
    `SELECT id, listing_id, customer_id, subscription_id, number, status, amount_due, amount_paid,
            currency, hosted_invoice_url, invoice_pdf, period_start, period_end, created
     FROM invoices WHERE listing_id = ?1 ORDER BY created DESC, synced_at DESC LIMIT ?2`,
  ).bind(listingId, limit).all<InvoiceRow>();
  return r.results;
}

// Outstanding balance = amount still due on open/uncollectible invoices (cents).
export async function openBalance(listingId: number): Promise<number> {
  const r = await env.DB.prepare(
    `SELECT COALESCE(SUM(amount_due), 0) AS due FROM invoices WHERE listing_id = ?1 AND status IN ('open','uncollectible')`,
  ).bind(listingId).first<{ due: number }>();
  return r?.due ?? 0;
}

export function money(cents: number | null | undefined, currency = 'usd'): string {
  const n = (cents ?? 0) / 100;
  const sym = currency.toLowerCase() === 'usd' ? '$' : '';
  return sym + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
