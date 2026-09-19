// Admin agent: takes the conversation, returns the assistant's answer + any proposed actions.
// Admin-gated by middleware and requireAdmin. Actions are NOT executed here — see agent-act.ts.
import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { runAgent, type ChatMessage } from '../../../lib/agent';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: any;
  try { body = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  const raw = Array.isArray(body?.messages) ? body.messages : [];
  // Keep it bounded: last 12 turns, roles normalized, content trimmed.
  const history: ChatMessage[] = raw.slice(-12)
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  if (!history.length || history[history.length - 1].role !== 'user') return json({ error: 'no question' }, 400);
  try {
    const result = await runAgent(history);
    return json(result);
  } catch (e) {
    return json({ answer: 'The assistant hit an error reaching its model. Try again in a moment.', actions: [], error: String(e) }, 200);
  }
};
