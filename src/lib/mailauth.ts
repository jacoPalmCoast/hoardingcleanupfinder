import { env } from './env';
import { hmacHex, b64urlEncodeStr, b64urlDecodeStr, timingSafeEqual, bytesToBase64, base64ToBytes } from './util';

// ---------- Signed one-click unsubscribe tokens ----------
// token = base64url(email) + '.' + hmac(SESSION_SECRET, 'unsub:'+email). Unforgeable; carries the
// email so unsubscribe is one request with no lookup. Email is the user's own, so putting it in the
// link is fine.
export async function unsubToken(email: string): Promise<string> {
  const secret = env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET missing');
  const e = email.toLowerCase();
  return `${b64urlEncodeStr(e)}.${await hmacHex(secret, 'unsub:' + e)}`;
}
export async function verifyUnsubToken(token: string): Promise<string | null> {
  const secret = env.SESSION_SECRET;
  if (!secret) return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;
  const enc = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  let email: string;
  try { email = b64urlDecodeStr(enc); } catch { return null; }
  const expect = await hmacHex(secret, 'unsub:' + email);
  return timingSafeEqual(sig, expect) ? email : null;
}

// ---------- Resend (Svix) webhook signature verification ----------
// Resend signs webhooks with the Svix scheme: secret is "whsec_<base64>", signed content is
// `${svix-id}.${svix-timestamp}.${rawBody}`, and svix-signature is a space-separated list of
// "v1,<base64 hmac>". Verify against any listed signature and enforce a 5-minute timestamp window.
export async function verifyResendSignature(secret: string, headers: Headers, rawBody: string): Promise<boolean> {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sigHeader = headers.get('svix-signature');
  if (!id || !ts || !sigHeader) return false;
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Math.floor(Date.now() / 1000) - tsNum) > 300) return false;
  const raw = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try { keyBytes = base64ToBytes(raw); } catch { return false; }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`)));
  const expected = bytesToBase64(mac);
  for (const part of sigHeader.split(' ')) {
    const comma = part.indexOf(',');
    const v = comma >= 0 ? part.slice(comma + 1) : part;
    if (v && timingSafeEqual(v, expected)) return true;
  }
  return false;
}
