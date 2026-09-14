import type { APIRoute } from 'astro';
import { destroyOwnerSession } from '../../../lib/services';
import { redirect } from '../../../lib/util';
export const GET: APIRoute = async ({ request }) => redirect('/account', 303, { 'set-cookie': await destroyOwnerSession(request) });
