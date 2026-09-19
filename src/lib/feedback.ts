import { env } from './env';
import { now } from './util';

export type FeedbackType = 'bug' | 'idea' | 'other';
export const FEEDBACK_STATUSES = ['new', 'triaged', 'planned', 'shipped', 'declined'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];
export const isFeedbackType = (s: string): s is FeedbackType => s === 'bug' || s === 'idea' || s === 'other';
export const isFeedbackStatus = (s: string): s is FeedbackStatus => (FEEDBACK_STATUSES as readonly string[]).includes(s);

const STOP = new Set(
  'the a an and or but to of for on in at is are be it this that with your you my our we can could should would need want when where how what why not no yes page site button link click off broken does dont doesnt please like there their them then than into from have has had was were will just also more most some very much many able using used use make made get got'.split(' '),
);
// A normalized signature so near-duplicate reports group together and rank up by frequency.
export function clusterKey(message: string): string {
  const toks = message.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 4 && !STOP.has(w));
  const uniq = [...new Set(toks)].sort();
  return uniq.slice(0, 6).join('-') || message.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'misc';
}

export async function addFeedback(f: { type: FeedbackType; message: string; email?: string | null; pageUrl?: string | null; session?: string | null }): Promise<number | null> {
  const t = now();
  const res = await env.DB.prepare(
    `INSERT INTO feedback(type, message, email, page_url, cluster_key, session, created_at, updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?7)`,
  ).bind(f.type, f.message, f.email ?? null, f.pageUrl ?? null, clusterKey(f.message), f.session ?? null, t).run();
  return Number(res.meta.last_row_id) || null;
}

export interface FeedbackRow {
  id: number; type: string; message: string; email: string | null; page_url: string | null;
  status: string; priority: number | null; cluster_key: string | null; admin_notes: string | null;
  created_at: number; reporters: number; score: number;
}
const TYPE_WEIGHT: Record<string, number> = { bug: 300, idea: 200, other: 100 };
const scoreOf = (r: { type: string; reporters: number; priority: number | null }) =>
  (r.priority ?? 0) * 1000 + (TYPE_WEIGHT[r.type] ?? 100) + Math.max(0, r.reporters - 1) * 20;

// Newest data, ranked by score (manual priority dominates, then type, then how many reported it).
export async function listFeedback(status?: string, limit = 300): Promise<FeedbackRow[]> {
  const filtered = !!status && status !== 'all';
  const sql = `SELECT f.*, (SELECT COUNT(*) FROM feedback g WHERE g.cluster_key = f.cluster_key) AS reporters
     FROM feedback f ${filtered ? 'WHERE f.status = ?2' : ''} ORDER BY f.created_at DESC LIMIT ?1`;
  const stmt = filtered ? env.DB.prepare(sql).bind(limit, status) : env.DB.prepare(sql).bind(limit);
  const rows = (await stmt.all<Omit<FeedbackRow, 'score'>>()).results;
  return rows.map((r) => ({ ...r, score: scoreOf(r) })).sort((a, b) => b.score - a.score);
}

export async function feedbackCounts(): Promise<Record<string, number>> {
  const rows = (await env.DB.prepare(`SELECT status, COUNT(*) AS n FROM feedback GROUP BY status`).all<{ status: string; n: number }>()).results;
  const out: Record<string, number> = { new: 0, triaged: 0, planned: 0, shipped: 0, declined: 0, all: 0 };
  for (const r of rows) { out[r.status] = r.n; out.all += r.n; }
  return out;
}

export async function setFeedbackStatus(ids: number[], status: FeedbackStatus): Promise<void> {
  if (!ids.length) return;
  const ph = ids.map((_, i) => `?${i + 2}`).join(',');
  await env.DB.prepare(`UPDATE feedback SET status = ?1, updated_at = unixepoch() WHERE id IN (${ph})`).bind(status, ...ids).run();
}
export async function setFeedbackPriority(id: number, priority: number | null): Promise<void> {
  await env.DB.prepare(`UPDATE feedback SET priority = ?2, updated_at = unixepoch() WHERE id = ?1`).bind(id, priority).run();
}
export async function setFeedbackNote(id: number, note: string): Promise<void> {
  await env.DB.prepare(`UPDATE feedback SET admin_notes = ?2, updated_at = unixepoch() WHERE id = ?1`).bind(id, note || null).run();
}
export async function deleteFeedback(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const ph = ids.map((_, i) => `?${i + 1}`).join(',');
  await env.DB.prepare(`DELETE FROM feedback WHERE id IN (${ph})`).bind(...ids).run();
}

// Compile the open pipeline into a ranked Markdown brief to hand to a design/build run.
export async function buildRunMarkdown(): Promise<string> {
  const items = (await listFeedback('all', 500)).filter((f) => f.status !== 'shipped' && f.status !== 'declined');
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  // Collapse duplicates: one entry per cluster, carrying the highest-scored representative.
  const seen = new Set<string>();
  const uniq = items.filter((f) => { const k = f.cluster_key ?? String(f.id); if (seen.has(k)) return false; seen.add(k); return true; });
  const lines: string[] = [
    `# Build run — Hoarding Cleanup Finder`,
    ``, `Generated ${date} · ${uniq.length} item${uniq.length === 1 ? '' : 's'} from ${items.length} report${items.length === 1 ? '' : 's'} (duplicates collapsed).`,
    ``, `Ranked by priority, then type (bug > idea), then how many people reported it.`, ``, `---`, ``,
  ];
  uniq.forEach((f, i) => {
    const head = f.message.replace(/\s+/g, ' ').trim().slice(0, 90);
    lines.push(`## ${i + 1}. [${f.type}] ${head}${head.length >= 90 ? '…' : ''}`);
    lines.push(``);
    lines.push(`- **Status:** ${f.status}${f.priority ? ` · manual priority ${f.priority}` : ''} · **score ${f.score}** · **${f.reporters} report${f.reporters === 1 ? '' : 's'}**`);
    if (f.page_url) lines.push(`- **Seen on:** ${f.page_url}`);
    lines.push(``);
    lines.push(f.message.trim());
    if (f.admin_notes) lines.push(``, `> Note: ${f.admin_notes.trim()}`);
    lines.push(``);
  });
  if (!uniq.length) lines.push(`_No open feedback in the pipeline._`);
  return lines.join('\n');
}
