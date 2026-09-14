// Structured listing attributes. Stored as JSON in listings.attrs, rendered as visible
// facts and as schema.org properties. Free-tier owners can edit the FREE set; featured
// owners can edit everything. Every value is validated through parseAttrs() before it
// touches the database or a template — never trust the stored JSON blindly.

export const CERTIFICATIONS = [
  { slug: 'iicrc', name: 'IICRC certified' },
  { slug: 'bloodborne-pathogens', name: 'OSHA bloodborne-pathogen trained' },
  { slug: 'abra', name: 'ABRA member (American Bio Recovery Association)' },
  { slug: 'licensed-insured', name: 'Licensed and insured' },
  { slug: 'bonded', name: 'Bonded' },
  { slug: 'epa-lead-safe', name: 'EPA lead-safe certified' },
  { slug: 'hazwoper', name: 'HAZWOPER trained' },
  { slug: 'trauma-waste-registered', name: 'State-registered trauma waste practitioner' },
] as const;
export type CertSlug = (typeof CERTIFICATIONS)[number]['slug'];
export const CERT_BY_SLUG: Record<string, (typeof CERTIFICATIONS)[number]> = Object.create(null);
for (const c of CERTIFICATIONS) CERT_BY_SLUG[c.slug] = c;

export const LANGUAGES = ['English', 'Spanish', 'Portuguese', 'Chinese', 'Vietnamese', 'Tagalog', 'Korean', 'Russian', 'Arabic', 'French', 'Haitian Creole', 'Polish'] as const;
const LANG_SET = new Set<string>(LANGUAGES);

export interface Attrs {
  hours24: boolean;
  discreet: boolean;          // unmarked vehicles / plain-clothes crew
  financing: boolean;
  insurance_billing: boolean; // will bill homeowner insurance directly
  free_estimate: boolean;
  certifications: CertSlug[];
  languages: string[];
  service_area: string[];     // extra city names served (free: ≤3, featured: ≤40)
  license_no: string;
}

export const FREE_AREA_LIMIT = 3;
export const FEATURED_AREA_LIMIT = 40;

const EMPTY: Attrs = { hours24: false, discreet: false, financing: false, insurance_billing: false, free_estimate: false, certifications: [], languages: [], service_area: [], license_no: '' };

const cleanCity = (s: unknown) => String(s ?? '').replace(/[^A-Za-z .'\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);

export function parseAttrs(json: string | null | undefined): Attrs {
  let raw: any = {};
  try { raw = json ? JSON.parse(json) : {}; } catch { raw = {}; }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) raw = {};
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    hours24: raw.hours24 === true,
    discreet: raw.discreet === true,
    financing: raw.financing === true,
    insurance_billing: raw.insurance_billing === true,
    free_estimate: raw.free_estimate === true,
    certifications: [...new Set(list(raw.certifications).map(String).filter((s) => Object.hasOwn(CERT_BY_SLUG, s)))] as CertSlug[],
    languages: [...new Set(list(raw.languages).map(String).filter((s) => LANG_SET.has(s)))],
    service_area: [...new Set(list(raw.service_area).map(cleanCity).filter(Boolean))].slice(0, FEATURED_AREA_LIMIT),
    license_no: String(raw.license_no ?? '').replace(/[^A-Za-z0-9 \-#]/g, '').trim().slice(0, 40),
  };
}

/** Build Attrs from a submitted form, enforcing the tier the caller passes in. */
export function attrsFromForm(form: FormData, tier: 'free' | 'featured', base: Attrs = EMPTY): Attrs {
  const on = (k: string) => form.get(k) === 'on' || form.get(k) === '1';
  const area = String(form.get('service_area') ?? '')
    .split(/[\n,]/)
    .map(cleanCity)
    .filter(Boolean);
  const out: Attrs = {
    ...base,
    hours24: on('hours24'),
    certifications: [...new Set(form.getAll('certifications').map(String).filter((s) => Object.hasOwn(CERT_BY_SLUG, s)))] as CertSlug[],
    languages: [...new Set(form.getAll('languages').map(String).filter((s) => LANG_SET.has(s)))],
    service_area: [...new Set(area)].slice(0, tier === 'featured' ? FEATURED_AREA_LIMIT : FREE_AREA_LIMIT),
    license_no: String(form.get('license_no') ?? '').replace(/[^A-Za-z0-9 \-#]/g, '').trim().slice(0, 40),
  };
  if (tier === 'featured') {
    out.discreet = on('discreet');
    out.financing = on('financing');
    out.insurance_billing = on('insurance_billing');
    out.free_estimate = on('free_estimate');
  }
  return out;
}

export interface FaqItem { q: string; a: string }
export const CUSTOM_FAQ_LIMIT = 3;

export function parseFaq(json: string | null | undefined): FaqItem[] {
  let raw: any = [];
  try { raw = json ? JSON.parse(json) : []; } catch { raw = []; }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => ({ q: String(x?.q ?? '').trim().slice(0, 160), a: String(x?.a ?? '').trim().slice(0, 600) }))
    .filter((x) => x.q.length >= 8 && x.a.length >= 20)
    .slice(0, CUSTOM_FAQ_LIMIT);
}

export function faqFromForm(form: FormData): FaqItem[] {
  const items: FaqItem[] = [];
  for (let i = 0; i < CUSTOM_FAQ_LIMIT; i++) {
    items.push({ q: String(form.get(`faq_q${i}`) ?? ''), a: String(form.get(`faq_a${i}`) ?? '') });
  }
  return parseFaq(JSON.stringify(items));
}

/** What the public page may show: featured-only flags and cities beyond the free limit are
 *  hidden unless the subscription is live, whatever is stored (Invariant 2 applies at render). */
export function publicAttrs(a: Attrs, featured: boolean): Attrs {
  if (featured) return a;
  return { ...a, discreet: false, financing: false, insurance_billing: false, free_estimate: false, service_area: a.service_area.slice(0, FREE_AREA_LIMIT) };
}

/** Human-readable "facts" rows for a listing page; missing items are shown as gaps on unclaimed listings. */
export function attrFacts(a: Attrs): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: 'Hours', value: a.hours24 ? 'Available 24 hours, 7 days' : 'Call for hours' });
  if (a.certifications.length) rows.push({ label: 'Certifications', value: a.certifications.map((c) => CERT_BY_SLUG[c].name).join(', ') });
  if (a.license_no) rows.push({ label: 'License', value: a.license_no });
  if (a.languages.length) rows.push({ label: 'Languages', value: a.languages.join(', ') });
  if (a.service_area.length) rows.push({ label: 'Also serves', value: a.service_area.join(', ') });
  const flags: string[] = [];
  if (a.free_estimate) flags.push('free on-site estimates');
  if (a.discreet) flags.push('unmarked vehicles');
  if (a.insurance_billing) flags.push('bills insurance directly');
  if (a.financing) flags.push('financing available');
  if (flags.length) rows.push({ label: 'Good to know', value: flags.join(' · ') });
  return rows;
}
