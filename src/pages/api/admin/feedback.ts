import type { APIRoute } from 'astro';
import { clean, redirect } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
import { setFeedbackStatus, setFeedbackPriority, setFeedbackNote, deleteFeedback, isFeedbackStatus } from '../../../lib/feedback';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 20);
  const back = `/admin/feedback${clean(form.get('tab'), 12) ? `?tab=${clean(form.get('tab'), 12)}` : ''}`;

  const ids = form.getAll('ids').map((v) => Number(clean(v, 12))).filter(Number.isInteger);
  const singleId = Number(clean(form.get('id'), 12));

  if (action === 'status' || action === 'bulk_status') {
    const status = clean(form.get('status'), 12);
    const list = ids.length ? ids : (Number.isInteger(singleId) ? [singleId] : []);
    if (isFeedbackStatus(status) && list.length) await setFeedbackStatus(list, status);
    return redirect(back);
  }
  if (action === 'priority') {
    if (Number.isInteger(singleId)) {
      const raw = clean(form.get('priority'), 6);
      const p = raw === '' ? null : Math.max(0, Math.min(9, Number(raw) || 0));
      await setFeedbackPriority(singleId, p);
    }
    return redirect(back);
  }
  if (action === 'note') {
    if (Number.isInteger(singleId)) await setFeedbackNote(singleId, clean(form.get('note'), 1000));
    return redirect(back);
  }
  if (action === 'delete' || action === 'bulk_delete') {
    const list = ids.length ? ids : (Number.isInteger(singleId) ? [singleId] : []);
    if (list.length) await deleteFeedback(list);
    return redirect(back);
  }
  return redirect(back);
};
