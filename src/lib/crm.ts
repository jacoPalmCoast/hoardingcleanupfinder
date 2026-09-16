// CRM data layer. Companies are the directory listings; this adds pipeline stage, a merged
// interaction timeline (derived from existing tables + manual activities), contacts, and tasks.
import { env } from './env';
import { now } from './util';

export type Stage = 'prospect' | 'contacted' | 'claimed' | 'featured' | 'lapsed';
export const STAGES: Stage[] = ['prospect', 'contacted', 'claimed', 'featured', 'lapsed'];
export const STAGE_LABEL: Record<Stage, string> = {
  prospect: 'Prospect', contacted: 'Contacted', claimed: 'Claimed (free)', featured: 'Featured (paying)', lapsed: 'Lapsed',
};

// SQL fragment: the effective stage = manual override, else derived from listing state.
// `t` is bound as the current unix time.
const STAGE_SQL = `COALESCE(cr.stage, CASE
  WHEN l.is_featured = 1 AND (l.featured_until IS NULL OR l.featured_until > ?t) THEN 'featured'
  WHEN l.subscription_status = 'canceled' OR (l.stripe_customer_id IS NOT NULL AND l.featured_until IS NOT NULL AND l.featured_until <= ?t) THEN 'lapsed'
  WHEN l.is_claimed = 1 THEN 'claimed'
  ELSE 'prospect' END)`;

export async function pipelineCounts(): Promise<Record<string, number>> {
  const t = now();
  const rows = (await env.DB.prepare(
    `SELECT stage, COUNT(*) AS n FROM (
       SELECT ${STAGE_SQL.replace(/\?t/g, '?1')} AS stage
       FROM listings l LEFT JOIN crm_records cr ON cr.listing_id = l.id
       WHERE l.status = 'active'
     ) GROUP BY stage`,
  ).bind(t).all<{ stage: string; n: number }>()).results;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.stage] = r.n;
  return out;
}

export interface PipeRow {
  id: number; name: string; city: string; state: string; slug: string; email: string | null;
  stage: string; is_claimed: number; subscription_status: string | null;
  next_follow_up: number | null; last_activity: number | null;
}
export async function pipelineList(stage: string | null, q: string, limit = 100, offset = 0): Promise<PipeRow[]> {
  const t = now();
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const rows = (await env.DB.prepare(
    `SELECT l.id, l.name, l.city, l.state, l.slug, l.email, l.is_claimed, l.subscription_status,
        ${STAGE_SQL.replace(/\?t/g, '?1')} AS stage,
        cr.next_follow_up AS next_follow_up,
        (SELECT MAX(created_at) FROM activities a WHERE a.listing_id = l.id) AS last_activity
     FROM listings l LEFT JOIN crm_records cr ON cr.listing_id = l.id
     WHERE l.status = 'active'
       AND (?2 = '' OR l.name LIKE ?2 OR l.city LIKE ?2)
     ` + (stage ? ` AND ${STAGE_SQL.replace(/\?t/g, '?1')} = ?3` : '') + `
     ORDER BY (cr.next_follow_up IS NULL), cr.next_follow_up ASC, last_activity DESC NULLS LAST, l.name
     LIMIT ?${stage ? 4 : 3} OFFSET ?${stage ? 5 : 4}`,
  ).bind(...(stage ? [t, q ? like : '', stage, limit, offset] : [t, q ? like : '', limit, offset])).all<PipeRow>()).results;
  return rows;
}

export interface Contact { email: string; role: string }
export async function companyContacts(listingId: number, listingEmail: string | null): Promise<Contact[]> {
  const owners = (await env.DB.prepare(
    `SELECT o.email FROM owner_listings ol JOIN owners o ON o.id = ol.owner_id WHERE ol.listing_id = ?1`,
  ).bind(listingId).all<{ email: string }>()).results;
  const seen = new Set<string>();
  const out: Contact[] = [];
  for (const o of owners) { const e = o.email.toLowerCase(); if (!seen.has(e)) { seen.add(e); out.push({ email: o.email, role: 'Owner (claimed)' }); } }
  if (listingEmail && !seen.has(listingEmail.toLowerCase())) out.push({ email: listingEmail, role: 'Listed contact' });
  return out;
}

export interface TimelineItem { ts: number; kind: string; title: string; detail?: string; activityId?: number; due_at?: number | null; done?: number }
export async function companyTimeline(listingId: number, limit = 80): Promise<TimelineItem[]> {
  const [acts, leads, emails, claims, reviews, tickets] = await env.DB.batch([
    env.DB.prepare(`SELECT id, kind, body, due_at, done, meta, created_at FROM activities WHERE listing_id = ?1 ORDER BY created_at DESC LIMIT 100`).bind(listingId),
    env.DB.prepare(`SELECT name, service, message, created_at FROM leads WHERE listing_id = ?1 ORDER BY created_at DESC LIMIT 40`).bind(listingId),
    env.DB.prepare(`SELECT type, status, subject, created_at, opened_at, bounced_at FROM emails WHERE listing_id = ?1 ORDER BY created_at DESC LIMIT 40`).bind(listingId),
    env.DB.prepare(`SELECT email, status, created_at, verified_at FROM claims WHERE listing_id = ?1 ORDER BY created_at DESC LIMIT 20`).bind(listingId),
    env.DB.prepare(`SELECT author, rating, status, created_at FROM reviews WHERE listing_id = ?1 ORDER BY created_at DESC LIMIT 20`).bind(listingId),
    env.DB.prepare(`SELECT id, subject, status, created_at FROM tickets WHERE listing_id = ?1 ORDER BY created_at DESC LIMIT 20`).bind(listingId),
  ]);
  const items: TimelineItem[] = [];
  for (const a of acts.results as { id: number; kind: string; body: string; due_at: number | null; done: number; meta: string | null; created_at: number }[]) {
    const title = a.kind === 'note' ? 'Note' : a.kind === 'call' ? 'Logged call' : a.kind === 'task' ? (a.done ? 'Task (done)' : 'Task') : a.kind === 'stage_change' ? 'Stage change' : a.kind === 'email_out' ? 'Email sent' : a.kind;
    items.push({ ts: a.created_at, kind: a.kind, title, detail: a.body ?? undefined, activityId: a.id, due_at: a.due_at, done: a.done });
  }
  for (const l of leads.results as { name: string; service: string | null; message: string | null; created_at: number }[])
    items.push({ ts: l.created_at, kind: 'lead', title: 'Lead received', detail: `${l.name}${l.service ? ' · ' + l.service : ''}${l.message ? ' — ' + l.message.slice(0, 120) : ''}` });
  for (const e of emails.results as { type: string | null; status: string; subject: string | null; created_at: number; opened_at: number | null; bounced_at: number | null }[])
    items.push({ ts: e.created_at, kind: 'email', title: `Email: ${e.type ?? 'message'}`, detail: `${e.subject ?? ''}${e.bounced_at ? ' · bounced' : e.opened_at ? ' · opened' : ' · ' + e.status}` });
  for (const c of claims.results as { email: string; status: string; created_at: number; verified_at: number | null }[])
    items.push({ ts: c.created_at, kind: 'claim', title: `Claim ${c.status}`, detail: c.email });
  for (const r of reviews.results as { author: string; rating: number; status: string; created_at: number }[])
    items.push({ ts: r.created_at, kind: 'review', title: `Review (${r.rating}★, ${r.status})`, detail: r.author });
  for (const tk of tickets.results as { id: number; subject: string; status: string; created_at: number }[])
    items.push({ ts: tk.created_at, kind: 'ticket', title: `Support ticket (${tk.status})`, detail: tk.subject });
  items.sort((a, b) => b.ts - a.ts);
  return items.slice(0, limit);
}

export interface TaskRow { id: number; listing_id: number; name: string; slug: string; body: string | null; due_at: number | null; created_at: number }
export async function openTasks(limit = 200): Promise<TaskRow[]> {
  return (await env.DB.prepare(
    `SELECT a.id, a.listing_id, l.name, l.slug, a.body, a.due_at, a.created_at
     FROM activities a JOIN listings l ON l.id = a.listing_id
     WHERE a.kind = 'task' AND a.done = 0
     ORDER BY (a.due_at IS NULL), a.due_at ASC, a.created_at ASC LIMIT ?1`,
  ).bind(limit).all<TaskRow>()).results;
}

// ---- mutations ----
export async function addActivity(listingId: number, kind: string, body: string, dueAt?: number, meta?: string): Promise<void> {
  await env.DB.prepare(`INSERT INTO activities(listing_id, kind, body, due_at, meta) VALUES (?1,?2,?3,?4,?5)`)
    .bind(listingId, kind, body || null, dueAt ?? null, meta ?? null).run();
  if (kind === 'task') await refreshNextFollowUp(listingId);
}
export async function completeTask(id: number): Promise<void> {
  const row = await env.DB.prepare(`SELECT listing_id FROM activities WHERE id = ?1`).bind(id).first<{ listing_id: number }>();
  await env.DB.prepare(`UPDATE activities SET done = 1 WHERE id = ?1 AND kind = 'task'`).bind(id).run();
  if (row) await refreshNextFollowUp(row.listing_id);
}
export async function setStage(listingId: number, stage: Stage | ''): Promise<void> {
  const value = STAGES.includes(stage as Stage) ? stage : null; // '' clears the override → back to derived
  await env.DB.prepare(
    `INSERT INTO crm_records(listing_id, stage, updated_at) VALUES (?1, ?2, unixepoch())
     ON CONFLICT(listing_id) DO UPDATE SET stage = ?2, updated_at = unixepoch()`,
  ).bind(listingId, value).run();
}
async function refreshNextFollowUp(listingId: number): Promise<void> {
  const r = await env.DB.prepare(`SELECT MIN(due_at) AS d FROM activities WHERE listing_id = ?1 AND kind = 'task' AND done = 0 AND due_at IS NOT NULL`).bind(listingId).first<{ d: number | null }>();
  await env.DB.prepare(
    `INSERT INTO crm_records(listing_id, next_follow_up, updated_at) VALUES (?1, ?2, unixepoch())
     ON CONFLICT(listing_id) DO UPDATE SET next_follow_up = ?2, updated_at = unixepoch()`,
  ).bind(listingId, r?.d ?? null).run();
}
