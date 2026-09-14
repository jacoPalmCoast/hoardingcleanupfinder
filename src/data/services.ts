export interface Service {
  slug: string;
  name: string;
  short: string;
  description: string;
  keywords: string[];
}

export const SERVICES: Service[] = [
  {
    slug: 'hoarding-cleanup',
    name: 'Hoarding cleanup',
    short: 'Hoarding',
    description:
      'Sorting, removal, deep cleaning and sanitizing of homes affected by hoarding. Good companies work with the resident, not around them, and coordinate with family or a case worker.',
    keywords: ['hoarding', 'hoarder', 'clutter', 'gross filth', 'animal hoarding'],
  },
  {
    slug: 'biohazard-cleanup',
    name: 'Biohazard cleanup',
    short: 'Biohazard',
    description:
      'Blood, bodily fluids, sewage, chemical and infectious material cleanup and disinfection, including crime and trauma scenes. Usually certified and often billed to insurance.',
    keywords: ['biohazard', 'trauma', 'crime scene', 'blood', 'sewage', 'remediation'],
  },
  {
    slug: 'unattended-death-cleanup',
    name: 'Unattended death cleanup',
    short: 'Unattended death',
    description:
      'Discreet remediation after a death that was not discovered right away. Includes decomposition odor removal and disposal of affected materials. Often covered by homeowner insurance.',
    keywords: ['unattended death', 'death cleanup', 'decomposition', 'odor'],
  },
  {
    slug: 'estate-cleanout',
    name: 'Estate cleanout',
    short: 'Estate cleanout',
    description:
      'Clearing a home after a death or a move to care, including sorting keepsakes, donation, hauling and a final clean so the property can be sold or rented.',
    keywords: ['estate', 'cleanout', 'clean out', 'junk removal', 'haul'],
  },
];

export const SERVICE_BY_SLUG: Record<string, Service> = Object.assign(Object.create(null), Object.fromEntries(SERVICES.map((s) => [s.slug, s])));
export const isService = (s: string): boolean => Object.hasOwn(SERVICE_BY_SLUG, s);

export function inferServices(text: string): string[] {
  const t = text.toLowerCase();
  const out = SERVICES.filter((s) => s.keywords.some((k) => t.includes(k))).map((s) => s.slug);
  return out.length ? out : ['hoarding-cleanup'];
}
