import { env } from './env';

// IndexNow: tells Bing (and therefore Copilot/ChatGPT search, DuckDuckGo, Yandex) about a
// changed URL within minutes instead of waiting for a recrawl. No-op until INDEXNOW_KEY is
// set. Failures are swallowed — indexing hints must never break a user-facing write.
export async function pingIndexNow(paths: string[]): Promise<void> {
  const key = env.INDEXNOW_KEY;
  if (!key || paths.length === 0) return;
  const host = new URL(env.SITE_URL).host;
  const urlList = [...new Set(paths)].slice(0, 10000).map((p) => (p.startsWith('http') ? p : `${env.SITE_URL}${p}`));
  try {
    await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `${env.SITE_URL}/indexnow.txt`, urlList }),
      signal: AbortSignal.timeout(4000),
    });
  } catch {}
}

/** Run the ping after the response is sent (Workers waitUntil) so writes never wait on Bing. */
export function queueIndexNow(locals: unknown, paths: string[]): void {
  // @astrojs/cloudflare v14 exposes the execution context as locals.cfContext; the older
  // locals.runtime.ctx getter now throws, so never touch it. Fall back to fire-and-forget.
  let ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  try { ctx = (locals as any)?.cfContext; } catch { ctx = undefined; }
  const p = pingIndexNow(paths);
  try { if (ctx?.waitUntil) ctx.waitUntil(p); else void p; } catch { void p; }
}

/** Pages affected when one listing changes: its own page, its metro and service-in-metro pages. */
export function listingPaths(l: { slug: string; state: string; city_slug: string; services?: string }): string[] {
  const out = [`/company/${l.slug}`, `/${l.state.toLowerCase()}/${l.city_slug}`];
  try {
    for (const s of JSON.parse(l.services ?? '[]')) out.push(`/${l.state.toLowerCase()}/${l.city_slug}/${s}`);
  } catch {}
  return out;
}
