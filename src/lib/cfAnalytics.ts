// Cloudflare Web Analytics (RUM) pulled into the admin portal. Queries the Cloudflare GraphQL
// Analytics API server-side with a read-only Account Analytics token, so the aggregate traffic
// view (visits, top pages, referrers, countries, devices, browsers) lives alongside the
// first-party per-listing numbers instead of only in the Cloudflare dashboard.
//
// Needs: CF_ANALYTICS_TOKEN (dashboard secret), CF_ACCOUNT_ID and CF_RUM_SITE_TAG (public vars).
// Returns null when unconfigured or on any error — the admin page then shows a short connect note.
import { env } from './env';

export interface CfDimCount { label: string; count: number }
export interface CfTraffic {
  pageViews: number;
  visits: number;
  byDay: { date: string; views: number; visits: number }[];
  topPages: CfDimCount[];
  topReferrers: CfDimCount[];
  countries: CfDimCount[];
  devices: CfDimCount[];
  browsers: CfDimCount[];
}

const GQL = `query($acct:String!,$tag:String!,$s:String!,$e:String!){
  viewer{ accounts(filter:{accountTag:$acct}){
    total: rumPageloadEventsAdaptiveGroups(filter:{siteTag:$tag,date_geq:$s,date_leq:$e},limit:1){ count sum{visits} }
    byDay: rumPageloadEventsAdaptiveGroups(filter:{siteTag:$tag,date_geq:$s,date_leq:$e},limit:400,orderBy:[date_ASC]){ count sum{visits} dimensions{date} }
    byPage: rumPageloadEventsAdaptiveGroups(filter:{siteTag:$tag,date_geq:$s,date_leq:$e},limit:20,orderBy:[count_DESC]){ count dimensions{requestPath} }
    byRef: rumPageloadEventsAdaptiveGroups(filter:{siteTag:$tag,date_geq:$s,date_leq:$e},limit:20,orderBy:[count_DESC]){ count dimensions{refererHost} }
    byCountry: rumPageloadEventsAdaptiveGroups(filter:{siteTag:$tag,date_geq:$s,date_leq:$e},limit:20,orderBy:[count_DESC]){ count dimensions{countryName} }
    byDevice: rumPageloadEventsAdaptiveGroups(filter:{siteTag:$tag,date_geq:$s,date_leq:$e},limit:10,orderBy:[count_DESC]){ count dimensions{deviceType} }
    byBrowser: rumPageloadEventsAdaptiveGroups(filter:{siteTag:$tag,date_geq:$s,date_leq:$e},limit:10,orderBy:[count_DESC]){ count dimensions{userAgentBrowser} }
  }}
}`;

type Group = { count: number; sum?: { visits: number }; dimensions?: Record<string, string> };
const dims = (rows: Group[] | undefined, key: string, blankLabel?: string): CfDimCount[] =>
  (rows ?? []).map((r) => ({ label: (r.dimensions?.[key] || '').trim() || (blankLabel ?? '—'), count: r.count }));

export function cfConfigured(): boolean {
  return !!(env.CF_ANALYTICS_TOKEN && env.CF_ACCOUNT_ID && env.CF_RUM_SITE_TAG);
}

export async function cfTraffic(days: number): Promise<CfTraffic | null> {
  if (!cfConfigured()) return null;
  const day = 86400000;
  const e = new Date().toISOString().slice(0, 10);
  const s = new Date(Date.now() - (days - 1) * day).toISOString().slice(0, 10);
  try {
    const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CF_ANALYTICS_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query: GQL, variables: { acct: env.CF_ACCOUNT_ID, tag: env.CF_RUM_SITE_TAG, s, e } }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { viewer?: { accounts?: [Record<string, Group[]>] } }; errors?: unknown };
    if ((j as { errors?: unknown }).errors) return null;
    const a = j.data?.viewer?.accounts?.[0];
    if (!a) return null;
    const total = (a.total as Group[])?.[0];
    return {
      pageViews: total?.count ?? 0,
      visits: total?.sum?.visits ?? 0,
      byDay: (a.byDay as Group[] ?? []).map((r) => ({ date: r.dimensions?.date ?? '', views: r.count, visits: r.sum?.visits ?? 0 })),
      topPages: dims(a.byPage, 'requestPath'),
      topReferrers: dims(a.byRef, 'refererHost', 'Direct / none'),
      countries: dims(a.byCountry, 'countryName'),
      devices: dims(a.byDevice, 'deviceType'),
      browsers: dims(a.byBrowser, 'userAgentBrowser'),
    };
  } catch {
    return null;
  }
}
