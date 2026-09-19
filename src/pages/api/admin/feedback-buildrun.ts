// Download the open feedback pipeline as a ranked Markdown build-run brief (admin-gated by middleware).
import type { APIRoute } from 'astro';
import { requireAdmin } from '../../../lib/adminGuard';
import { buildRunMarkdown } from '../../../lib/feedback';

export const GET: APIRoute = async ({ request }) => {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const md = await buildRunMarkdown();
  const date = new Date().toISOString().slice(0, 10);
  return new Response(md, {
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="build-run-${date}.md"`,
      'cache-control': 'private, no-store',
    },
  });
};
