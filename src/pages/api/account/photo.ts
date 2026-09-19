// Owner photo management for a listing: upload, delete, reorder. JSON responses so the edit page
// can manage the gallery without full reloads. Auth: signed-in owner who owns the listing.
import type { APIRoute } from 'astro';
import { currentOwner, ownerOwns } from '../../../lib/services';
import { clean } from '../../../lib/util';
import { audit } from '../../../lib/audit';
import {
  listPhotos, addPhoto, deletePhoto, reorderPhotos, photoCount,
  MAX_PHOTOS, MAX_PHOTO_BYTES, ALLOWED_PHOTO_TYPES, type PhotoRow,
} from '../../../lib/photos';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const dto = (rows: PhotoRow[]) => rows.map((p) => ({ id: p.id, url: `/img/${p.r2_key}`, alt: p.alt ?? '' }));

export const POST: APIRoute = async ({ request }) => {
  const owner = await currentOwner(request);
  if (!owner) return json({ ok: false, error: 'not-signed-in' }, 401);

  const form = await request.formData();
  const listingId = Number(clean(form.get('id'), 12));
  if (!Number.isInteger(listingId) || !(await ownerOwns(owner.id, listingId))) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }
  const action = clean(form.get('action'), 12);

  if (action === 'upload') {
    const file = form.get('file');
    if (!(file instanceof File)) return json({ ok: false, error: 'no-file' }, 400);
    if (!ALLOWED_PHOTO_TYPES[file.type]) return json({ ok: false, error: 'bad-type' }, 400);
    if (file.size === 0 || file.size > MAX_PHOTO_BYTES) return json({ ok: false, error: 'too-large' }, 400);
    if ((await photoCount(listingId)) >= MAX_PHOTOS) return json({ ok: false, error: 'limit', limit: MAX_PHOTOS }, 400);
    const w = Number(clean(form.get('w'), 6)) || undefined;
    const h = Number(clean(form.get('h'), 6)) || undefined;
    const body = await file.arrayBuffer();
    const id = await addPhoto(listingId, body, file.type, { width: w, height: h });
    if (!id) return json({ ok: false, error: 'store-failed' }, 500);
    await audit('owner', owner.email, listingId, 'photo.add');
    return json({ ok: true, photos: dto(await listPhotos(listingId)) });
  }

  if (action === 'delete') {
    const photoId = Number(clean(form.get('photo_id'), 12));
    if (!Number.isInteger(photoId)) return json({ ok: false, error: 'bad-id' }, 400);
    await deletePhoto(listingId, photoId);
    await audit('owner', owner.email, listingId, 'photo.delete');
    return json({ ok: true, photos: dto(await listPhotos(listingId)) });
  }

  if (action === 'reorder') {
    const ids = clean(form.get('order'), 200).split(',').map((s) => Number(s)).filter(Number.isInteger);
    await reorderPhotos(listingId, ids);
    return json({ ok: true, photos: dto(await listPhotos(listingId)) });
  }

  return json({ ok: false, error: 'bad-action' }, 400);
};
