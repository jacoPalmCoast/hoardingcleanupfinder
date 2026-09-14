import { isAdmin } from './services';
export async function requireAdmin(request: Request): Promise<Response | null> {
  if (await isAdmin(request)) return null;
  return new Response('Forbidden', { status: 403 });
}
