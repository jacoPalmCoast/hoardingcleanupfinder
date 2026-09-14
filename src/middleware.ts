import { defineMiddleware } from 'astro:middleware';
import { isAdmin } from './lib/services';

// Invariant 7: admin fails closed. Every /admin page and /api/admin endpoint requires the admin cookie,
// except the login page and endpoint.
export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
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
  return res;
});
