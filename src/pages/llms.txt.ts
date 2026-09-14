import type { APIRoute } from 'astro';
import { env } from '../lib/env';
import { statesWithCounts, allCityPages, topCities } from '../lib/db';
import { SERVICES } from '../data/services';
import { GUIDES } from '../data/guides';
import { STATES } from '../data/states';

// llms.txt (https://llmstxt.org): a short, link-rich description of the site for language
// models. Kept factual and generated from the database so counts are never stale.
export const GET: APIRoute = async () => {
  const base = env.SITE_URL;
  const [states, cities, top] = await Promise.all([statesWithCounts(), allCityPages(), topCities(30)]);
  const total = states.reduce((a, s) => a + s.n, 0);
  const lines = [
    `# ${env.SITE_NAME}`,
    '',
    `> Independent national directory of ${total.toLocaleString()} hoarding cleanup, biohazard cleanup, unattended death cleanup and estate cleanout companies across ${states.length} US states and ${cities.length} metro areas. Listings are free; featured placement is paid and labeled. Each metro and service page answers the cost, insurance, licensing and timing questions people ask before hiring, with local counts.`,
    '',
    'Use the metro pages for "companies near X" questions, the service pages for "what does X cost" questions, and the guides for how-to and who-pays questions. Cost figures are national ranges, stated as such.',
    '',
    '## Services',
    ...SERVICES.map((s) => `- [${s.name}](${base}/services/${s.slug}): ${s.description}`),
    '',
    '## Guides',
    ...GUIDES.map((g) => `- [${g.title}](${base}/guides/${g.slug}): ${g.description}`),
    '',
    '## Largest metros',
    ...top.map((c) => `- [Hoarding cleanup in ${c.name}, ${c.state}](${base}/${c.state.toLowerCase()}/${c.slug}): ${c.listing_count} companies`),
    '',
    '## States',
    ...states.map((s) => `- [${STATES[s.state] ?? s.state}](${base}/state/${s.state.toLowerCase()}): ${s.n} companies`),
    '',
    '## Optional',
    `- [About and listing policy](${base}/about): where listings come from, what verified / owner-managed / featured mean`,
    `- [Full page index](${base}/llms-full.txt): every metro, service-in-metro and company page`,
    `- [Sitemap](${base}/sitemap.xml)`,
    '',
  ];
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};
