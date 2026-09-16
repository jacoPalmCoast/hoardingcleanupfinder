import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { clean, redirect } from '../../../lib/util';
import { createCampaign, queueCampaign, setCampaignStatus, isSegment } from '../../../lib/outreach';

export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const action = clean(form.get('action'), 20);

  if (action === 'create') {
    const name = clean(form.get('name'), 120);
    const segment = clean(form.get('segment'), 40);
    const subject = clean(form.get('subject'), 150);
    const body = clean(form.get('body'), 6000);
    if (!name || !subject || !body || !isSegment(segment)) return redirect('/admin/crm/outreach?msg=invalid');
    const id = await createCampaign(name, segment, subject, body);
    return redirect(`/admin/crm/outreach/${id}`);
  }

  const id = Number(clean(form.get('campaign_id'), 12));
  if (!Number.isInteger(id)) return redirect('/admin/crm/outreach');
  if (action === 'queue') await queueCampaign(id);
  else if (action === 'pause') await setCampaignStatus(id, 'paused');
  else if (action === 'resume') await setCampaignStatus(id, 'sending');
  return redirect(`/admin/crm/outreach/${id}`);
};
