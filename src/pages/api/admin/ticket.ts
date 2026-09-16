import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect, escapeHtml } from '../../../lib/util';
import { sendEmail, emailShell } from '../../../lib/services';
import { getTicket, addTicketMessage, setTicketStatus } from '../../../lib/tickets';
import { addActivity } from '../../../lib/crm';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const id = Number(clean(form.get('ticket_id'), 12));
  const action = clean(form.get('action'), 20);
  if (!Number.isInteger(id)) return redirect('/admin/crm/tickets');
  const back = `/admin/crm/ticket/${id}`;

  if (action === 'status') {
    const status = clean(form.get('status'), 10) === 'closed' ? 'closed' : 'open';
    await setTicketStatus(id, status);
    return redirect(back);
  }
  if (action === 'reply') {
    const body = clean(form.get('body'), 4000);
    if (!body) return redirect(back);
    const t = await getTicket(id);
    if (!t) return redirect('/admin/crm/tickets');
    const ok = await sendEmail(t.ticket.from_email, `Re: ${t.ticket.subject}`, emailShell('Hoarding Cleanup Finder', `<p>${escapeHtml(body).replace(/\n/g, '<br>')}</p>`), { type: 'support_reply', listingId: t.ticket.listing_id ?? undefined });
    await addTicketMessage(id, 'out', body);
    if (t.ticket.listing_id) await addActivity(t.ticket.listing_id, 'email_out', `Support reply: ${body.slice(0, 200)}`);
    return redirect(`${back}?msg=${ok ? 'sent' : 'send-failed'}`);
  }
  return redirect(back);
};
