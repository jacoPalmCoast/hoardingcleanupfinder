import type { APIRoute } from 'astro';
import { env } from '../../../lib/env';
import { clean, redirect, isEmail, escapeHtml } from '../../../lib/util';
import { requireAdmin } from '../../../lib/adminGuard';
import { getOrCreateOwner, sendEmail, emailShell } from '../../../lib/services';
import { getListingById } from '../../../lib/db';
import { audit } from '../../../lib/audit';

// Admin-only owner management: add an owner (new email / transfer), or remove one.
// Removing the last owner also clears is_claimed so the public "Owner-managed" badge
// and the claim prompt are correct again.
export const POST: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const form = await request.formData();
  const listingId = Number(clean(form.get('listing_id'), 12));
  const action = clean(form.get('action'), 10);
  if (!Number.isInteger(listingId)) return redirect('/admin/listings');
  const l = await getListingById(listingId);
  if (!l) return redirect('/admin/listings');

  if (action === 'add') {
    const email = clean(form.get('email'), 254).toLowerCase();
    if (!isEmail(email)) return redirect(`/admin/listings?id=${listingId}&msg=invalid`);
    const ownerId = await getOrCreateOwner(email);
    await env.DB.batch([
      env.DB.prepare(`INSERT OR IGNORE INTO owner_listings(owner_id, listing_id) VALUES (?1, ?2)`).bind(ownerId, listingId),
      env.DB.prepare(`UPDATE listings SET is_claimed = 1, updated_at = unixepoch() WHERE id = ?1`).bind(listingId),
    ]);
    await audit('admin', 'admin', listingId, 'owner.add', null, { email });
    await sendEmail(email, `You can now manage ${l.name}`, emailShell('Listing access', `<p>You have been given access to <a href="${env.SITE_URL}/company/${l.slug}">${escapeHtml(l.name)}</a> on ${escapeHtml(env.SITE_NAME)}. <a href="${env.SITE_URL}/account">Sign in</a> with this email address to edit it.</p>`));
    return redirect(`/admin/listings?id=${listingId}&msg=owner-added`);
  }
  if (action === 'remove') {
    const ownerId = Number(clean(form.get('owner_id'), 12));
    if (!Number.isInteger(ownerId)) return redirect(`/admin/listings?id=${listingId}&msg=invalid`);
    const owner = await env.DB.prepare(`SELECT email FROM owners WHERE id = ?1`).bind(ownerId).first<{ email: string }>();
    await env.DB.prepare(`DELETE FROM owner_listings WHERE owner_id = ?1 AND listing_id = ?2`).bind(ownerId, listingId).run();
    const left = await env.DB.prepare(`SELECT COUNT(*) AS n FROM owner_listings WHERE listing_id = ?1`).bind(listingId).first<{ n: number }>();
    if ((left?.n ?? 0) === 0) {
      await env.DB.batch([
        env.DB.prepare(`UPDATE listings SET is_claimed = 0, updated_at = unixepoch() WHERE id = ?1`).bind(listingId),
        env.DB.prepare(`UPDATE claims SET status = 'rejected' WHERE listing_id = ?1 AND status = 'verified'`).bind(listingId),
      ]);
    }
    await audit('admin', 'admin', listingId, 'owner.remove', { email: owner?.email ?? null }, null);
    return redirect(`/admin/listings?id=${listingId}&msg=owner-removed`);
  }
  return redirect(`/admin/listings?id=${listingId}`);
};
