import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { env } from '../../../lib/env';
import { getListingById } from '../../../lib/db';
import { runBatch, hunterEnrich, hunterVerify, promoteBest, hostOfUrl, inferAllNames, aiEnrichBatch, aiEnabled } from '../../../lib/enrich';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 20);
  const back = clean(form.get('back'), 120) || '/admin/crm/enrichment';

  if (action === 'run_batch') {
    const n = Math.min(Math.max(Number(clean(form.get('n'), 4)) || 12, 1), 40);
    const r = await runBatch(n);
    return redirect(`/admin/crm/enrichment?ran=${r.processed}&found=${r.found}`);
  }
  if (action === 'infer_names') {
    const n = await inferAllNames();
    return redirect(`/admin/crm/enrichment?named=${n}`);
  }
  if (action === 'ai_batch') {
    if (!(await aiEnabled())) return redirect('/admin/crm/enrichment?aioff=1');
    const n = Math.min(Math.max(Number(clean(form.get('n'), 4)) || 15, 1), 40);
    const r = await aiEnrichBatch(n);
    return redirect(`/admin/crm/enrichment?airan=${r.processed}&aifound=${r.found}`);
  }
  if (action === 'set_primary' || action === 'reject') {
    const cid = Number(clean(form.get('candidate_id'), 12));
    if (!Number.isInteger(cid)) return redirect(back);
    const row = await env.DB.prepare(`SELECT listing_id FROM email_candidates WHERE id = ?1`).bind(cid).first<{ listing_id: number }>();
    if (!row) return redirect(back);
    if (action === 'reject') {
      await env.DB.prepare(`UPDATE email_candidates SET status = 'rejected' WHERE id = ?1`).bind(cid).run();
      await promoteBest(row.listing_id);
    } else {
      await env.DB.batch([
        env.DB.prepare(`UPDATE email_candidates SET status = 'verified' WHERE listing_id = ?1 AND status = 'primary'`).bind(row.listing_id),
        env.DB.prepare(`UPDATE email_candidates SET status = 'primary' WHERE id = ?1`).bind(cid),
      ]);
    }
    return redirect(back);
  }
  if (action === 'hunter_domain') {
    const id = Number(clean(form.get('listing_id'), 12));
    const l = id ? await getListingById(id) : null;
    const host = l?.website ? hostOfUrl(l.website) : null;
    if (l && host) await hunterEnrich(l.id, host);
    return redirect(back);
  }
  if (action === 'hunter_verify') {
    const cid = Number(clean(form.get('candidate_id'), 12));
    if (Number.isInteger(cid)) await hunterVerify(cid);
    return redirect(back);
  }
  return redirect(back);
};
