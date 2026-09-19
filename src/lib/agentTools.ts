// Tool registry for the admin agent. READ tools run during the reasoning loop and return compact,
// bounded data. ACTION tools are never executed by the model — they are surfaced to the admin as
// confirm cards and executed only by /api/admin/agent-act after a human click.
import { env } from './env';
import { adminCounts, siteOverview, searchListings, getListingById, listingStats, listingBreakdown, topSearches, unmetDemand, isLive } from './db';
import { listTickets, ticketCounts, setTicketsStatus } from './tickets';
import { listInvoices, openBalance } from './billing';
import { listFeedback, feedbackCounts, setFeedbackStatus, setFeedbackPriority, isFeedbackStatus } from './feedback';
import { audit } from './audit';

export interface ToolDef { name: string; kind: 'read' | 'action'; description: string; parameters: Record<string, unknown>; }

const listingBrief = (l: any) => ({ id: l.id, name: l.name, city: l.city, state: l.state, status: l.status, featured: isLive(l), claimed: l.is_claimed === 1, phone: l.phone, sub: l.subscription_status });

export const TOOLS: ToolDef[] = [
  { name: 'get_overview', kind: 'read', description: 'Top-line site health: counts of active/pending listings, featured, leads (30d), open support tickets, new feedback, claims to review, MRR and active subscriptions.', parameters: { type: 'object', properties: {} } },
  { name: 'search_listings', kind: 'read', description: 'Find listings by name, city, or owner email.', parameters: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'get_listing', kind: 'read', description: 'Full detail for one listing by id, including 30-day stats.', parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } },
  { name: 'list_leads', kind: 'read', description: 'Recent consumer quote requests (leads). Optional status filter.', parameters: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'list_tickets', kind: 'read', description: 'Recent support inbox tickets. Optional status: open|closed.', parameters: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } } },
  { name: 'get_analytics', kind: 'read', description: 'Analytics. With listing_id: that listing’s stats + source/device breakdown. Without: site-wide overview. days = 7|30|90.', parameters: { type: 'object', properties: { listing_id: { type: 'number' }, days: { type: 'number' } } } },
  { name: 'get_demand', kind: 'read', description: 'What visitors searched for, and searches that surfaced no featured seller (sales/recruit opportunities). days = 7|30|90.', parameters: { type: 'object', properties: { days: { type: 'number' } } } },
  { name: 'get_billing', kind: 'read', description: 'Billing. With listing_id: that listing’s subscription status, balance and recent invoices. Without: revenue summary.', parameters: { type: 'object', properties: { listing_id: { type: 'number' } } } },
  { name: 'list_feedback', kind: 'read', description: 'The visitor feedback pipeline (ideas + bug reports), ranked by score. Optional status filter.', parameters: { type: 'object', properties: { status: { type: 'string' }, limit: { type: 'number' } } } },
  // Actions — proposed only, applied after human confirm.
  { name: 'set_feedback_status', kind: 'action', description: 'Change a feedback item’s status (new|triaged|planned|shipped|declined).', parameters: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string' } }, required: ['id', 'status'] } },
  { name: 'set_feedback_priority', kind: 'action', description: 'Set a feedback item’s manual priority 0–9 (higher ranks higher).', parameters: { type: 'object', properties: { id: { type: 'number' }, priority: { type: 'number' } }, required: ['id', 'priority'] } },
  { name: 'set_ticket_status', kind: 'action', description: 'Open or close a support ticket.', parameters: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string' } }, required: ['id', 'status'] } },
  { name: 'set_lead_status', kind: 'action', description: 'Set a lead’s status (new|contacted|sold|closed|spam).', parameters: { type: 'object', properties: { id: { type: 'number' }, status: { type: 'string' } }, required: ['id', 'status'] } },
  { name: 'approve_listing', kind: 'action', description: 'Approve a pending listing (make it active/live).', parameters: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] } },
];

export const isActionTool = (name: string) => TOOLS.find((t) => t.name === name)?.kind === 'action';

// ---- READ executors -------------------------------------------------------
export async function runReadTool(name: string, input: any): Promise<unknown> {
  switch (name) {
    case 'get_overview': {
      const [c, ov, fc, tc] = await Promise.all([adminCounts(), siteOverview(30), feedbackCounts(), ticketCounts()]);
      return { listings_active: c.active, listings_pending: c.pending, featured: c.featured, leads_30d: c.leads_30d, claims_to_review: undefined, open_reports: c.open_reports, pending_reviews: c.pending_reviews, tickets_open: (tc as any).open ?? undefined, feedback_new: fc.new, visitors_30d: ov.totals?.unique_views, calls_30d: ov.totals?.calls, website_30d: ov.totals?.website };
    }
    case 'search_listings': {
      const rows = await searchListings(String(input?.query ?? ''), undefined, 15);
      return rows.map(listingBrief);
    }
    case 'get_listing': {
      const l = await getListingById(Number(input?.id));
      if (!l) return { error: 'not found' };
      const stats = await listingStats(l.id, 30).catch(() => null);
      return { ...listingBrief(l), website: l.website, email: l.email, address: l.address, plan: l.plan_interval, plan_amount: l.plan_amount, stats_30d: stats };
    }
    case 'list_leads': {
      const status = typeof input?.status === 'string' ? input.status : null;
      const limit = Math.max(1, Math.min(25, Number(input?.limit) || 15));
      const where = status ? 'WHERE status = ?2' : '';
      const stmt = status ? env.DB.prepare(`SELECT id, name, email, phone, city, state, service, status, created_at FROM leads ${where} ORDER BY created_at DESC LIMIT ?1`).bind(limit, status) : env.DB.prepare(`SELECT id, name, email, phone, city, state, service, status, created_at FROM leads ORDER BY created_at DESC LIMIT ?1`).bind(limit);
      return (await stmt.all<any>()).results;
    }
    case 'list_tickets': {
      const status = typeof input?.status === 'string' ? input.status : null;
      const rows = await listTickets(status);
      return rows.slice(0, Math.max(1, Math.min(25, Number(input?.limit) || 15))).map((t: any) => ({ id: t.id, subject: t.subject, from: t.from_email, status: t.status, created_at: t.created_at }));
    }
    case 'get_analytics': {
      const days = [7, 30, 90].includes(Number(input?.days)) ? Number(input.days) : 30;
      if (input?.listing_id) {
        const id = Number(input.listing_id);
        const [s, b] = await Promise.all([listingStats(id, days), listingBreakdown(id, days)]);
        return { listing_id: id, days, stats: s, sources: b.sources, devices: b.devices, countries: b.countries };
      }
      const ov = await siteOverview(days);
      return { days, totals: ov.totals, top_listings: (ov.topListings ?? []).slice(0, 8) };
    }
    case 'get_demand': {
      const days = [7, 30, 90].includes(Number(input?.days)) ? Number(input.days) : 30;
      const [top, unmet] = await Promise.all([topSearches(days, 20), unmetDemand(days, 20)]);
      return { days, top_searches: top, opportunities_no_featured_seller: unmet };
    }
    case 'get_billing': {
      if (input?.listing_id) {
        const id = Number(input.listing_id);
        const l = await getListingById(id);
        const [inv, bal] = await Promise.all([listInvoices(id, 12), openBalance(id)]);
        return { listing_id: id, subscription_status: l?.subscription_status, cancel_at_period_end: l?.cancel_at_period_end, plan_amount: l?.plan_amount, plan_interval: l?.plan_interval, balance_due_cents: bal, invoices: inv };
      }
      const row = await env.DB.prepare(`SELECT COUNT(*) AS subs, SUM(CASE WHEN plan_interval='year' THEN plan_amount/12.0 ELSE plan_amount END) AS mrr_cents FROM listings WHERE subscription_status IN ('active','trialing','past_due') AND plan_amount IS NOT NULL`).first<{ subs: number; mrr_cents: number }>();
      const pastDue = await env.DB.prepare(`SELECT COUNT(*) AS n FROM listings WHERE subscription_status = 'past_due'`).first<{ n: number }>();
      return { active_subscriptions: row?.subs ?? 0, mrr_cents: Math.round(row?.mrr_cents ?? 0), past_due: pastDue?.n ?? 0 };
    }
    case 'list_feedback': {
      const status = typeof input?.status === 'string' ? input.status : undefined;
      const rows = await listFeedback(status, Math.max(1, Math.min(40, Number(input?.limit) || 25)));
      return rows.map((f) => ({ id: f.id, type: f.type, status: f.status, score: f.score, reporters: f.reporters, priority: f.priority, message: f.message.slice(0, 400), page: f.page_url }));
    }
    default:
      return { error: `unknown tool ${name}` };
  }
}

// ---- ACTION executors (called by the confirm endpoint, not the model) ------
export interface ActionResult { ok: boolean; message: string }
export async function applyAction(name: string, input: any): Promise<ActionResult> {
  const id = Number(input?.id);
  switch (name) {
    case 'set_feedback_status': {
      if (!Number.isInteger(id) || !isFeedbackStatus(String(input?.status))) return { ok: false, message: 'Invalid input.' };
      await setFeedbackStatus([id], input.status);
      await audit('admin', 'agent', null, 'agent.feedback_status', null, { id, status: input.status });
      return { ok: true, message: `Feedback #${id} set to ${input.status}.` };
    }
    case 'set_feedback_priority': {
      const p = Math.max(0, Math.min(9, Number(input?.priority)));
      if (!Number.isInteger(id)) return { ok: false, message: 'Invalid id.' };
      await setFeedbackPriority(id, p);
      await audit('admin', 'agent', null, 'agent.feedback_priority', null, { id, priority: p });
      return { ok: true, message: `Feedback #${id} priority set to ${p}.` };
    }
    case 'set_ticket_status': {
      const st = String(input?.status) === 'closed' ? 'closed' : 'open';
      if (!Number.isInteger(id)) return { ok: false, message: 'Invalid id.' };
      await setTicketsStatus([id], st);
      await audit('admin', 'agent', null, 'agent.ticket_status', null, { id, status: st });
      return { ok: true, message: `Ticket #${id} ${st === 'closed' ? 'closed' : 'reopened'}.` };
    }
    case 'set_lead_status': {
      const st = String(input?.status);
      if (!Number.isInteger(id) || !['new', 'contacted', 'sold', 'closed', 'spam'].includes(st)) return { ok: false, message: 'Invalid input.' };
      await env.DB.prepare(`UPDATE leads SET status = ?2 WHERE id = ?1`).bind(id, st).run();
      await audit('admin', 'agent', null, 'agent.lead_status', null, { id, status: st });
      return { ok: true, message: `Lead #${id} set to ${st}.` };
    }
    case 'approve_listing': {
      const l = await getListingById(id);
      if (!l) return { ok: false, message: 'Listing not found.' };
      if (l.status === 'active') return { ok: true, message: `${l.name} is already active.` };
      await env.DB.prepare(`UPDATE listings SET status = 'active', updated_at = unixepoch() WHERE id = ?1`).bind(id).run();
      await env.DB.prepare(`INSERT OR IGNORE INTO cities(slug, name, state) VALUES (?1, ?2, ?3)`).bind(l.city_slug, l.city, l.state).run();
      await audit('admin', 'agent', id, 'agent.approve_listing', { status: l.status }, { status: 'active' });
      return { ok: true, message: `${l.name} is now active.` };
    }
    default:
      return { ok: false, message: `Unknown action ${name}.` };
  }
}

// A compact snapshot for the no-key fallback, so the agent can still answer common questions.
export async function agentSnapshot(): Promise<string> {
  const [ov, demand, fb] = await Promise.all([runReadTool('get_overview', {}), runReadTool('get_demand', { days: 30 }), runReadTool('list_feedback', { status: 'new', limit: 10 })]);
  return JSON.stringify({ overview: ov, demand_30d: demand, new_feedback: fb });
}
