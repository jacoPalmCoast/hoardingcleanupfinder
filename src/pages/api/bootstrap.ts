import type { APIRoute } from 'astro';
import { env } from '../../lib/env';

// One-time bootstrap: loads seed SQL only while the listings table is empty.
// Remove this route once the production database is seeded.
export const POST: APIRoute = async ({ request }) => {
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM listings`).first<{ n: number }>();
  if ((count?.n ?? 0) > 0) return new Response('already seeded', { status: 409 });
  const sql = await request.text();
  if (sql.length > 2_000_000 || !/^\s*INSERT OR IGNORE INTO (cities|listings)\(/m.test(sql)) return new Response('bad seed', { status: 400 });
  if (/\b(DROP|DELETE|UPDATE|ALTER|PRAGMA|ATTACH)\b/i.test(sql)) return new Response('bad seed', { status: 400 });
  const stmts = sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean).map((s) => env.DB.prepare(s));
  let done = 0;
  for (let i = 0; i < stmts.length; i += 100) {
    await env.DB.batch(stmts.slice(i, i + 100));
    done += Math.min(100, stmts.length - i);
  }
  const after = await env.DB.prepare(`SELECT (SELECT COUNT(*) FROM listings) AS listings, (SELECT COUNT(*) FROM cities) AS cities`).first();
  return new Response(JSON.stringify({ statements: done, ...after }), { headers: { 'content-type': 'application/json' } });
};
