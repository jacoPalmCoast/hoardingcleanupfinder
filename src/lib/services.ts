import { env } from './env';
import { getCookie, now, randomToken, sha256, timingSafeEqual } from './util';

// ---------- Email (Resend) ----------
export async function sendEmail(to: string, subject: string, html: string, text?: string): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:dev] to=${to} subject=${subject}`);
    return true;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html, text: text ?? html.replace(/<[^>]+>/g, '') }),
  });
  if (!res.ok) console.error('resend error', res.status);
  return res.ok;
}

export function emailShell(title: string, body: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#222;max-width:560px;margin:0 auto;padding:24px">
<h2 style="color:#1F6F78;font-weight:600;margin:0 0 16px">${title}</h2>
<div style="font-size:15px;line-height:1.55">${body}</div>
<p style="margin-top:32px;font-size:12px;color:#777">${env.SITE_NAME} · <a href="${env.SITE_URL}" style="color:#777">${env.SITE_URL.replace('https://', '')}</a></p>
</body></html>`;
}

// ---------- Turnstile ----------
export async function verifyTurnstile(token: string | null, ip: string | null): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) {
    // Fail closed in production; allow only with an explicit dev bypass.
    return env.DEV_BYPASS_TURNSTILE === '1';
  }
  if (!token) return false;
  const body = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  if (ip) body.set('remoteip', ip);
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
  if (!res.ok) return false;
  const data = (await res.json()) as { success: boolean };
  return data.success === true;
}

export function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? 'unknown';
}

// ---------- Admin auth ----------
const ADMIN_COOKIE = 'hcf_admin';

async function adminToken(): Promise<string> {
  return sha256(`admin:${env.SESSION_SECRET ?? ''}:${env.ADMIN_PASSWORD ?? ''}`);
}

export async function isAdmin(req: Request): Promise<boolean> {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return false;
  const c = getCookie(req, ADMIN_COOKIE);
  if (!c) return false;
  return timingSafeEqual(c, await adminToken());
}

export async function adminLogin(password: string): Promise<string | null> {
  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) return null;
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) return null;
  return adminToken();
}

export function adminCookieHeader(token: string, secure: boolean): string {
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 12}${secure ? '; Secure' : ''}`;
}

export function adminLogoutHeader(): string {
  return `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`;
}

// ---------- Owner sessions ----------
const OWNER_COOKIE = 'hcf_owner';

export interface Owner {
  id: number;
  email: string;
}

export async function currentOwner(req: Request): Promise<Owner | null> {
  const token = getCookie(req, OWNER_COOKIE);
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT o.id, o.email FROM sessions s JOIN owners o ON o.id = s.owner_id WHERE s.token = ?1 AND s.expires_at > ?2`,
  )
    .bind(await sha256(token), now())
    .first<Owner>();
  return row ?? null;
}

export async function createOwnerSession(ownerId: number, secure: boolean): Promise<string> {
  const token = randomToken();
  const ttl = 60 * 60 * 24 * 30;
  await env.DB.prepare(`INSERT INTO sessions(token, owner_id, expires_at) VALUES (?1, ?2, ?3)`).bind(await sha256(token), ownerId, now() + ttl).run();
  return `${OWNER_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${secure ? '; Secure' : ''}`;
}

export async function destroyOwnerSession(req: Request): Promise<string> {
  const token = getCookie(req, OWNER_COOKIE);
  if (token) await env.DB.prepare(`DELETE FROM sessions WHERE token = ?1`).bind(await sha256(token)).run();
  return `${OWNER_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function ownerOwns(ownerId: number, listingId: number): Promise<boolean> {
  const r = await env.DB.prepare(`SELECT 1 AS ok FROM owner_listings WHERE owner_id = ?1 AND listing_id = ?2`).bind(ownerId, listingId).first();
  return !!r;
}

export async function getOrCreateOwner(email: string): Promise<number> {
  const e = email.toLowerCase();
  await env.DB.prepare(`INSERT OR IGNORE INTO owners(email) VALUES (?1)`).bind(e).run();
  const row = await env.DB.prepare(`SELECT id FROM owners WHERE email = ?1`).bind(e).first<{ id: number }>();
  return row!.id;
}

export function isSecure(req: Request): boolean {
  return new URL(req.url).protocol === 'https:';
}
