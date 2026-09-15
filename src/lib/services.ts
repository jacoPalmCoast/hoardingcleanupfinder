import { env } from './env';
import { getCookie, now, randomToken, sha256, timingSafeEqual, escapeHtml } from './util';
import { isSuppressed, logEmail } from './db';
import { unsubToken } from './mailauth';

// ---------- Email (Resend) ----------
export type EmailStream = 'txn' | 'marketing';
export interface SendOpts {
  text?: string;
  stream?: EmailStream;      // 'txn' (default) always sends; 'marketing' respects the suppression list
  type?: string;             // login_code, claim_code, lead_company, outreach_step1, ...
  listingId?: number;
  ownerId?: number;
  headers?: Record<string, string>;
}

// Every send is logged to the `emails` table (best-effort — a logging failure never blocks a send).
// Marketing mail is suppression-gated and carries one-click List-Unsubscribe headers; transactional
// mail (codes, receipts) is never suppressed so a user can always sign in.
export async function sendEmail(to: string, subject: string, html: string, opts: SendOpts = {}): Promise<boolean> {
  const stream: EmailStream = opts.stream ?? 'txn';
  const toLc = to.toLowerCase();

  if (stream === 'marketing') {
    try {
      if (await isSuppressed(toLc)) {
        await logEmail({ to_email: toLc, stream, type: opts.type, subject, status: 'suppressed', listing_id: opts.listingId, owner_id: opts.ownerId });
        return false;
      }
    } catch (e) { /* if the check fails, do not send marketing mail we can't gate */ return false; }
  }

  let headers = opts.headers;
  let outHtml = html;
  if (stream === 'marketing') {
    // CAN-SPAM: commercial mail needs a visible opt-out AND a physical postal address IN the body,
    // not only the List-Unsubscribe header. Fail closed if either the address or the signing secret
    // (for a valid unsubscribe link) is missing — better to send nothing than a non-compliant email.
    if (!env.MAILING_ADDRESS) {
      try { await logEmail({ to_email: toLc, stream, type: opts.type, subject, status: 'failed', error: 'no_mailing_address', listing_id: opts.listingId, owner_id: opts.ownerId }); } catch {}
      return false;
    }
    try {
      const url = `${env.SITE_URL}/api/unsubscribe?t=${await unsubToken(toLc)}`;
      headers = { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click', ...(headers ?? {}) };
      const footer = `<hr style="border:none;border-top:1px solid #eee;margin:26px 0 12px"><p style="font-size:12px;color:#888;line-height:1.5">You're receiving this because your business is listed on ${escapeHtml(env.SITE_NAME)}. <a href="${url}" style="color:#888">Unsubscribe</a>.<br>${escapeHtml(env.MAILING_ADDRESS)}</p>`;
      outHtml = html.includes('</body>') ? html.replace('</body>', `${footer}</body>`) : html + footer;
    } catch {
      try { await logEmail({ to_email: toLc, stream, type: opts.type, subject, status: 'failed', error: 'no_unsub_token', listing_id: opts.listingId, owner_id: opts.ownerId }); } catch {}
      return false;
    }
  }

  if (!env.RESEND_API_KEY) {
    // Dev only: codes are printed so flows can be tested without Resend. Production fails closed.
    if (env.DEV_BYPASS_TURNSTILE === '1') {
      console.log(`[email:dev] to=${to} subject=${subject}`);
      return true;
    }
    console.error('RESEND_API_KEY missing; email not sent');
    try { await logEmail({ to_email: toLc, stream, type: opts.type, subject, status: 'failed', error: 'no_api_key', listing_id: opts.listingId, owner_id: opts.ownerId }); } catch {}
    return false;
  }

  let ok = false;
  let resendId: string | undefined;
  let errMsg: string | undefined;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.FROM_EMAIL, to: [to], subject, html: outHtml, text: opts.text ?? outHtml.replace(/<[^>]+>/g, ''), headers }),
    });
    ok = res.ok;
    if (res.ok) {
      const j = (await res.json().catch(() => null)) as { id?: string } | null;
      resendId = j?.id;
    } else {
      errMsg = `resend_${res.status}`;
      console.error('resend error', res.status);
    }
  } catch (e) {
    errMsg = 'fetch_error';
    console.error('resend fetch failed', (e as Error)?.message);
  }
  try { await logEmail({ to_email: toLc, stream, type: opts.type, subject, status: ok ? 'sent' : 'failed', error: errMsg, resend_id: resendId, listing_id: opts.listingId, owner_id: opts.ownerId }); } catch {}
  return ok;
}

// The inbox that receives operator notifications (new pending listings, leads, reports, reviews,
// claims to review). Uses ADMIN_EMAIL when set; falls back to the bare from-address so nothing is
// silently dropped. Sending to a real operator inbox — not the from-address — is what makes these
// notifications actually reach a person and avoids a from==to deliverability flag.
export function adminEmail(): string {
  return (env.ADMIN_EMAIL || env.FROM_EMAIL).replace(/.*<|>.*/g, '').trim();
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

const ADMIN_TTL = 60 * 60 * 12;

export async function isAdmin(req: Request): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  const c = getCookie(req, ADMIN_COOKIE);
  if (!c || !/^[a-f0-9]{64}$/.test(c)) return false;
  const row = await env.DB.prepare(`SELECT 1 AS ok FROM admin_sessions WHERE token = ?1 AND expires_at > ?2`).bind(await sha256(c), now()).first();
  return !!row;
}

// Random token per login, hashed at rest, expiring server-side. Logout revokes it.
export async function adminLogin(password: string): Promise<string | null> {
  if (!env.ADMIN_PASSWORD) return null;
  if (!timingSafeEqual(password, env.ADMIN_PASSWORD)) return null;
  const token = randomToken();
  await env.DB.prepare(`DELETE FROM admin_sessions WHERE expires_at < ?1`).bind(now()).run();
  await env.DB.prepare(`INSERT INTO admin_sessions(token, expires_at) VALUES (?1, ?2)`).bind(await sha256(token), now() + ADMIN_TTL).run();
  return token;
}

export function adminCookieHeader(token: string, secure: boolean): string {
  return `${ADMIN_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_TTL}${secure ? '; Secure' : ''}`;
}

export async function adminLogout(req: Request): Promise<string> {
  const c = getCookie(req, ADMIN_COOKIE);
  if (c) await env.DB.prepare(`DELETE FROM admin_sessions WHERE token = ?1`).bind(await sha256(c)).run();
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
