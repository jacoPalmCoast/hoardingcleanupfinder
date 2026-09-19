import { defineMiddleware } from 'astro:middleware';
import { isAdmin } from './lib/services';

// Content-Security-Policy: defense-in-depth on top of Astro auto-escaping + safeJson. 'unsafe-inline'
// is deliberate — inline JSON-LD, inline style attributes and the Turnstile snippet rely on it, and a
// nonce scheme across SSR + Turnstile is not worth the breakage risk here. It still constrains which
// hosts can load scripts/frames/fonts/images and blocks base-uri/object/framing abuse.
const CSP = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // photon.komoot.io: keyless OpenStreetMap address autocomplete on the listing edit form.
  "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com https://static.cloudflareinsights.com https://photon.komoot.io",
  "frame-src https://challenges.cloudflare.com",
  // Stripe Checkout + Billing Portal are hosted redirects: the form posts to /api/stripe/* which
  // 303-redirects to checkout.stripe.com / billing.stripe.com. Without these, form-action blocks the
  // redirect and the button silently does nothing.
  "form-action 'self' https://checkout.stripe.com https://billing.stripe.com",
  "upgrade-insecure-requests",
].join('; ');

// Invariant 7: admin fails closed. Every /admin page and /api/admin endpoint requires the admin cookie,
// except the login page and endpoint.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // CSRF defense-in-depth: reject cross-origin state-changing requests to the API. SameSite cookies are
  // the primary control; this is a second layer. The Stripe webhook is exempt (Stripe posts server-side
  // with no matching Origin and is authenticated by its signature). Missing Origin is allowed (older
  // clients / same-origin navigations) since SameSite already covers those.
  const m = context.request.method;
  if ((m === 'POST' || m === 'PUT' || m === 'PATCH' || m === 'DELETE') && pathname.startsWith('/api/') && pathname !== '/api/stripe/webhook') {
    const origin = context.request.headers.get('origin');
    if (origin) {
      try {
        if (new URL(origin).host !== context.url.host) return new Response('Cross-origin request blocked', { status: 403 });
      } catch {
        return new Response('Bad origin', { status: 403 });
      }
    }
  }

  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/api/admin/');
  const isOpen = pathname === '/admin/login' || pathname === '/api/admin/login';
  if (isAdminPath && !isOpen && !(await isAdmin(context.request))) {
    if (pathname.startsWith('/api/')) return new Response('Forbidden', { status: 403 });
    return context.redirect('/admin/login', 302);
  }
  const res = await next();
  if (isAdminPath || pathname.startsWith('/account') || pathname.startsWith('/claim/')) {
    res.headers.set('cache-control', 'private, no-store');
    res.headers.set('x-robots-tag', 'noindex');
  }
  res.headers.set('x-content-type-options', 'nosniff');
  res.headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  res.headers.set('x-frame-options', 'DENY');
  res.headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains; preload');
  res.headers.set('content-security-policy', CSP);
  return res;
});
