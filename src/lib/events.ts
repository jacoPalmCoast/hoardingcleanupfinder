// First-party visitor analytics — capture side. Logs a row to `events` for each tracked
// interaction. Bots are filtered out (never logged), so the numbers shown to advertisers are of
// real people. Nothing here can break a page: every write is best-effort and swallowed on error,
// and when a Worker `ctx` is passed the write runs after the response via waitUntil.
import { env } from './env';
import { clientIp } from './services';
import { sha256, now } from './util';

export type EventKind = 'view' | 'call' | 'website' | 'directions' | 'impression';

// Sources a listing can be seen/acted on from — kept short and closed so `ref` stays a clean facet.
export type EventSource = 'company' | 'city' | 'service' | 'search' | 'state' | 'home' | 'nearby' | 'featured';

const BOT =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|embedly|quora|pinterest|slackbot|telegram|whatsapp|discord|headless|lighthouse|gptbot|claudebot|ccbot|perplexity|python-requests|\bcurl\b|wget|monitor|uptime|semrush|ahrefs|dataforseo|petalbot|yandex|duckduck/i;

export function uaClass(ua: string): 'mobile' | 'desktop' | 'bot' {
  if (!ua || BOT.test(ua)) return 'bot';
  return /mobile|android|iphone|ipad|ipod/i.test(ua) ? 'mobile' : 'desktop';
}

// Daily-rotating, non-reversible token so we can count unique visitors without storing IPs.
async function sessionHash(req: Request, ua: string): Promise<string> {
  const ip = clientIp(req) || '0';
  const day = Math.floor(now() / 86400);
  return (await sha256(`${ip}|${ua}|${day}`)).slice(0, 24);
}

interface WaitCtx { waitUntil(p: Promise<unknown>): void }

function run(ctx: WaitCtx | undefined, p: Promise<unknown>): void {
  const guarded = p.catch(() => {}); // analytics must never surface an error to the request
  if (ctx?.waitUntil) ctx.waitUntil(guarded);
  else void guarded;
}

// A single interaction with one listing (view / call / website / directions).
export function trackEvent(
  kind: Exclude<EventKind, 'impression'>,
  listingId: number,
  req: Request,
  source: EventSource,
  ctx?: WaitCtx,
): void {
  const ua = req.headers.get('user-agent') ?? '';
  if (uaClass(ua) === 'bot') return;
  run(ctx, (async () => {
    const session = await sessionHash(req, ua);
    await env.DB.prepare(
      `INSERT INTO events(listing_id, kind, session, ref, ua, country) VALUES (?1,?2,?3,?4,?5,?6)`,
    ).bind(listingId, kind, session, source, uaClass(ua), req.headers.get('cf-ipcountry') ?? null).run();
  })());
}

// One results render showing several listings. Stored as a single row with the id list, exploded
// into per-listing counts by the daily rollup — keeps writes at one per page, not one per listing.
export function trackImpressions(
  ids: number[],
  req: Request,
  source: EventSource,
  ctx?: WaitCtx,
): void {
  const ua = req.headers.get('user-agent') ?? '';
  if (uaClass(ua) === 'bot' || ids.length === 0) return;
  const capped = ids.slice(0, 60); // a single page never shows more than this many listings
  run(ctx, (async () => {
    const session = await sessionHash(req, ua);
    await env.DB.prepare(
      `INSERT INTO events(kind, session, ref, ua, country, ids) VALUES ('impression',?1,?2,?3,?4,?5)`,
    ).bind(session, source, uaClass(ua), req.headers.get('cf-ipcountry') ?? null, JSON.stringify(capped)).run();
  })());
}

// A visitor search. Logged once per results render (real people only), with how many results came
// back and how many were featured — so the admin demand view can surface unmet demand.
export function trackSearch(
  req: Request,
  s: { q: string; service: string; isZip: boolean; resultsN: number; featuredN: number },
  ctx?: WaitCtx,
): void {
  const ua = req.headers.get('user-agent') ?? '';
  if (uaClass(ua) === 'bot') return;
  const q = s.q.trim().slice(0, 60).toLowerCase();
  if (q.length < 2) return;
  run(ctx, (async () => {
    const session = await sessionHash(req, ua);
    await env.DB.prepare(
      `INSERT INTO searches(q, service, is_zip, results_n, featured_n, session, country) VALUES (?1,?2,?3,?4,?5,?6,?7)`,
    ).bind(q, s.service || '', s.isZip ? 1 : 0, s.resultsN, s.featuredN, session, req.headers.get('cf-ipcountry') ?? null).run();
  })());
}

// Pull the Worker execution context (for waitUntil) out of Astro locals. On @astrojs/cloudflare
// this is `locals.cfContext` — note `locals.runtime.ctx` is a getter that THROWS in this version,
// so never touch it. Falls back to undefined (the write then runs inline) if it's absent.
export function waitCtx(locals: unknown): WaitCtx | undefined {
  const ctx = (locals as { cfContext?: WaitCtx })?.cfContext;
  return typeof ctx?.waitUntil === 'function' ? ctx : undefined;
}
