// Schema.org builders. Every page passes an array of graph nodes to <Base jsonld>; the
// layout wraps them in one @graph so a page can carry ItemList + FAQPage + WebPage.
import { env } from './env';
import type { Listing } from './db';
import type { Attrs } from '../data/attrs';
import { CERT_BY_SLUG } from '../data/attrs';
import { SERVICE_BY_SLUG } from '../data/services';

export const ORG_ID = () => `${env.SITE_URL}/#organization`;
export const SITE_ID = () => `${env.SITE_URL}/#website`;

export function orgSchema() {
  return {
    '@type': 'Organization',
    '@id': ORG_ID(),
    name: env.SITE_NAME,
    url: env.SITE_URL,
    logo: `${env.SITE_URL}/favicon.svg`,
    description: 'Independent national directory of hoarding, biohazard, unattended death and estate cleanup companies in the United States.',
    knowsAbout: ['hoarding cleanup', 'biohazard cleanup', 'unattended death cleanup', 'estate cleanout', 'crime scene cleanup', 'gross filth cleaning'],
  };
}

export function websiteSchema() {
  return {
    '@type': 'WebSite',
    '@id': SITE_ID(),
    url: env.SITE_URL,
    name: env.SITE_NAME,
    publisher: { '@id': ORG_ID() },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${env.SITE_URL}/search?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function faqSchema(items: { q: string; a: string }[]) {
  if (!items.length) return null;
  return {
    '@type': 'FAQPage',
    mainEntity: items.map((it) => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } })),
  };
}

export function webPageSchema(url: string, name: string, description: string, opts: { speakable?: boolean; dateModified?: string } = {}) {
  const node: Record<string, unknown> = {
    '@type': 'WebPage',
    '@id': url,
    url,
    name,
    description,
    isPartOf: { '@id': SITE_ID() },
    publisher: { '@id': ORG_ID() },
  };
  if (opts.speakable) node.speakable = { '@type': 'SpeakableSpecification', cssSelector: ['.lede', '.speakable'] };
  if (opts.dateModified) node.dateModified = opts.dateModified;
  return node;
}

export function breadcrumbSchema(items: { name: string; url?: string }[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, ...(it.url ? { item: it.url } : {}) })),
  };
}

export function listingSchema(l: Listing, services: string[], a: Attrs, faq: { q: string; a: string }[]) {
  const url = `${env.SITE_URL}/company/${l.slug}`;
  const node: Record<string, unknown> = {
    '@type': 'LocalBusiness',
    '@id': `${url}#business`,
    name: l.name,
    url,
    telephone: l.phone ?? undefined,
    address: { '@type': 'PostalAddress', streetAddress: l.address ?? undefined, addressLocality: l.city, addressRegion: l.state, postalCode: l.zip ?? undefined, addressCountry: 'US' },
    description: l.description ?? undefined,
    areaServed: [{ '@type': 'City', name: `${l.city}, ${l.state}` }, ...a.service_area.map((c) => ({ '@type': 'City', name: `${c}, ${l.state}` }))],
    knowsAbout: services.map((s) => SERVICE_BY_SLUG[s]?.name.toLowerCase()).filter(Boolean),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Services',
      itemListElement: services.filter((s) => SERVICE_BY_SLUG[s]).map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: SERVICE_BY_SLUG[s].name, url: `${env.SITE_URL}/services/${s}` } })),
    },
  };
  if (l.website) node.sameAs = l.website;
  if (l.lat && l.lng) node.geo = { '@type': 'GeoCoordinates', latitude: l.lat, longitude: l.lng };
  if (a.hours24) node.openingHours = 'Mo-Su 00:00-24:00';
  if (a.certifications.length) node.hasCredential = a.certifications.map((c) => ({ '@type': 'EducationalOccupationalCredential', name: CERT_BY_SLUG[c].name }));
  if (a.languages.length) node.contactPoint = { '@type': 'ContactPoint', contactType: 'customer service', telephone: l.phone ?? undefined, availableLanguage: a.languages };
  // No aggregateRating: the ratings come from Google, not from reviews collected on this site,
  // and Google's review-snippet policy requires the latter.
  const graph: unknown[] = [node];
  const f = faqSchema(faq);
  if (f) graph.push(f);
  return graph;
}
