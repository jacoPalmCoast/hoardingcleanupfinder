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
