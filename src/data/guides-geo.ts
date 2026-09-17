// GEO/answer layer for the guides: a short quick-answer `summary` for every guide (the
// passage search engines feature and LLMs quote), plus supplemental `faq` for the ten
// original guides that shipped without one. Merged onto the guides in guides.ts without
// touching their prose. A guide that already has its own faq keeps it; summaries always apply.
export interface GuideGeo { summary: string; faq?: { q: string; a: string }[] }

export const GUIDE_GEO: Record<string, GuideGeo> = {
  // ---- original 10 (no faq of their own) ----
  'hoarding-cleanup-cost': {
    summary: 'Most hoarding cleanups cost <strong>$1,500 to $5,000</strong> for a typical home; a single cluttered room can be under $1,000, and severe cases with biohazard or structural damage run <strong>$10,000 to $25,000</strong>. Price is driven mostly by volume (truckloads), biohazard handling, sorting time and access. Always get a written estimate after an on-site walk-through.',
    faq: [
      { q: 'How much does hoarding cleanup cost?', a: 'Nationally $1,500 to $5,000 for a typical home. Small single-room jobs can be under $1,000; severe cases with biohazard or structural damage run $10,000 to $25,000 or more.' },
      { q: 'Why is hoarding cleanup so expensive?', a: 'The cost is mostly labor and disposal: the number of truckloads, biohazard handling and legal disposal, time spent sorting keepsakes with the resident, and access (stairs, no driveway, long carries).' },
      { q: 'Does insurance pay for it?', a: 'Rarely for the hoarding itself, which insurers treat as neglect. It often covers the biohazard portion after a death, or damage from a sudden event like a burst pipe or fire that the clutter made worse.' },
    ],
  },
  'how-to-choose-a-hoarding-cleanup-company': {
    summary: 'Choose a company by how it answers six questions: prior hoarding experience, how it works <em>with</em> the resident, biohazard training, insurance, where the waste legally goes, and whether it gives a written estimate after a walk-through. Walk away from a firm price over the phone, same-day pressure, cash-only, or no physical address.',
    faq: [
      { q: 'What should I ask a hoarding cleanup company?', a: 'How many hoarding jobs they have done, how they work with the resident, whether their crew has bloodborne-pathogen training, what insurance they carry, where the waste goes, and whether they give a written estimate after a walk-through.' },
      { q: 'What are the red flags?', a: 'A firm price over the phone without seeing the property, pressure to sign the same day, cash only, no physical address, reviews that all appeared in one month, and a quote far below everyone else’s (the missing money is usually the disposal fee).' },
      { q: 'Is a junk removal company good enough?', a: 'Only for light clutter with no biohazard. Hoarding cleanup adds sorting with the resident, protective gear, legal disposal of contaminated material and a final clean — ask how they handle each.' },
    ],
  },
  'talking-to-a-parent-about-hoarding': {
    summary: 'Lead with safety, not stuff: “I’m worried you could fall” lands better than “you have too much.” Pick one concrete goal, let the person keep control, bring a professional in as a helper rather than an enforcer, and expect several conversations. Surprise cleanouts and ultimatums almost always backfire.',
    faq: [
      { q: 'How do I talk to a parent about their hoarding?', a: 'Lead with safety rather than the mess, pick one concrete goal (a clear path to the bathroom, a working stove), let them keep control of decisions, and avoid words like “filthy” or “junk.” Expect it to take several conversations.' },
      { q: 'What should I not do?', a: 'Do not stage a surprise cleanout while they are out, issue ultimatums, or bring a large group. Each tends to cause a shutdown and can end access to the home entirely.' },
      { q: 'When should I involve a professional?', a: 'If there is a fire hazard, no working plumbing, or animals in distress, Adult Protective Services or code enforcement may need to be involved. A therapist who treats hoarding disorder can help both the person and the family.' },
    ],
  },
  'unattended-death-cleanup': {
    summary: 'After a death that was not found right away, the home needs <strong>biohazard remediation, not cleaning</strong> — fluids and odor penetrate flooring, subfloor and drywall. The coroner releases the scene first; then a certified crew removes affected materials, disinfects and treats odor. Homeowner and many renter policies cover it, and companies usually bill the insurer directly.',
    faq: [
      { q: 'Who cleans up after an unattended death?', a: 'A certified biohazard remediation company, not family or a general cleaner. Porous materials that fluids reach cannot be reliably disinfected and must be removed.' },
      { q: 'Does insurance cover unattended death cleanup?', a: 'Homeowner and many renter policies cover it under property damage, and the remediation company will usually bill the insurer directly and document the claim.' },
      { q: 'How much does it cost?', a: 'Nationally about $2,000 to $8,000, depending on how long the death went undiscovered and how much flooring, subfloor and drywall must be removed.' },
    ],
  },
  'biohazard-cleanup-what-it-covers': {
    summary: 'Biohazard cleanup is the removal and disinfection of materials that can carry disease — blood, bodily fluids, sewage, sharps, and anything they soaked into. Technicians in protective gear remove porous materials rather than clean them in place, apply hospital-grade disinfectant, treat odor at the source, and dispose of waste through a licensed medical-waste route with documentation.',
    faq: [
      { q: 'What counts as biohazard cleanup?', a: 'A death, serious injury, sewage backup, animal hoarding, drug-contaminated homes, and long-term neglect — anything involving blood, bodily fluids, human or animal waste, sewage or sharps.' },
      { q: 'How is it different from regular cleaning?', a: 'A housekeeping crew lacks the training, disinfectants and disposal route, and in many states cannot legally transport the waste. Bleach on a stained carpet does nothing about what is underneath it.' },
      { q: 'How much does biohazard cleanup cost?', a: 'Usually $1,500 to $6,000 for a single room, billed by the hour per technician plus disposal and materials; large or multi-room scenes run higher. Insurance often covers sudden causes.' },
    ],
  },
  'estate-cleanout-guide': {
    summary: 'Clear a home in the right order: pull documents first (wills, deeds, titles, statements), give family a fixed window for keepsakes, sell or donate what has value, then hire a cleanout crew for the rest. A typical single-family home costs <strong>$1,000 to $3,000</strong> to clear — more with a garage, attic or hoarding conditions.',
    faq: [
      { q: 'What is the first step in an estate cleanout?', a: 'Find the documents before anyone else is in the house: wills, deeds, titles, account statements, tax returns and insurance policies. Check desks, closets, freezers and under mattresses.' },
      { q: 'How much does an estate cleanout cost?', a: 'A typical single-family home is $1,000 to $3,000, priced mostly by truckload; more with a garage, attic, or hoarding or biohazard conditions.' },
      { q: 'Can an executor start before probate closes?', a: 'Generally yes, once they have letters testamentary. Cleanout is a normal administration expense paid from estate funds; keep the invoice and photograph valuables first.' },
    ],
  },
  'hoarding-and-insurance': {
    summary: 'Insurance rarely pays for hoarding cleanup itself — policies exclude gradual damage and neglect. It <strong>often</strong> pays for what the hoarding caused or hid: biohazard remediation after a death, or a sudden event like a burst pipe, fire or sewage backup. Photograph everything first and have the company itemize the covered part separately.',
    faq: [
      { q: 'Does homeowner insurance cover hoarding cleanup?', a: 'Not the cleanout itself, which is treated as neglect. It often covers biohazard remediation after a death, and sudden events like a burst pipe, fire or sewage backup, including the cleanup needed to reach the damage.' },
      { q: 'How do I improve my chances of a claim being paid?', a: 'Photograph everything before any work starts, describe the sudden event rather than the hoarding when you call, and have the company separate the covered work (biohazard, water damage) from the uncovered cleanout on the invoice.' },
      { q: 'What if the claim is denied?', a: 'Ask for the specific exclusion in writing. Adjusters sometimes apply the neglect exclusion too broadly, and a second look can change the outcome.' },
    ],
  },
  'animal-hoarding-cleanup': {
    summary: 'A home with many animals is a <strong>biohazard job that starts with the animals, not the house</strong> — ammonia can reach dangerous levels and waste soaks into floors and walls. Animal control or a humane society removes the animals first; then technicians in respirators remove contaminated materials and treat odor. Costs commonly run $3,000 to $10,000 for a house.',
    faq: [
      { q: 'Who do I call first for animal hoarding?', a: 'Animal control or a humane society to remove the animals and bring veterinary help. Most cleanup companies will not start until the animals are out.' },
      { q: 'Why is animal hoarding a biohazard?', a: 'Accumulated waste produces ammonia that can be dangerous to breathe and soaks into carpet, subfloor and drywall, which must be removed rather than cleaned in place.' },
      { q: 'How much does animal hoarding cleanup cost?', a: 'Usually higher than an equivalent hoarding job because of the material removal — commonly $3,000 to $10,000 for a house, sometimes more if an industrial hygienist must sign off.' },
    ],
  },
  'help-for-hoarding-in-older-adults': {
    summary: 'For an older adult who hoards, the cleanup is one piece — the support around it is what keeps the home from filling up again. Start with the county Area Agency on Aging and Adult Protective Services, add a therapist who treats hoarding disorder, and choose a cleanup crew that works <em>with</em> the resident. Pick one family member as the single point of contact.',
    faq: [
      { q: 'Where do I get help for an elderly parent who hoards?', a: 'Start with the county Area Agency on Aging and Adult Protective Services; many run hoarding task forces and can fund or arrange a cleanup. Add a therapist who treats hoarding disorder and a cleanup crew that works with the resident.' },
      { q: 'Is there free help available?', a: 'Sometimes — Area Agencies on Aging, Adult Protective Services, and occasionally code enforcement or charities can fund or arrange cleanup for an older or disabled resident at risk.' },
      { q: 'How do we keep it from happening again?', a: 'Plan for ongoing support: cleanup done in stages with the person’s participation lasts far longer than a single clearout, and a follow-up visit from a cleaner or organizer every few months helps.' },
    ],
  },
  'claim-your-listing': {
    summary: 'Every company on this site is listed free. Claim your listing to control the details, add certifications, hours and a service area, and earn an <strong>Owner-managed</strong> badge that ranks above unclaimed listings in the same city. Featured placement ($49/month or $399/year) adds top placement, your full profile and first pick of local quote requests.',
    faq: [
      { q: 'How do I claim my company’s listing?', a: 'Open your listing page, click “Claim this listing,” and confirm a business email with the code we send. You can then edit the description, services, phone, website, hours, certifications, languages and service area.' },
      { q: 'Is claiming free?', a: 'Yes. Claiming and keeping a listing are always free. Featured placement is an optional paid upgrade at $49 a month or $399 a year, cancellable anytime.' },
      { q: 'How do I get verified?', a: 'We mark a listing verified after confirming the phone and website and, where a state registration applies, seeing it. Claiming and sending a certificate of insurance or registration is the fastest route.' },
    ],
  },

  // ---- second batch (already have their own faq) ----
  'hoarding-levels-1-5': {
    summary: 'The Clutter-Hoarding Scale runs from <strong>level 1</strong> (noticeable clutter, everything works, under $500) to <strong>level 5</strong> (not habitable, human or animal waste, $15,000–$25,000+ and a certified biohazard crew). Level 3 is where a hoarding-specific company earns its fee. Tell the company the level so they send the right crew.',
  },
  'who-pays-for-hoarding-cleanup': {
    summary: 'Usually the family or the person who hoards pays, because insurers treat hoarding as neglect. But five other sources can apply: insurance for a sudden event the clutter worsened, the estate, a landlord (then the deposit), public programs (Adult Protective Services, Area Agency on Aging, code enforcement), and company payment plans. Spend twenty minutes on calls before signing.',
  },
  'free-and-low-cost-hoarding-help': {
    summary: 'Free or low-cost help exists but takes legwork: start with the county Area Agency on Aging and Adult Protective Services, then local hoarding task forces, code-enforcement abatement (which can place a lien), charities, and cleanup companies that offer payment plans or phased jobs. Older and disabled residents at risk have the most options.',
  },
  'how-to-help-a-parent-who-hoards': {
    summary: 'Help a parent by leading with safety over stuff, agreeing on one concrete goal, and keeping them in control of decisions. Bring in a cleanup crew that meets the resident first without a truck outside, and line up ongoing support — a therapist who treats hoarding disorder and a follow-up plan — so the home does not refill.',
  },
  'hoarding-cleanup-vs-junk-removal': {
    summary: 'Junk removal hauls what you point at. Hoarding cleanup adds sorting <em>with</em> the resident, biohazard handling, protective gear, legal disposal of contaminated material, and a final clean. Many junk haulers advertise hoarding work — the test is whether they can explain how they work with the resident and where sharps, animal waste and mold legally go.',
  },
  'how-long-does-hoarding-cleanup-take': {
    summary: 'A typical hoarded home takes <strong>two to five working days</strong> on site; a light single-room job can be one day, and severe level-4 or level-5 homes with biohazard can run a week or more. Sorting with the resident, biohazard handling and access all extend it. Scheduling usually happens within one to two weeks of the estimate.',
  },
  'hoarding-cleanup-checklist': {
    summary: 'Before the crew arrives: remove documents, cash, jewelry, medications, firearms and photos; decide your “keep” priorities; confirm insurance and who pays; and clear parking and a path to the door. During the job, sort in keep/donate/recycle/trash zones and keep one family member as the decision-maker.',
  },
  'landlords-tenants-and-hoarding': {
    summary: 'A landlord generally cannot force a cleanup while a tenant is in place. Hoarding disorder is a recognized disability, so a fair-housing accommodation request — documenting safety issues and offering a reasonable timeline — usually comes first. Once the unit is lawfully vacant, an estate or hoarding cleanout crew can clear it in one to three days. This is general information, not legal advice.',
  },
  'crime-scene-cleanup-who-pays-and-who-does-it': {
    summary: 'The property owner is responsible for crime scene cleanup, not the police or the city, and homeowner or renter insurance usually covers it under property damage. Many states have a crime-victim compensation program that reimburses cleanup after a violent crime. A certified biohazard company does the work — they deal with these claims regularly.',
  },
  'biohazard-cleanup-cost': {
    summary: 'Biohazard cleanup runs about <strong>$1,500 to $6,000</strong> for a single room, billed by the hour per technician plus disposal and materials; large or multi-room scenes run higher. The cost driver is the volume of contaminated material removed as regulated medical waste, plus disinfection and any structural tear-out. Insurance often covers sudden causes.',
  },
  'what-happens-after-an-unattended-death': {
    summary: 'Police and the medical examiner release the scene first, usually within a day. Only then can a remediation company enter — do not clean anything yourself, as decomposition fluids are a biohazard and normal cleaners will not remove the odor. Call the insurer, then a certified company; most respond within hours and bill the policy directly.',
  },
  'estate-cleanout-cost': {
    summary: 'An estate cleanout runs about <strong>$800 to $4,000</strong> for a full house, priced mostly by truckload — a three-bedroom home is usually two to four loads. Companies that resell or donate items may credit part of the value against the bill. Hoarded or contaminated homes are priced as hoarding cleanup instead.',
  },
  'estate-cleanout-checklist-for-executors': {
    summary: 'As executor, work in order: secure documents and valuables first, give family a written window for keepsakes, sell or donate items of value, then hire a cleanout crew for the rest. Keep every invoice, photograph valuables before removal, and confirm the crew sets aside anything of value they find.',
  },
  'hoarding-cleanup-after-a-death': {
    summary: 'A death in a hoarded home usually needs two crews: a biohazard remediation company first if the death was unattended, then a hoarding or estate cleanout crew for the rest. The estate typically pays, and insurance may cover the biohazard portion. Find the documents and valuables before the cleanout begins.',
  },
  'can-you-clean-a-hoarder-house-yourself': {
    summary: 'You can DIY a light (level 1–2) hoard with time, dumpsters and help — but not one with biohazard, structural damage, animal waste or mold, which needs protective gear, legal disposal and training. The bigger risk is emotional: clearing a home behind the resident’s back tends to make hoarding worse. Sort <em>with</em> the person, in stages.',
  },
};
