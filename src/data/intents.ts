// Search intents: the questions people ask before hiring, answered with local facts.
// Rendered as visible FAQ sections and as FAQPage schema on metro, service-in-metro,
// service and state pages. Every answer is templated from real numbers for that page
// (listing counts, verified counts, 24-hour counts, state rules) so no two metro pages
// carry the same text — that is what keeps this on the right side of Google's
// scaled-content policy and what makes a passage citable by an LLM.
//
// Question set curated 2026-09-14 from Google People-Also-Ask / related searches for the
// four services plus our own search-box logs. Keep answers factual; ranges are national
// and stated as such.

export interface IntentCtx {
  city?: string;        // metro name; absent on state/service pages
  state: string;        // 'FL'
  stateName: string;    // 'Florida'
  n: number;            // active listings on this page
  verified: number;     // verified listings on this page
  hours24: number;      // listings flagged 24-hour
  stateNote: string;    // from stateNotes
  service?: string;     // service slug when on a service page
}

export interface Intent {
  id: string;
  services: string[];   // which service pages it belongs on ('*' = all incl. metro overview)
  scope: ('metro' | 'service' | 'state')[];
  q: (c: IntentCtx) => string;
  a: (c: IntentCtx) => string;
}

const where = (c: IntentCtx) => (c.city ? `${c.city}, ${c.state}` : c.stateName);
const near = (c: IntentCtx) => (c.city ? `in ${c.city}` : `in ${c.stateName}`);
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : w.endsWith('y') ? w.slice(0, -1) + 'ies' : w + 's'}`;
const COST = {
  'hoarding-cleanup': { low: 1500, high: 5000, unit: 'for a typical home; severe cases run $10,000 to $25,000' },
  'biohazard-cleanup': { low: 1500, high: 6000, unit: 'for a single room; large or multi-room scenes run higher' },
  'unattended-death-cleanup': { low: 2000, high: 8000, unit: 'depending on how long the body went undiscovered and how much material must be removed' },
  'estate-cleanout': { low: 800, high: 4000, unit: 'for a full house, priced mostly by truckload' },
} as const;
const money = (n: number) => '$' + n.toLocaleString('en-US');

export const INTENTS: Intent[] = [
  // ---- cross-service / metro overview ----
  {
    id: 'cost-hoarding',
    services: ['*', 'hoarding-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: (c) => `How much does hoarding cleanup cost ${near(c)}?`,
    a: (c) => `Nationally, hoarding cleanup runs ${money(COST['hoarding-cleanup'].low)} to ${money(COST['hoarding-cleanup'].high)} ${COST['hoarding-cleanup'].unit}. Prices ${near(c)} follow local labor and landfill fees. Companies quote by the day or by the truckload plus disposal, with a surcharge for biohazard. Get a written estimate after a walk-through; do not accept a phone price for more than one room. ${c.n >= 2 ? `The ${plural(c.n, 'company')} listed here will each give an estimate, so ask two.` : ''}`.trim(),
  },
  {
    id: 'how-many',
    services: ['*'],
    scope: ['metro'],
    q: (c) => `How many hoarding cleanup companies serve ${where(c)}?`,
    a: (c) => `This page lists ${plural(c.n, 'company')} that serve ${c.city} and the surrounding area${c.verified ? `, ${c.verified} of them verified by us (working phone, real website, at least three public reviews)` : ''}. ${c.hours24 ? `${c.hours24} advertise 24-hour availability.` : ''} Featured companies pay for placement and are labeled; everyone else is ordered by verification and review count.`.trim(),
  },
  {
    id: 'insurance',
    services: ['*', 'hoarding-cleanup', 'biohazard-cleanup', 'unattended-death-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: (c) => `Does homeowner insurance cover cleanup ${near(c)}?`,
    a: () => `Usually not for hoarding on its own. Most policies exclude damage from neglect. Insurance often does cover the biohazard portion after a death, and sometimes covers damage from a fire, burst pipe or animal infestation that the clutter made worse. For an unattended death, ask the company whether it bills the insurer directly; many biohazard firms do. Get the claim number before work starts.`,
  },
  {
    id: 'speed',
    services: ['*', 'biohazard-cleanup', 'unattended-death-cleanup'],
    scope: ['metro', 'service'],
    q: (c) => `How fast can a crew get to a property ${near(c)}?`,
    a: (c) => `Biohazard and unattended death jobs are usually same-day or next-day; ${c.hours24 ? `${plural(c.hours24, 'company')} on this page list 24-hour availability.` : 'ask about after-hours response when you call.'} Hoarding and estate cleanouts are scheduled, typically within one to two weeks, and a large job takes two to five working days on site.`,
  },
  {
    id: 'resident',
    services: ['*', 'hoarding-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: () => `Can the cleanup happen while the person still lives in the home?`,
    a: () => `Yes, and with hoarding it usually should. Experienced crews sort with the resident, set a "keep" area, and work at a pace the person can tolerate; clearing a home behind someone's back is the fastest way to make the hoarding worse. If Adult Protective Services or a case manager is involved, tell the company so they can coordinate.`,
  },
  {
    id: 'confidential',
    services: ['*', 'hoarding-cleanup', 'unattended-death-cleanup'],
    scope: ['metro', 'service'],
    q: (c) => `Is hoarding cleanup ${near(c)} confidential?`,
    a: () => `Reputable companies treat it that way: unmarked or plainly marked trucks on request, crews that do not discuss the job with neighbors, and no photos published without written consent. Ask directly; it is a fair question and a company that hesitates is the wrong one. Listings here show "unmarked vehicles" when the owner has confirmed it.`,
  },
  {
    id: 'licensing',
    services: ['*', 'biohazard-cleanup', 'unattended-death-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: (c) => `What licenses or certifications should a cleanup company ${near(c)} have?`,
    a: (c) => `${c.stateNote} Beyond state rules, look for OSHA bloodborne-pathogen training and, for trauma and death scenes, ABRA membership or IICRC certification. Certifications shown on a listing here were entered by the company owner.`,
  },
  {
    id: 'whats-included',
    services: ['*', 'hoarding-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: () => `What does a hoarding cleanup include?`,
    a: () => `Sorting (keep, donate, recycle, trash), removal and hauling, disposal fees, and a basic clean of the emptied rooms. Deep cleaning, deodorizing, pest treatment, carpet removal and repairs are usually separate lines. Ask whether the crew will look for documents, cash, jewelry and photos before anything goes in the truck; say so up front and expect to pay for the extra hours.`,
  },
  {
    id: 'vs-junk',
    services: ['*', 'estate-cleanout', 'hoarding-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: () => `What is the difference between hoarding cleanup and junk removal?`,
    a: () => `Junk removal hauls what you point at. Hoarding cleanup adds sorting with the resident, biohazard handling, protective gear, legal disposal of contaminated material, and a final clean. Many junk haulers now advertise hoarding cleanup; the test is whether they can explain how they work with the resident and where sharps, animal waste and mold go.`,
  },
  {
    id: 'levels',
    services: ['*', 'hoarding-cleanup'],
    scope: ['service', 'state'],
    q: () => `What are hoarding levels 1 to 5, and how do they change the price?`,
    a: () => `The Clutter-Hoarding Scale runs from level 1 (clutter, all doors and stairs usable, no odor) to level 5 (structural damage, human or animal waste, rooms unusable). Levels 1–2 are often a one-day job under $2,000. Level 3 adds visible clutter outside, one unusable room and some odor, typically $3,000–$6,000. Levels 4–5 need protective gear, biohazard disposal and sometimes repairs, and run $8,000–$25,000 or more.`,
  },
  {
    id: 'free-help',
    services: ['*', 'hoarding-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: (c) => `Is there free or low-cost hoarding cleanup help ${near(c)}?`,
    a: (c) => `Sometimes. Start with the county Area Agency on Aging or Adult Protective Services ${near(c)}; several run hoarding task forces and can fund or arrange a cleanup for an older or disabled resident. Code enforcement can sometimes order and pay for an abatement, though that comes with a lien. Charities such as Catholic Charities and local senior services occasionally help. Companies on this page may offer payment plans; ask.`,
  },
  {
    id: 'landlord',
    services: ['*', 'hoarding-cleanup', 'estate-cleanout'],
    scope: ['metro', 'service', 'state'],
    q: () => `Can a landlord hire a company to clean out a tenant's hoarded apartment?`,
    a: (c) => `Only after the lease ends, the tenant is lawfully evicted, or the tenant agrees in writing. Hoarding disorder is a recognized disability, so a fair-housing accommodation request may come first; document the safety issues and offer a reasonable cleanup timeline. Once the unit is legally vacant, an estate or hoarding cleanout company ${near(c)} can clear it in one to three days. This is general information, not legal advice.`,
  },
  // ---- biohazard ----
  {
    id: 'cost-bio',
    services: ['biohazard-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: (c) => `How much does biohazard cleanup cost ${near(c)}?`,
    a: () => `Nationally, ${money(COST['biohazard-cleanup'].low)} to ${money(COST['biohazard-cleanup'].high)} ${COST['biohazard-cleanup'].unit}. The cost driver is the volume of contaminated material that must be removed and disposed of as regulated medical waste, plus disinfection and any structural removal (subfloor, drywall). Most companies will bill homeowner insurance directly for trauma scenes.`,
  },
  {
    id: 'who-pays-crime',
    services: ['biohazard-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: () => `Who pays for crime scene cleanup?`,
    a: () => `The property owner is responsible, not the police or the city. Homeowner or renter insurance usually covers it under the property-damage section. Many states have a crime victim compensation program that reimburses cleanup after a violent crime; ask the company, they deal with these claims regularly.`,
  },
  // ---- unattended death ----
  {
    id: 'cost-death',
    services: ['unattended-death-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: (c) => `What does unattended death cleanup cost ${near(c)}?`,
    a: () => `Nationally, ${money(COST['unattended-death-cleanup'].low)} to ${money(COST['unattended-death-cleanup'].high)} ${COST['unattended-death-cleanup'].unit}. Odor and fluids migrate into flooring and subfloor, so a job discovered after several weeks costs more than one found in days. Homeowner insurance usually covers it; the company can typically bill the insurer directly.`,
  },
  {
    id: 'death-steps',
    services: ['unattended-death-cleanup'],
    scope: ['metro', 'service', 'state'],
    q: () => `What happens after an unattended death is found?`,
    a: () => `Police and the medical examiner release the scene first, usually within a day. Only then can a remediation company enter. Do not clean anything yourself; decomposition fluids are a biohazard and a normal cleaner will not remove the odor. Call the insurer, then a company from this page; most respond within hours.`,
  },
  // ---- estate cleanout ----
  {
    id: 'cost-estate',
    services: ['estate-cleanout'],
    scope: ['metro', 'service', 'state'],
    q: (c) => `How much does an estate cleanout cost ${near(c)}?`,
    a: () => `Nationally, ${money(COST['estate-cleanout'].low)} to ${money(COST['estate-cleanout'].high)} ${COST['estate-cleanout'].unit}. A three-bedroom home is usually two to four truckloads. Companies that resell or donate items may credit part of the value against the bill; ask. Hoarded or contaminated homes are priced as hoarding cleanup instead.`,
  },
  {
    id: 'estate-what-to-keep',
    services: ['estate-cleanout'],
    scope: ['metro', 'service', 'state'],
    q: () => `What should be removed before an estate cleanout crew arrives?`,
    a: () => `Documents (will, deeds, tax records, insurance), cash, jewelry, medications, firearms, photos and anything with sentimental value. Walk the property once with a family member. Tell the company what to set aside if you cannot finish; good crews will bag paperwork and valuables separately rather than throw them out.`,
  },
  {
    id: 'estate-executor',
    services: ['estate-cleanout'],
    scope: ['service', 'state'],
    q: () => `Can an executor hire an estate cleanout company before probate closes?`,
    a: () => `Generally yes, once the executor has letters testamentary (or the equivalent). Cleanout is a normal expense of administering the estate and is paid from estate funds. Keep the invoice and photograph valuable items before removal in case a beneficiary asks. This is general information, not legal advice.`,
  },
];

export function intentsFor(scope: 'metro' | 'service' | 'state', service: string | undefined, c: IntentCtx, max = 8): { q: string; a: string }[] {
  const key = service ?? '*';
  return INTENTS.filter((i) => i.scope.includes(scope) && i.services.includes(key))
    .slice(0, max)
    .map((i) => ({ q: i.q(c), a: i.a(c).replace(/\s+/g, ' ').trim() }));
}

/** Listing-specific questions built from the listing's own attributes. */
export function listingIntents(l: { name: string; city: string; state: string; phone: string | null; website: string | null }, services: string[], a: { hours24: boolean; free_estimate: boolean; insurance_billing: boolean; discreet: boolean; service_area: string[] }, serviceNames: string[]): { q: string; a: string }[] {
  const out: { q: string; a: string }[] = [];
  out.push({
    q: `What services does ${l.name} offer in ${l.city}, ${l.state}?`,
    a: `${l.name} is listed for ${serviceNames.join(', ').toLowerCase()} in ${l.city}, ${l.state}${a.service_area.length ? `, and also serves ${a.service_area.slice(0, 6).join(', ')}` : ''}.`,
  });
  out.push({
    q: `Is ${l.name} available 24 hours?`,
    a: a.hours24 ? `Yes. ${l.name} lists 24-hour, 7-day availability, which matters for biohazard and unattended death calls.` : `${l.name} has not confirmed 24-hour availability on this listing. Call to ask about after-hours response.`,
  });
  out.push({
    q: `How do I get a quote from ${l.name}?`,
    a: `${l.phone ? `Call ${l.name} directly, or use` : 'Use'} the request form on this page and we pass it to the company at no charge.${a.free_estimate ? ' The company offers free on-site estimates.' : ' Ask for a written estimate after a walk-through.'}${a.insurance_billing ? ' It can bill homeowner insurance directly for covered work.' : ''}${a.discreet ? ' Unmarked vehicles are available on request.' : ''}`,
  });
  return out;
}
