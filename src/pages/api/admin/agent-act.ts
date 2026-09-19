// Executes ONE agent-proposed action, after the admin clicked Confirm. Admin-gated; only whitelisted
// action tools run here (never a read tool, never arbitrary SQL). This is the sole execution path —
// the model can propose, but nothing changes without this authenticated, human-triggered call.
import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { applyAction, isActionTool } from '../../../lib/agentTools';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } });

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, message: 'bad json' }, 400); }
  const tool = String(body?.tool ?? '');
  if (!isActionTool(tool)) return json({ ok: false, message: 'Not an allowed action.' }, 400);
  const input = body?.input && typeof body.input === 'object' ? body.input : {};
  try {
    const result = await applyAction(tool, input);
    return json(result);
  } catch (e) {
    return json({ ok: false, message: 'That action failed: ' + String(e) }, 200);
  }
};
