// Support inbox data layer.
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

export async function createTicket(fromEmail: string, subject: string, body: string): Promise<number> {
  const listingId = await matchListing(fromEmail);
  const row = await env.DB.prepare(
    `INSERT INTO tickets(listing_id, from_email, subject) VALUES (?1, ?2, ?3) RETURNING id`,
  ).bind(listingId, fromEmail.toLowerCase(), subject).first<{ id: number }>();
  const id = row!.id;
  await env.DB.prepare(`INSERT INTO ticket_messages(ticket_id, direction, body) VALUES (?1, 'in', ?2)`).bind(id, body).run();
  return id;
}

export interface TicketRow { id: number; listing_id: number | null; from_email: string; subject: string; status: string; updated_at: number; company: string | null; msgs: number }
export async function listTickets(status: string | null): Promise<TicketRow[]> {
  return (await env.DB.prepare(
    `SELECT t.id, t.listing_id, t.from_email, t.subject, t.status, t.updated_at, l.name AS company,
        (SELECT COUNT(*) FROM ticket_messages m WHERE m.ticket_id = t.id) AS msgs
     FROM tickets t LEFT JOIN listings l ON l.id = t.listing_id
     ` + (status ? `WHERE t.status = ?1` : '') + `
     ORDER BY t.updated_at DESC LIMIT 300`,
  ).bind(...(status ? [status] : [])).all<TicketRow>()).results;
}

export interface TicketMsg { direction: string; body: string; created_at: number }
export async function getTicket(id: number): Promise<{ ticket: TicketRow; messages: TicketMsg[]; slug: string | null } | null> {
  const ticket = await env.DB.prepare(
    `SELECT t.id, t.listing_id, t.from_email, t.subject, t.status, t.updated_at, l.name AS company, l.slug AS slug, 0 AS msgs
     FROM tickets t LEFT JOIN listings l ON l.id = t.listing_id WHERE t.id = ?1`,
  ).bind(id).first<TicketRow & { slug: string | null }>();
  if (!ticket) return null;
  const messages = (await env.DB.prepare(`SELECT direction, body, created_at FROM ticket_messages WHERE ticket_id = ?1 ORDER BY created_at ASC`).bind(id).all<TicketMsg>()).results;
  return { ticket, messages, slug: ticket.slug };
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

export async function openTicketCount(): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM tickets WHERE status = 'open'`).first<{ n: number }>();
  return r?.n ?? 0;
}
