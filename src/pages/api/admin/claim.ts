import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect, escapeHtml } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
import { getOrCreateOwner, sendEmail, emailShell } from '../../../lib/services';
import { audit } from '../../../lib/audit';
import { queueIndexNow } from '../../../lib/indexnow';

export const POST: APIRoute = async ({ request, locals }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const id = Number(clean(form.get('id'), 12));
  const action = clean(form.get('action'), 10);
  const c = await env.DB.prepare(`SELECT c.*, l.name, l.slug FROM claims c JOIN listings l ON l.id = c.listing_id WHERE c.id = ?1 AND c.status = 'review'`).bind(id).first<any>();
  if (!c) return redirect('/admin/claims');
  if (action === 'approve') {
    const ownerId = await getOrCreateOwner(c.email);
    await env.DB.batch([
      env.DB.prepare(`UPDATE claims SET status = 'verified' WHERE id = ?1`).bind(id),
      env.DB.prepare(`INSERT OR IGNORE INTO owner_listings(owner_id, listing_id) VALUES (?1, ?2)`).bind(ownerId, c.listing_id),
      env.DB.prepare(`UPDATE listings SET is_claimed = 1, email = COALESCE(email, ?2), updated_at = unixepoch() WHERE id = ?1`).bind(c.listing_id, c.email),
    ]);
    await audit('admin', 'admin', c.listing_id, 'claim.approve', null, { email: c.email, claim_id: id });
    queueIndexNow(locals, [`/company/${c.slug}`]);
    await sendEmail(c.email, `Your claim for ${c.name} is approved`, emailShell('Claim approved', `<p>You now manage <a href="${env.SITE_URL}/company/${c.slug}">${escapeHtml(c.name)}</a>. <a href="${env.SITE_URL}/account">Sign in</a> to edit it.</p>`));
  } else {
    await env.DB.prepare(`UPDATE claims SET status = 'rejected' WHERE id = ?1`).bind(id).run();
    await audit('admin', 'admin', c.listing_id, 'claim.reject', null, { email: c.email, claim_id: id });
  }
  return redirect('/admin/claims');
};
