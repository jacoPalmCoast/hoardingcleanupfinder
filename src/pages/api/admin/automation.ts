import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { setSetting } from '../../../lib/settings';
import { runDiscovery } from '../../../lib/discovery';
import { runBatch, inferAllNames, aiEnrichBatch, aiEnabled, opencorpBatch, opencorpEnabled } from '../../../lib/enrich';

const clampInt = (v: FormDataEntryValue | null, def: number, lo: number, hi: number) =>
  Math.min(Math.max(Math.floor(Number(clean(v, 8)) || def), lo), hi);

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 24);
  const done = (q: string) => redirect(`/admin/automation?${q}`);

  // Save agent settings (toggles + discovery limits + the deep-enrichment AI toggle).
  if (action === 'save') {
    await setSetting('discovery_enabled', form.get('discovery_enabled') ? 'on' : 'off');
    await setSetting('enrich_ai', form.get('enrich_ai') ? 'on' : 'off');
    await setSetting('discovery_cities_per_run', String(clampInt(form.get('discovery_cities_per_run'), 8, 1, 50)));
    await setSetting('discovery_queries_per_city', String(clampInt(form.get('discovery_queries_per_city'), 2, 1, 4)));
    await setSetting('discovery_monthly_cap', String(clampInt(form.get('discovery_monthly_cap'), 2000, 0, 100000)));
    return done('saved=1');
  }

  // Run-now buttons. Discovery is forced (bypasses the weekly gate) but still respects the monthly cap.
  if (action === 'run_discovery') {
    const r = await runDiscovery({ force: true });
    return done(r.skipped ? `disc_skipped=${r.skipped}` : `disc_found=${r.found}&disc_scanned=${r.scanned}&disc_calls=${r.calls}`);
  }
  if (action === 'run_enrich') {
    const r = await runBatch(clampInt(form.get('n'), 12, 1, 60));
    return done(`enrich_ran=${r.processed}&enrich_found=${r.found}`);
  }
  if (action === 'run_infer') {
    const n = await inferAllNames();
    return done(`infer_named=${n}`);
  }
  if (action === 'run_ai') {
    if (!(await aiEnabled())) return done('ai_off=1');
    const r = await aiEnrichBatch(clampInt(form.get('n'), 15, 1, 40));
    return done(`ai_ran=${r.processed}&ai_found=${r.found}`);
  }
  if (action === 'run_records') {
    if (!opencorpEnabled()) return done('rec_off=1');
    const r = await opencorpBatch(clampInt(form.get('n'), 20, 1, 40));
    return done(`rec_ran=${r.processed}&rec_found=${r.found}`);
  }
  return done('saved=1');
};
