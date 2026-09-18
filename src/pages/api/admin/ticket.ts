import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect, escapeHtml } from '../../../lib/util';
import { sendEmail, emailShell } from '../../../lib/services';
import { getTicket, addTicketMessage, setTicketStatus, approveTicket, rejectTicket, deleteTicket, deleteTickets, setTicketsStatus } from '../../../lib/tickets';
import { addActivity } from '../../../lib/crm';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 20);

  // Bulk actions operate on a set of checked rows; redirect back to the tab the operator was on.
  if (action === 'bulk_delete' || action === 'bulk_close' || action === 'bulk_open') {
    const ids = form.getAll('ids').map((v) => Number(clean(v, 12))).filter((n) => Number.isInteger(n) && n > 0);
    const tab = clean(form.get('tab'), 10);
    const listUrl = `/admin/crm/tickets${tab ? `?status=${tab}` : ''}`;
    if (ids.length === 0) return redirect(listUrl);
    if (action === 'bulk_delete') await deleteTickets(ids);
    else await setTicketsStatus(ids, action === 'bulk_close' ? 'closed' : 'open');
    return redirect(listUrl);
  }

  const id = Number(clean(form.get('ticket_id'), 12));
  if (!Number.isInteger(id)) return redirect('/admin/crm/tickets');
  const back = `/admin/crm/ticket/${id}`;

  if (action === 'status') {
    const status = clean(form.get('status'), 10) === 'closed' ? 'closed' : 'open';
    await setTicketStatus(id, status);
    return redirect(back);
  }
  if (action === 'approve') {
    await approveTicket(id);
    return redirect(back);
  }
  if (action === 'reject') {
    // Deletes a held (pending) ticket + its attachments. rejectTicket only acts on 'pending'.
    const ok = await rejectTicket(id);
    return redirect(ok ? '/admin/crm/tickets?status=pending' : back);
  }
  if (action === 'delete') {
    // Delete a ticket outright (any status), from the ticket page.
    await deleteTicket(id);
    return redirect('/admin/crm/tickets');
  }
  if (action === 'reply') {
    const body = clean(form.get('body'), 4000);
    if (!body) return redirect(back);
    const t = await getTicket(id);
    if (!t) return redirect('/admin/crm/tickets');
    // Carry the thread token in the subject so the customer's reply lands back on this ticket.
    const tag = t.ticket.ref_token ? ` [HCF-${t.ticket.ref_token}]` : '';
    const ok = await sendEmail(t.ticket.from_email, `Re: ${t.ticket.subject}${tag}`, emailShell('Hoarding Cleanup Finder', `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`), { type: 'support_reply', listingId: t.ticket.listing_id ?? undefined });
    await addTicketMessage(id, 'out', body);
    if (t.ticket.listing_id) await addActivity(t.ticket.listing_id, 'email_out', `Support reply: ${body.slice(0, 200)}`);
    return redirect(`${back}?msg=${ok ? 'sent' : 'send-failed'}`);
  }
  return redirect(back);
};
