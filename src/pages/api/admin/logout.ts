import type { APIRoute } from 'astro';
import { redirect } from '../../../lib/util';
import { adminLogout } from '../../../lib/services';
export const GET: APIRoute = async ({ request }) => redirect('/admin/login', 303, { 'set-cookie': await adminLogout(request) });
