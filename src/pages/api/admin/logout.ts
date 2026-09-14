import type { APIRoute } from 'astro';
import { redirect } from '../../../lib/util';
import { adminLogoutHeader } from '../../../lib/services';
export const GET: APIRoute = async () => redirect('/admin/login', 303, { 'set-cookie': adminLogoutHeader() });
