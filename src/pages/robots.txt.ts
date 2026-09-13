import type { APIRoute } from 'astro';
import { env } from '../lib/env';
export const GET: APIRoute = () =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /account\nDisallow: /api/\nDisallow: /search\nSitemap: ${env.SITE_URL}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
