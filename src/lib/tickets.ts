// Support inbox data layer. Tickets come from the public support form (source 'form') and from
// inbound customer email routed to the Worker (source 'email'). Known senders (matching a listing/
// owner email) auto-open; unknown email senders are held as 'pending' for review.
import { env } from './env';

async function matchListing(email: string): Promise<number | null> {
  const e = email.toLowerCase();
  const owner = await env.DB.prepare(
    `SELECT ol.listing_id AS id FROM owners o JOIN owner_listings ol ON ol.owner_id = o.id WHERE lower(o.email) = ?1 LIMIT 1`,
  ).bind(e).first<{ id: number }>();
  if (owner) return owner.id;
  const listing = await env.DB.prepare(`SELECT id FROM listings WHERE lower(email) = ?1 AND status != 'removed' LIMIT 1`).bind(e).first<{ id: number }>();
  return listing?.id ?? null;
}

// Short opaque token embedded in outbound reply subjects as [HCF-<token>] so a customer's reply
// threads back onto the same ticket. crypto RNG so it isn't guessable/enumerable.
export function genToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(5));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('').slice(0, 8);
}

export interface InAttachment { filename: string; contentType: string; bytes: ArrayBuffer | Uint8Array; size: number }

// Store inbound attachment bytes in the private R2 bucket + a metadata row. Key is app-generated
// (never derived from user input beyond a sanitized filename tail), so there is no traversal surface.
async function storeAttachments(ticketId: number, messageId: number, atts: InAttachment[]): Promise<void> {
  if (!env.ATTACH || atts.length === 0) return;
  for (const a of atts) {
    const safe = a.filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'file';
    const key = `tickets/${ticketId}/${messageId}/${genToken()}-${safe}`;
    try {
      await env.ATTACH.put(key, a.bytes, { httpMetadata: { contentType: a.contentType } });
      await env.DB.prepare(
        `INSERT INTO ticket_attachments(ticket_id, message_id, r2_key, filename, content_type, size) VALUES (?1,?2,?3,?4,?5,?6)`,
      ).bind(ticketId, messageId, key, a.filename.slice(0, 200), a.contentType, a.size).run();
    } catch { /* one bad attachment must not sink the whole ticket */ }
  }
}

// ---- Public support form ----
export async function createTicket(fromEmail: string, subject: string, body: string): Promise<number> {
  const listingId = await matchListing(fromEmail);
  const token = genToken();
  const row = await env.DB.prepare(
    `INSERT INTO tickets(listing_id, from_email, subject, source, ref_token) VALUES (?1, ?2, ?3, 'form', ?4) RETURNING id`,
  ).bind(listingId, fromEmail.toLowerCase(), subject, token).first<{ id: number }>();
  const id = row!.id;
  await env.DB.prepare(`INSERT INTO ticket_messages(ticket_id, direction, body) VALUES (?1, 'in', ?2)`).bind(id, body).run();
  return id;
}

// ---- Inbound email ----
export async function findTicketByToken(token: string): Promise<{ id: number } | null> {
  return (await env.DB.prepare(`SELECT id FROM tickets WHERE ref_token = ?1 LIMIT 1`).bind(token).first<{ id: number }>()) ?? null;
}

// True if an inbound email with this Message-ID was already ingested (idempotency for re-delivery).
export async function inboundSeen(msgId: string): Promise<boolean> {
  const r = await env.DB.prepare(`SELECT 1 AS ok FROM ticket_messages WHERE email_msgid = ?1 LIMIT 1`).bind(msgId).first();
  return !!r;
}

// First inbound email from a sender → a new ticket. Known sender ⇒ 'open'; unknown ⇒ 'pending'.
export async function createTicketFromEmail(fromEmail: string, subject: string, body: string, msgId: string | null, atts: InAttachment[]): Promise<{ id: number; status: string }> {
  const listingId = await matchListing(fromEmail);
  const status = listingId ? 'open' : 'pending';
  const token = genToken();
  const row = await env.DB.prepare(
    `INSERT INTO tickets(listing_id, from_email, subject, status, source, ref_token) VALUES (?1,?2,?3,?4,'email',?5) RETURNING id`,
  ).bind(listingId, fromEmail.toLowerCase(), subject, status, token).first<{ id: number }>();
  const id = row!.id;
  const m = await env.DB.prepare(`INSERT INTO ticket_messages(ticket_id, direction, body, email_msgid) VALUES (?1,'in',?2,?3) RETURNING id`).bind(id, body, msgId).first<{ id: number }>();
  await storeAttachments(id, m!.id, atts);
  return { id, status };
}

// A reply onto an existing thread (matched by [HCF-token]). Reopens a closed ticket; a pending
// ticket stays pending (still awaiting review) so an unknown sender can't self-approve by replying.
export async function appendInboundMessage(ticketId: number, body: string, msgId: string | null, atts: InAttachment[]): Promise<void> {
  const m = await env.DB.prepare(`INSERT INTO ticket_messages(ticket_id, direction, body, email_msgid) VALUES (?1,'in',?2,?3) RETURNING id`).bind(ticketId, body, msgId).first<{ id: number }>();
  await storeAttachments(ticketId, m!.id, atts);
  await env.DB.prepare(`UPDATE tickets SET updated_at = unixepoch(), status = CASE WHEN status='closed' THEN 'open' ELSE status END WHERE id = ?1`).bind(ticketId).run();
}

// ---- Reads ----
export interface TicketRow { id: number; listing_id: number | null; from_email: string; subject: string; status: string; source?: string; created_at: number; updated_at: number; company: string | null; msgs: number }
export async function listTickets(status: string | null): Promise<TicketRow[]> {
  return (await env.DB.prepare(
    `SELECT t.id, t.listing_id, t.from_email, t.subject, t.status, t.source, t.created_at, t.updated_at, l.name AS company,
        (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS msgs
     FROM tickets t LEFT JOIN listings l ON l.id = t.listing_id
     ` + (status ? `WHERE t.status = ?1` : '') + `
     ORDER BY t.updated_at DESC LIMIT 300`,
  ).bind(...(status ? [status] : [])).all<TicketRow>()).results;
}

export async function pendingTicketCount(): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status = 'pending'`).first<{ n: number }>();
  return r?.n ?? 0;
}

export interface TicketMsg { id: number; direction: string; body: string; created_at: number }
export interface AttachmentRow { id: number; message_id: number | null; filename: string; content_type: string; size: number }
export async function getTicket(id: number): Promise<{ ticket: TicketRow & { ref_token: string | null }; messages: TicketMsg[]; attachments: AttachmentRow[]; slug: string | null } | null> {
  const ticket = await env.DB.prepare(
    `SELECT t.id, t.listing_id, t.from_email, t.subject, t.status, t.source, t.ref_token, t.updated_at, l.name AS company, l.slug AS slug, 0 AS msgs
     FROM tickets t LEFT JOIN listings l ON l.id = t.listing_id WHERE t.id = ?1`,
  ).bind(id).first<TicketRow & { ref_token: string | null; slug: string | null }>();
  if (!ticket) return null;
  const [messages, attachments] = await Promise.all([
    env.DB.prepare(`SELECT id, direction, body, created_at FROM ticket_messages WHERE ticket_id = ?1 ORDER BY created_at ASC`).bind(id).all<TicketMsg>(),
    env.DB.prepare(`SELECT id, message_id, filename, content_type, size FROM ticket_attachments WHERE ticket_id = ?1 ORDER BY id ASC`).bind(id).all<AttachmentRow>(),
  ]);
  return { ticket, messages: messages.results, attachments: attachments.results, slug: ticket.slug };
}

export async function addTicketMessage(ticketId: number, direction: 'in' | 'out', body: string): Promise<void> {
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO ticket_messages(ticket_id, direction, body) VALUES (?1, ?2, ?3)`).bind(ticketId, direction, body),
    env.DB.prepare(`UPDATE tickets SET updated_at = unixepoch(), status = CASE WHEN ?2 = 'in' THEN 'open' ELSE status END WHERE id = ?1`).bind(ticketId, direction),
  ]);
}

export async function setTicketStatus(id: number, status: 'open' | 'closed'): Promise<void> {
  await env.DB.prepare(`UPDATE tickets SET status = ?2, updated_at = unixepoch() WHERE id = ?1`).bind(id, status).run();
}

// Approve a held (pending) ticket into the open queue.
export async function approveTicket(id: number): Promise<void> {
  await env.DB.prepare(`UPDATE tickets SET status = 'open', updated_at = unixepoch() WHERE id = ?1 AND status = 'pending'`).bind(id).run();
}

// Permanently delete tickets, their messages, and their R2 attachment objects. Shared by the
// reject/delete paths. Returns how many ticket rows were removed.
async function purgeTickets(ids: number[]): Promise<number> {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (clean.length === 0) return 0;
  const ph = clean.map((_, i) => `?${i + 1}`).join(',');
  const keys = (await env.DB.prepare(`SELECT r2_key FROM ticket_attachments WHERE ticket_id IN (${ph})`).bind(...clean).all<{ r2_key: string }>()).results;
  if (env.ATTACH) for (const k of keys) { try { await env.ATTACH.delete(k.r2_key); } catch { /* best effort */ } }
  const res = await env.DB.batch([
    env.DB.prepare(`DELETE FROM ticket_attachments WHERE ticket_id IN (${ph})`).bind(...clean),
    env.DB.prepare(`DELETE FROM ticket_messages WHERE ticket_id IN (${ph})`).bind(...clean),
    env.DB.prepare(`DELETE FROM tickets WHERE id IN (${ph})`).bind(...clean),
  ]);
  return res[2]?.meta?.changes ?? 0;
}

// Reject a held ticket: only acts on 'pending' tickets so a real (open/closed) conversation can
// never be nuked by this path.
export async function rejectTicket(id: number): Promise<boolean> {
  const t = await env.DB.prepare(`SELECT status FROM tickets WHERE id = ?1`).bind(id).first<{ status: string }>();
  if (!t || t.status !== 'pending') return false;
  await purgeTickets([id]);
  return true;
}

// Delete a ticket regardless of status (operator action from the inbox / ticket page).
export async function deleteTicket(id: number): Promise<boolean> {
  return (await purgeTickets([id])) > 0;
}

// Bulk delete. Returns the number of tickets removed.
export async function deleteTickets(ids: number[]): Promise<number> {
  return purgeTickets(ids);
}

// Set status on many tickets at once (bulk close / reopen).
export async function setTicketsStatus(ids: number[], status: 'open' | 'closed'): Promise<number> {
  const clean = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))];
  if (clean.length === 0) return 0;
  const ph = clean.map((_, i) => `?${i + 2}`).join(',');
  const res = await env.DB.prepare(`UPDATE tickets SET status = ?1, updated_at = unixepoch() WHERE id IN (${ph})`).bind(status, ...clean).run();
  return res.meta?.changes ?? 0;
}

// Ticket counts per status, for the inbox tab badges.
export interface TicketCounts { open: number; pending: number; closed: number; all: number }
export async function ticketCounts(): Promise<TicketCounts> {
  const rows = (await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM tickets GROUP BY status`).all<{ status: string; n: number }>()).results;
  const by: Record<string, number> = {};
  for (const r of rows) by[r.status] = r.n;
  const open = by.open ?? 0, pending = by.pending ?? 0, closed = by.closed ?? 0;
  return { open, pending, closed, all: open + pending + closed + Object.entries(by).filter(([k]) => !['open', 'pending', 'closed'].includes(k)).reduce((a, [, v]) => a + v, 0) };
}

export async function getAttachment(id: number): Promise<AttachmentRow & { r2_key: string } | null> {
  return (await env.DB.prepare(`SELECT id, message_id, r2_key, filename, content_type, size FROM ticket_attachments WHERE id = ?1`).bind(id).first<AttachmentRow & { r2_key: string }>()) ?? null;
}

export async function openTicketCount(): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'`).first<{ n: number }>();
  return r?.n ?? 0;
}
