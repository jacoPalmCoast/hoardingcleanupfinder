import type { APIRoute } from 'astro';
import { env } from '../lib/env';

// AI and search crawlers are explicitly allowed: being cited by ChatGPT, Claude, Perplexity,
// Gemini and Copilot is a distribution channel for this site, not a cost. Private and
// transactional routes stay disallowed for everyone.
const PRIVATE = ['/admin', '/account', '/api/', '/search', '/claim/', '/featured/'];
const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Bingbot', 'Applebot', 'Applebot-Extended', 'CCBot', 'Amazonbot', 'meta-externalagent', 'DuckAssistBot', 'YouBot', 'cohere-ai', 'Bytespider'];

export const GET: APIRoute = () => {
  const block = (ua: string) => `User-agent: ${ua}\nAllow: /\n${PRIVATE.map((p) => `Disallow: ${p}`).join('\n')}\n`;
  const body = [block('*'), ...AI_BOTS.map(block)].join('\n') + `\nSitemap: ${env.SITE_URL}/sitemap.xml\n`;
  return new Response(body, { headers: { 'content-type': 'text/plain', 'cache-control': 'public, max-age=86400' } });
};
