import type { APIRoute } from 'astro';
import { redirect } from '../../../lib/util';
import { adminLogout } from '../../../lib/services';
// POST-only (see account/logout): prevents a cross-site GET from forcing an admin logout.
export const POST: APIRoute = async ({ request }) => redirect('/admin/login', 303, { 'set-cookie': await adminLogout(request) });
