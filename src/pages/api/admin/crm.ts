import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { addActivity, completeTask, setStage, type Stage } from '../../../lib/crm';

// All CRM mutations from the admin UI. Admin-guarded; each redirects back to the company record.
export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 20);
  const listingId = Number(clean(form.get('listing_id'), 12));
  const back = listingId ? `/admin/crm/${listingId}` : '/admin/crm';

  if (action === 'complete_task') {
    const aid = Number(clean(form.get('activity_id'), 12));
    if (Number.isInteger(aid)) await completeTask(aid);
    return redirect(clean(form.get('back'), 120) || back);
  }
  if (!Number.isInteger(listingId) || listingId <= 0) return redirect('/admin/crm');

  if (action === 'note' || action === 'call') {
    const body = clean(form.get('body'), 2000);
    if (body) await addActivity(listingId, action, body);
  } else if (action === 'task') {
    const body = clean(form.get('body'), 500);
    const dueStr = clean(form.get('due'), 12); // YYYY-MM-DD
    const due = dueStr ? Math.floor(Date.parse(dueStr + 'T12:00:00Z') / 1000) : undefined;
    if (body) await addActivity(listingId, 'task', body, Number.isFinite(due) ? due : undefined);
  } else if (action === 'stage') {
    const stage = clean(form.get('stage'), 20) as Stage | '';
    await setStage(listingId, stage);
    await addActivity(listingId, 'stage_change', stage ? `Moved to ${stage}` : 'Stage reset to automatic');
  }
  return redirect(back);
};
