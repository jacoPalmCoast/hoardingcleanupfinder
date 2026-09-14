import type { APIRoute } from 'astro';
import { env } from '../lib/env';
// IndexNow key file (keyLocation). 404 until the key is configured.
export const GET: APIRoute = () => (env.INDEXNOW_KEY ? new Response(env.INDEXNOW_KEY, { headers: { 'content-type': 'text/plain' } }) : new Response(null, { status: 404 }));
