import type { APIRoute } from 'astro';
import { destroyOwnerSession } from '../../../lib/services';
import { redirect } from '../../../lib/util';
// POST-only: a GET here could be triggered cross-site (an <img>/link) to force a logout. The
// same-origin form + the middleware Origin guard make it a deliberate action.
export const POST: APIRoute = async ({ request }) => redirect('/account', 303, { 'set-cookie': await destroyOwnerSession(request) });
