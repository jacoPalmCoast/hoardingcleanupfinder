import { env } from './env';

// Audit log: who changed what on a listing. Written after the change succeeds; a failed
// audit write must never roll back or block the user-facing change, so errors are swallowed.
export async function audit(actorType: 'admin' | 'owner' | 'system', actor: string | null, listingId: number | null, action: string, before?: unknown, after?: unknown): Promise<void> {
  try {
    await env.DB.prepare(`INSERT INTO audit_log(actor_type, actor, listing_id, action, before, after) VALUES (?1, ?2, ?3, ?4, ?5, ?6)`)
      .bind(actorType, actor, listingId, action, before === undefined ? null : JSON.stringify(before), after === undefined ? null : JSON.stringify(after))
      .run();
  } catch {}
}

/** Keep only the keys that changed, so the log stays readable. */
export function diff<T extends Record<string, unknown>>(before: T, after: T): { before: Partial<T>; after: Partial<T> } {
  const b: Partial<T> = {}; const a: Partial<T> = {};
  for (const k of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) { b[k] = before[k]; a[k] = after[k]; }
  }
  return { before: b, after: a };
}
