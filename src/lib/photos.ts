import { env } from './env';

export const MAX_PHOTOS = 8;
// Server-side ceilings. Uploads are downscaled in the browser before they arrive, so these are
// backstops against a hand-crafted request, not the normal path.
export const MAX_PHOTO_BYTES = 6 * 1024 * 1024; // 6 MB
export const ALLOWED_PHOTO_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export interface PhotoRow {
  id: number;
  listing_id: number;
  r2_key: string;
  content_type: string;
  width: number | null;
  height: number | null;
  bytes: number | null;
  alt: string | null;
  sort: number;
  created_at: number;
}

export async function listPhotos(listingId: number): Promise<PhotoRow[]> {
  const r = await env.DB.prepare(
    `SELECT id, listing_id, r2_key, content_type, width, height, bytes, alt, sort, created_at
     FROM listing_photos WHERE listing_id = ?1 ORDER BY sort ASC, id ASC`
  ).bind(listingId).all<PhotoRow>();
  return r.results;
}

export async function photoCount(listingId: number): Promise<number> {
  const r = await env.DB.prepare(`SELECT COUNT(*) AS n FROM listing_photos WHERE listing_id = ?1`)
    .bind(listingId).first<{ n: number }>();
  return r?.n ?? 0;
}

// Returns the created row id, or null on any storage failure.
export async function addPhoto(
  listingId: number,
  body: ArrayBuffer,
  contentType: string,
  meta: { width?: number; height?: number; alt?: string } = {}
): Promise<number | null> {
  if (!env.PHOTOS) return null;
  const ext = ALLOWED_PHOTO_TYPES[contentType];
  if (!ext) return null;
  const key = `${listingId}/${crypto.randomUUID()}.${ext}`;
  await env.PHOTOS.put(key, body, { httpMetadata: { contentType } });
  const now = Math.floor(Date.now() / 1000);
  // New photo goes to the end of the gallery.
  const maxSort = (await env.DB.prepare(`SELECT COALESCE(MAX(sort), -1) AS m FROM listing_photos WHERE listing_id = ?1`)
    .bind(listingId).first<{ m: number }>())?.m ?? -1;
  const res = await env.DB.prepare(
    `INSERT INTO listing_photos (listing_id, r2_key, content_type, width, height, bytes, alt, sort, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`
  ).bind(listingId, key, contentType, meta.width ?? null, meta.height ?? null, body.byteLength,
    meta.alt ?? null, maxSort + 1, now).run();
  return Number(res.meta.last_row_id) || null;
}

// Deletes a photo the caller has already authorized. Removes the R2 object first, then the row,
// so a partial failure never leaves a live row pointing at missing bytes.
export async function deletePhoto(listingId: number, photoId: number): Promise<boolean> {
  const row = await env.DB.prepare(`SELECT r2_key FROM listing_photos WHERE id = ?1 AND listing_id = ?2`)
    .bind(photoId, listingId).first<{ r2_key: string }>();
  if (!row) return false;
  if (env.PHOTOS) { try { await env.PHOTOS.delete(row.r2_key); } catch { /* orphan bytes are harmless */ } }
  await env.DB.prepare(`DELETE FROM listing_photos WHERE id = ?1 AND listing_id = ?2`).bind(photoId, listingId).run();
  return true;
}

// Persists a new display order. `orderedIds` is the full set of this listing's photo ids in the
// desired order; ids not belonging to the listing are ignored.
export async function reorderPhotos(listingId: number, orderedIds: number[]): Promise<void> {
  const owned = new Set((await listPhotos(listingId)).map((p) => p.id));
  const seq = orderedIds.filter((id) => owned.has(id));
  const stmt = env.DB.prepare(`UPDATE listing_photos SET sort = ?3 WHERE id = ?1 AND listing_id = ?2`);
  const batch = seq.map((id, i) => stmt.bind(id, listingId, i));
  if (batch.length) await env.DB.batch(batch);
}
