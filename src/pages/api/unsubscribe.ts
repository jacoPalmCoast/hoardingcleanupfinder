import type { APIRoute } from 'astro';
import { verifyUnsubToken } from '../../lib/mailauth';
import { addSuppression } from '../../lib/db';
import { env } from '../../lib/env';

async function doUnsub(token: string | null): Promise<boolean> {
  if (!token) return false;
  const email = await verifyUnsubToken(token);
  if (!email) return false;
  await addSuppression(email, 'unsubscribe', 'one-click');
  return true;
}

// One-click POST from the mail client (List-Unsubscribe-Post). No Origin header → allowed by the
// middleware CSRF guard. Always 200 so the client marks it done; only a valid token suppresses.
export const POST: APIRoute = async ({ request, url }) => {
  const token = url.searchParams.get('t') ?? new URLSearchParams(await request.text().catch(() => '')).get('t');
  await doUnsub(token);
  return new Response('ok', { status: 200 });
};

// Browser click from the email footer link.
export const GET: APIRoute = async ({ url }) => {
  const ok = await doUnsub(url.searchParams.get('t'));
  const msg = ok
    ? "You're unsubscribed. You won't receive marketing emails from us. You'll still get essential account emails (like sign-in codes) if you use the site."
    : 'This unsubscribe link is invalid or has expired. If you keep getting emails, reply to one and we\'ll remove you.';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Unsubscribe · ${env.SITE_NAME}</title>
<style>body{font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#fff;color:#141c1b;max-width:520px;margin:0 auto;padding:48px 20px;line-height:1.55}h1{font-size:1.4rem;font-weight:600}a{color:#0f6d6a}</style>
</head><body><h1>${ok ? 'Unsubscribed' : 'Link not valid'}</h1><p>${msg}</p><p><a href="${env.SITE_URL}/">Back to ${env.SITE_NAME}</a></p></body></html>`;
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' } });
};
