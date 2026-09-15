export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function digits(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
}

export function formatPhone(s: string | null | undefined): string {
  const d = digits(s);
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return s ?? '';
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

/** Parse a listings timestamp defensively. Column is unix-seconds INTEGER, but some rows were
 *  backfilled as a "YYYY-MM-DD HH:MM:SS" UTC text value; a raw `v * 1000` on those yields NaN and
 *  `new Date(NaN).toISOString()` throws, which 500s the whole page. Returns null when unparseable. */
export function tsToDate(v: unknown): Date | null {
  if (v == null) return null;
  if (typeof v === 'number') {
    const d = new Date(v * 1000);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    if (/^\d+$/.test(v)) {
      const d = new Date(Number(v) * 1000);
      return isNaN(d.getTime()) ? null : d;
    }
    // SQLite datetime() text is UTC; make it explicit so parsing is deterministic across runtimes.
    const hasZone = /[zZ]|[+-]\d\d:?\d\d$/.test(v);
    const d = new Date((v.includes('T') ? v : v.replace(' ', 'T')) + (hasZone ? '' : 'Z'));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** YYYY-MM-DD for a listings timestamp, or null if it can't be parsed. Never throws. */
export function isoDay(v: unknown): string | null {
  const d = tsToDate(v);
  return d ? d.toISOString().slice(0, 10) : null;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

// JSON safe to embed inside <script>: no sequence can close the tag or break the parser.
export function safeJson(v: unknown): string {
  return JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

export function randomCode(len = 6): string {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => (b % 10).toString()).join('');
}

export function randomToken(bytes = 32): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

// ---------- base64url + HMAC (used for signed unsubscribe tokens and webhook verification) ----------
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
export function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function b64urlEncodeStr(s: string): string {
  return bytesToBase64(new TextEncoder().encode(s)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function b64urlDecodeStr(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  return new TextDecoder().decode(base64ToBytes(b64));
}
export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

export function clean(s: FormDataEntryValue | null, max = 500): string {
  return String(s ?? '').trim().slice(0, max);
}

export function parseServices(json: string | null): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function hostOf(url: string | null | undefined): string {
  try {
    return new URL(url ?? '').hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const u = /^https?:\/\//i.test(url) ? url : `https://${url}`;
  try {
    const p = new URL(u);
    if (!['http:', 'https:'].includes(p.protocol)) return null;
    return p.toString();
  } catch {
    return null;
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function redirect(location: string, status = 303, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers: { location, ...headers } });
}

export function cookie(name: string, value: string, maxAge: number, secure: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
}

export function getCookie(req: Request, name: string): string | null {
  const c = req.headers.get('cookie') ?? '';
  const m = c.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

/** Origin to send a browser back to after Stripe. The canonical SITE_URL is used once the
 *  custom domain is live; until then (or on a preview host) the request's own origin. */
export function returnOrigin(request: Request, siteUrl: string): string {
  const o = new URL(request.url).origin;
  return /\.workers\.dev$/.test(new URL(o).host) ? o : siteUrl;
}
