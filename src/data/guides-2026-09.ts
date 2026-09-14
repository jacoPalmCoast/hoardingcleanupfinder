// Second batch of guides (2026-09-14), written against the keyword research in
// data/keyword-research-2026-09-14.md. Each carries a short FAQ that is rendered on the
// page and as FAQPage schema. Cost figures are national ranges.
import type { Guide } from './guides';

export const GUIDES_2026_09: Guide[] = [
  {
    slug: 'hoarding-levels-1-5',
    title: 'Hoarding levels 1 to 5, explained (with what each costs to clean)',
    description: 'The Clutter-Hoarding Scale from level 1 to level 5, what each level looks like, and the realistic cleanup cost and crew time for each.',
    updated: '2026-09-14',
    html: `
<p>Cleanup companies, social workers and code officers all use the Clutter-Hoarding Scale, a five-level rating published by the Institute for Challenging Disorganization. Knowing the level tells you what kind of company you need and roughly what it will cost.</p>
<h2>Level 1</h2>
<p>Clutter is noticeable but every door, stairway and window works. No odor, no pests, normal housekeeping. A cleaning service or the family can handle this. Cost: usually under $500, often nothing beyond a weekend.</p>
<h2>Level 2</h2>
<p>One exit blocked, one major appliance not working, some pet waste or light mildew, clutter on stairs. Still manageable by a junk removal or cleaning company in a day. Cost: $500 to $2,000.</p>
<h2>Level 3</h2>
<p>Clutter visible from outside (porch, yard, cars), one room unusable, odor noticeable at the door, light pest activity, dishes and laundry piled. This is where a hoarding-specific company earns its fee: sorting with the resident, protective gear, and a real disposal route. Cost: $3,000 to $6,000 over two to three days.</p>
<h2>Level 4</h2>
<p>Structural damage (rotting floors, mold), sewage backup or no working bathroom, animal waste in living areas, pathways narrower than a person. Biohazard handling is required. Cost: $6,000 to $15,000 and a week of crew time.</p>
<h2>Level 5</h2>
<p>Home not habitable: human waste, dead animals, fire hazards, utilities off, rooms filled to the ceiling. Often a code enforcement or Adult Protective Services case. Requires a certified biohazard crew and sometimes a structural contractor. Cost: $15,000 to $25,000 or more; some level-5 homes are demolished instead.</p>
<h2>Why the level matters when you call</h2>
<p>Tell the company the level, or describe it in those terms. A junk hauler quoting level-1 prices for a level-4 house will either walk off the job or do it unsafely. Ask what level they are used to; a company that has done a dozen level-4 jobs will say so.</p>`,
    faq: [
      { q: 'What is level 5 hoarding?', a: 'Level 5 is the most severe rating on the Clutter-Hoarding Scale: the home is not habitable, with human or animal waste, structural damage, fire hazards and rooms filled to the ceiling. It needs a certified biohazard crew and typically costs $15,000 to $25,000 or more to clear.' },
      { q: 'How much does level 2 hoarding cleanup cost?', a: 'Level 2 (one blocked exit, some pet waste, clutter on stairs) is usually a one-day job for a junk removal or cleaning company at $500 to $2,000.' },
      { q: 'Who decides the hoarding level?', a: 'Anyone can rate a home against the published scale; cleanup companies do it during the walk-through, and code enforcement or Adult Protective Services use it in case files. There is no official inspector.' },
    ],
  },
  {
    slug: 'who-pays-for-hoarding-cleanup',
    title: 'Who pays for hoarding cleanup?',
    description: 'Whether insurance, the family, the estate, the landlord, or a public program pays for hoarding cleanup, and how to find out before work starts.',
    updated: '2026-09-14',
    html: `
<p>In most cases the family or the person who hoards pays, because homeowner insurance treats hoarding as neglect and excludes it. But there are five other places the money can come from, and it is worth twenty minutes of calls before you sign an estimate.</p>
<h2>1. Homeowner or renter insurance, partially</h2>
<p>The clutter itself is not covered. What is often covered is a sudden event the clutter made worse: a burst pipe, a fire, a roof leak, or a biohazard after a death in the home. Call the insurer, describe the event (not the hoarding), and ask for the claim number before the crew starts. The cleanup company will usually separate the covered work on the invoice.</p>
<h2>2. The estate</h2>
<p>If the resident has died, cleanup is an ordinary administration expense and comes out of the estate before anything is distributed. The executor hires the company and keeps the invoice.</p>
<h2>3. The landlord, then the tenant's deposit</h2>
<p>For a rental, the landlord pays to restore the unit after the tenant leaves and deducts what the law allows from the deposit. A landlord generally cannot force a cleanup while the tenant is in place without going through the lease and, often, a fair-housing accommodation process.</p>
<h2>4. Public programs</h2>
<p>Adult Protective Services, the county Area Agency on Aging, and in some cities a hoarding task force can fund or arrange a cleanup for an older or disabled resident who is at risk. Code enforcement can order an abatement and place a lien on the property for the cost. Ask the company; the good ones know the local programs.</p>
<h2>5. Payment plans and partial jobs</h2>
<p>Most hoarding companies will phase a job: clear the exits and the bathroom now, the rest next month. Several offer financing. A partial job that makes the home safe is better than waiting for the money for a full one.</p>
<p>This is general information, not legal or financial advice; who is liable for a cleanup can depend on state law, the deed and the lease.</p>`,
    faq: [
      { q: 'Is hoarding cleanup covered by insurance?', a: 'Not the hoarding itself; policies exclude neglect. Insurance often covers a sudden event the clutter made worse (fire, burst pipe, roof leak) and usually covers biohazard cleanup after a death. Ask the insurer about the event, not the hoarding.' },
      { q: 'Can a family member be forced to pay for a hoarder\'s cleanup?', a: 'Usually not. In general an adult child is not liable for a parent\'s cleanup unless they own the property or signed for the work, though about half of US states have rarely enforced filial-responsibility laws. Many families pay anyway to protect the parent or the home\'s value. Check with an attorney for your state.' },
      { q: 'Does Medicare or Medicaid pay for hoarding cleanup?', a: 'Medicare does not. Some state Medicaid waiver programs for home- and community-based services fund a one-time cleanup when it keeps someone out of a nursing home; the county Area Agency on Aging can tell you if yours does.' },
    ],
  },
  {
    slug: 'free-and-low-cost-hoarding-help',
    title: 'Free and low-cost hoarding cleanup help, including for seniors',
    description: 'Where to find free or subsidized hoarding cleanup: Adult Protective Services, Area Agencies on Aging, hoarding task forces, charities, and what to ask for.',
    updated: '2026-09-14',
    html: `
<p>There is no national program that pays for hoarding cleanup, but there is a patchwork of local ones, and most families never find them because the agencies do not advertise. Here is where to look, in order.</p>
<h2>Start with the Area Agency on Aging</h2>
<p>Every county in the US is served by one (find yours through the Eldercare Locator, 1-800-677-1116). For a resident over 60 they can arrange a case manager, sometimes a one-time "heavy chore" cleanup, and referrals to local funds. Ask specifically for "hoarding" or "heavy chore" services.</p>
<h2>Adult Protective Services</h2>
<p>If the resident is over 60 or disabled and the home is unsafe (no working bathroom, blocked exits, fire risk), APS can open a case. That sounds frightening; in practice it usually means a social worker, a plan and in some counties funding for a cleanup. It does not mean removal from the home unless there is immediate danger.</p>
<h2>Hoarding task forces</h2>
<p>Dozens of cities and counties run one: fire, code, APS, mental health and a cleanup vendor meet monthly on cases. Search "[county] hoarding task force." They know which local companies discount for referrals.</p>
<h2>Charities and faith groups</h2>
<p>Catholic Charities, Lutheran Social Services, Jewish Family Services, the Salvation Army and local churches sometimes fund or staff a cleanup for a member or a neighbor. Volunteer crews should not handle biohazard; use them for the level-1 and level-2 work and pay a company for the rest.</p>
<h2>Ask the company</h2>
<p>Hoarding companies see hardship every week. Many will phase a job, take a deposit and the rest over months, or do a reduced-scope "safety first" clear (exits, kitchen, bathroom, bedroom) for a fraction of the full price. Say what you can afford; it is a normal conversation for them.</p>
<h2>What is usually not free</h2>
<p>Dumpster fees, biohazard disposal and repairs. Programs that help tend to cover labor, not the landfill. Budget for those even if a program is involved.</p>`,
    faq: [
      { q: 'Is there free hoarding cleanup for seniors?', a: 'Sometimes. The county Area Agency on Aging and Adult Protective Services can fund or arrange a cleanup for an at-risk older adult, and some cities have hoarding task forces with vendor discounts. It is case by case, not an entitlement.' },
      { q: 'Will calling Adult Protective Services get my parent removed from the home?', a: 'Rarely. APS aims to keep people in their homes safely. Removal happens only with immediate danger and, for a competent adult, requires a court process. The usual outcome is a case manager and a cleanup plan.' },
      { q: 'Can a cleanup company do part of a job to save money?', a: 'Yes. Most will do a "safety first" clear of exits, kitchen, bathroom and one bedroom, then phase the rest. Ask for a phased estimate.' },
    ],
  },
  {
    slug: 'how-to-help-a-parent-who-hoards',
    title: 'How to help a parent who hoards (even when they say there is no problem)',
    description: 'Practical steps for adult children: what to say, what never to do, how to get a cleanup started without breaking the relationship, and when to involve a professional.',
    updated: '2026-09-14',
    html: `
<p>The instinct is to show up with a dumpster while they are at the doctor. It is also the single most reliable way to make hoarding worse, lose your parent's trust, and, in many states, expose yourself to a civil claim. What works is slower and less satisfying, but it works.</p>
<h2>Start with safety, not stuff</h2>
<p>Do not argue about the value of things. Pick the three safety issues that matter: can they get out in a fire, does the bathroom work, is the stove clear. Ask to fix those three. Most parents will agree to a path to the door where they would never agree to "cleaning up."</p>
<h2>Use their words</h2>
<p>Many people who hoard reject the word. Use theirs: "the collection," "the paperwork," "the backlog." Say you want to help them get to it, not get rid of it.</p>
<h2>Let them make every decision</h2>
<p>The person who hoards must be the one to say what goes. A professional organizer or a hoarding-experienced cleanup crew will set up keep, donate and discard zones and walk through one box at a time. It is slow. Speed is the enemy here.</p>
<h2>Bring in a third party</h2>
<p>A parent will often accept from a stranger what they refuse from a child. Options in rough order of intensity: a professional organizer, a therapist who treats hoarding disorder (cognitive behavioral therapy has the best evidence), a geriatric care manager, the Area Agency on Aging, a hoarding task force, Adult Protective Services.</p>
<h2>When they are in denial</h2>
<p>You cannot force a competent adult to clean their home. What you can do is document the hazards with dated photos, get the three safety fixes done, get their doctor involved (a fall risk note from a physician changes conversations), and make clear you will not stop visiting. If there is real danger to life, a call to the fire marshal or APS is not a betrayal.</p>
<h2>Hiring the cleanup</h2>
<p>Choose a company that says the words "we work with the resident" without prompting. Ask for a half-day first visit with no truck. Pay for sorting time. See our guide on <a href="/guides/how-to-choose-a-hoarding-cleanup-company">choosing a company</a>.</p>
<p>This is general information, not legal or medical advice. Rules on entering a relative\'s home, power of attorney and guardianship vary by state.</p>`,
    faq: [
      { q: 'Can I legally clean out my parent\'s house without permission?', a: 'Not if they are a competent adult who owns or rents the home. Removing their property without consent can be conversion or trespass. If you hold power of attorney or a guardianship, the terms of that document control.' },
      { q: 'What do you say to a hoarder in denial?', a: 'Skip the label. Focus on three safety fixes (a clear path to the door, a working bathroom, a clear stove) and ask for those. Use their words for the belongings and let them make every keep-or-go decision.' },
      { q: 'Does therapy help with hoarding?', a: 'Cognitive behavioral therapy adapted for hoarding disorder has the strongest evidence, particularly when combined with in-home sessions. Medication alone has weak results. The International OCD Foundation keeps a directory of hoarding-trained therapists.' },
    ],
  },
  {
    slug: 'hoarding-cleanup-vs-junk-removal',
    title: 'Hoarding cleanup vs junk removal: which one do you need?',
    description: 'The real differences between a junk hauler and a hoarding cleanup company, when each is the right call, and the questions that expose a hauler pretending to be a specialist.',
    updated: '2026-09-14',
    html: `
<p>Junk removal companies now advertise hoarding cleanup because the search traffic is there. Some do it well. Many do not. The difference is not the truck; it is what happens before anything goes in it.</p>
<h2>Junk removal</h2>
<p>You point, they load. Priced by truckload ($300 to $800 per load nationally). Fast, cheap, right for a level-1 or level-2 home where the resident has already decided what goes, or for an empty estate with no biohazard. Wrong for a home with a person still attached to the belongings, or with animal waste, mold, sharps or human waste.</p>
<h2>Hoarding cleanup</h2>
<p>Adds four things: a crew trained to sort with the resident rather than around them; protective equipment and legal disposal for contaminated material; a search for documents, cash and valuables before disposal; and a final clean and deodorize. Priced by the day plus disposal ($1,500 to $5,000 for a typical home). Right for level 3 and above, or any job where someone is living in the home.</p>
<h2>Five questions that sort them out</h2>
<ol>
<li>"How do you work with the resident?" A hauler says "we work fast." A specialist describes keep zones and pace.</li>
<li>"Where does animal waste and contaminated material go?" A specialist names a licensed medical-waste route.</li>
<li>"Do you look for documents and valuables?" A specialist says yes and explains how they bag them.</li>
<li>"What protective equipment does the crew wear?" A specialist lists it without hesitating.</li>
<li>"How many hoarding jobs have you done this year?" Listen for a number.</li>
</ol>
<h2>Using both</h2>
<p>A common and sensible plan: a hoarding company for the sorting and hazardous work, then a junk hauler for the bulk loads once the decisions are made. Ask the hoarding company if they will coordinate it; many do.</p>`,
    faq: [
      { q: 'Is junk removal cheaper than hoarding cleanup?', a: 'Per truckload, yes: $300 to $800 versus a day rate. But a hauler cannot legally handle biohazard and will not sort with the resident, so on a level-3-or-above home the cheap option often ends in a walk-off or a second company.' },
      { q: 'Can a junk removal company handle a hoarder house?', a: 'For level 1 and 2 homes where decisions are already made and there is no biohazard, yes. For anything with animal waste, mold, sharps, or a resident who has not agreed to what goes, hire a hoarding specialist.' },
    ],
  },
  {
    slug: 'how-long-does-hoarding-cleanup-take',
    title: 'How long does hoarding cleanup take?',
    description: 'Realistic timelines for hoarding cleanup by home size and level, what slows a job down, and how to schedule around the resident.',
    updated: '2026-09-14',
    html: `
<p>A crew of three clears roughly one 20-yard container a day from a dense home. From that you can estimate most jobs.</p>
<h2>Typical timelines</h2>
<ul>
<li><strong>One room, level 2:</strong> half a day.</li>
<li><strong>Apartment or small house, level 3:</strong> two to three days.</li>
<li><strong>Three-bedroom house, level 3–4:</strong> four to seven working days, spread over one to two weeks.</li>
<li><strong>Level 5 or a large property:</strong> two to four weeks, sometimes with a break for repairs.</li>
</ul>
<h2>What slows it down</h2>
<p>Sorting with the resident (rightly) doubles the time of a no-sort clear. Searching for documents and valuables adds hours per room. Stairs, no driveway access, and parking restrictions add carry time. Biohazard rooms are worked slowly in full protective gear. Weather and dumpster swaps matter more than people expect.</p>
<h2>Scheduling around a resident</h2>
<p>Two half-days are often better than one full day for someone who finds the process distressing. Ask the company to plan the first session as sorting only, no truck, so the resident sees that nothing disappears without their say. Most companies will book a two-week window and adjust.</p>
<h2>After the clear</h2>
<p>Deep cleaning, deodorizing and any repairs are a separate one to five days. Pest treatment usually needs a follow-up visit two weeks later.</p>`,
    faq: [
      { q: 'Can a hoarder house be cleaned in one day?', a: 'A level-1 or level-2 home with decisions already made, yes. A level-3 or higher home with the resident sorting takes two to seven days; rushing it usually means things the resident wanted are gone and the hoarding returns faster.' },
      { q: 'How many people are on a hoarding cleanup crew?', a: 'Usually two to four. Larger crews move faster on hauling but not on sorting, which is the slow part of a job with a resident involved.' },
    ],
  },
  {
    slug: 'hoarding-cleanup-checklist',
    title: 'Hoarding cleanup checklist: before, during and after',
    description: 'A printable checklist for families arranging a hoarding cleanup: what to do before the crew arrives, what to watch for on the day, and what to set up afterwards.',
    updated: '2026-09-14',
    html: `
<h2>Before the crew arrives</h2>
<ul>
<li>Agree with the resident on the three safety goals for day one (exit path, bathroom, stove).</li>
<li>Walk the home once for documents: will, deeds, tax returns, insurance policies, medication, cash, jewelry, photos. Bag what you find; tell the crew what to keep looking for.</li>
<li>Photograph every room, dated. It protects everyone.</li>
<li>Confirm the written estimate lists labor, disposal, biohazard and cleaning as separate lines, and states what "done" looks like.</li>
<li>Ask for proof of insurance and, for biohazard, bloodborne-pathogen training.</li>
<li>Arrange dumpster placement and parking; call the city if a permit is needed for the street.</li>
<li>Turn on water and power if they are off; crews need both.</li>
<li>Arrange for pets to be out of the home.</li>
</ul>
<h2>On the day</h2>
<ul>
<li>One family member on site, not five. The resident makes decisions; the family member supports.</li>
<li>Keep, donate, recycle, trash zones set up before the first box moves.</li>
<li>Check the "trash" pile before each load leaves. It is the last chance.</li>
<li>Break every two hours. Fatigue is when people give up or get angry.</li>
<li>Keep a running list of anything found (documents, valuables) with who has it.</li>
</ul>
<h2>Afterwards</h2>
<ul>
<li>Deep clean and deodorize; treat for pests if needed, with a follow-up in two weeks.</li>
<li>Fix what the clutter hid: leaks, wiring, floors.</li>
<li>Set up the thing that stops the refill: a weekly cleaner, a therapist who treats hoarding disorder, a recurring donation pickup, a family member who visits on a schedule.</li>
<li>Keep the estimate, invoice and photos together; insurers and estate attorneys ask for them.</li>
</ul>`,
    faq: [
      { q: 'What should I do before a hoarding cleanup crew arrives?', a: 'Agree the day-one safety goals with the resident, walk the home for documents and valuables, photograph every room, get a line-item written estimate and proof of insurance, arrange dumpster and parking, and make sure water and power are on.' },
      { q: 'Should the hoarder be present during cleanup?', a: 'Yes, if they can tolerate it. Decisions made by the resident stick; decisions made for them are the main reason homes refill within a year.' },
    ],
  },
  {
    slug: 'landlords-tenants-and-hoarding',
    title: 'Landlords, tenants and hoarding: what you can and cannot do',
    description: 'For landlords and property managers: how to handle a hoarding tenant lawfully, fair-housing accommodation, when you can clean out a unit, and what it costs.',
    updated: '2026-09-14',
    html: `
<p>Hoarding disorder is a recognized mental health condition and therefore a disability under the Fair Housing Act. That changes the sequence: a landlord who goes straight to eviction over clutter, or enters and clears a unit, is likely to lose. A landlord who documents hazards and offers a reasonable accommodation is on solid ground. This is general information, not legal advice.</p>
<h2>Step 1: document the hazards, not the mess</h2>
<p>Blocked exits, fire load near heat sources, pest infestation, sanitation, damage to the unit. Dated photos and a written notice referencing the lease clauses (usually "sanitary condition" and "no nuisance").</p>
<h2>Step 2: offer an accommodation</h2>
<p>A written plan with a reasonable timeline (30 to 90 days is common), specific targets (clear exits, working bathroom, no waste), and, ideally, a referral: the Area Agency on Aging, a hoarding task force, a local cleanup company. Offer a payment plan for cleanup if you are willing. Keep copies of everything.</p>
<h2>Step 3: inspect against the plan</h2>
<p>Re-inspect on the dates in the plan. Progress counts; perfection is not the standard. If there is no progress and the hazards remain, a lease violation notice and, eventually, eviction through the courts is defensible.</p>
<h2>When you can clean out the unit</h2>
<p>When it is lawfully vacant: lease ended and tenant gone, eviction completed and possession returned, or the tenant has agreed in writing. Never before, and never by "self-help" (changing locks, removing property). Once vacant, an estate cleanout or hoarding cleanup company will clear a one-bedroom unit in one to two days for roughly $1,500 to $4,000, more with biohazard.</p>
<h2>Deposits and damages</h2>
<p>Ordinary cleaning beyond the deposit can be pursued as damages with the invoice and the photos. Biohazard and structural repair are usually recoverable; "wear and tear" is not.</p>`,
    faq: [
      { q: 'Can a landlord evict a tenant for hoarding?', a: 'Eventually, yes, but not directly for hoarding. The path is: document safety and lease violations, offer a written accommodation plan with a timeline, re-inspect, and only then pursue a lease-violation eviction through the courts. Skipping the accommodation step invites a fair-housing complaint.' },
      { q: 'Can a landlord hire a company to clean out a tenant\'s apartment?', a: 'Only when the unit is lawfully vacant or the tenant agrees in writing. Entering and removing a tenant\'s property is self-help eviction in most states and can cost the landlord far more than the cleanup.' },
      { q: 'Who pays for hoarding cleanup in a rental?', a: 'The landlord pays to restore the unit, then recovers what the law allows from the deposit and, with an invoice and photos, as damages. Tenant insurance rarely covers it.' },
    ],
  },
  {
    slug: 'crime-scene-cleanup-who-pays-and-who-does-it',
    title: 'Crime scene cleanup: who pays for it and who actually does it',
    description: 'After police leave, cleanup is the property owner\'s problem. Who pays (insurance, victim compensation, the owner), who does the work, and what it costs.',
    updated: '2026-09-14',
    html: `
<p>Police and the medical examiner process a scene and leave. They do not clean it, and neither does the city. What happens next is on the property owner, and most people find that out on the worst day of their lives.</p>
<h2>Who does the work</h2>
<p>Biohazard remediation companies, sometimes called trauma or crime scene cleaners. The crew removes blood and bodily fluids, tests and removes contaminated materials (carpet, subfloor, drywall), disinfects, deodorizes and disposes of everything as regulated medical waste. Training is OSHA bloodborne-pathogen at minimum; ABRA membership and IICRC certification are the marks of a serious company. Most respond within hours, 24/7.</p>
<h2>Who pays</h2>
<ul>
<li><strong>Homeowner or renter insurance</strong> usually covers it under property damage, and most biohazard companies bill the insurer directly. Call the claim in before work starts.</li>
<li><strong>Crime victim compensation.</strong> Every state has a victim compensation program funded by offender fines; most, not all, cover crime scene cleanup after a violent crime, with caps that range from a few hundred dollars to about $5,000. The cleanup company or the county victim advocate can tell you what your state covers and file the claim.</li>
<li><strong>The owner or estate</strong> for anything not covered, including most suicides and accidents in states where compensation applies only to violent crime.</li>
</ul>
<h2>What it costs</h2>
<p>Nationally $1,500 to $6,000 for a single room, more with multi-room scenes or structural removal. Companies charge by the hour per technician ($150 to $300) plus materials and disposal, or by the job.</p>
<h2>Do not clean it yourself</h2>
<p>Household cleaners do not remove biological contamination or odor, and exposure to bloodborne pathogens is a real risk. Landlords and employers have OSHA obligations here. Let the scene be released, call the insurer, call a company from this directory.</p>`,
    faq: [
      { q: 'Who pays for crime scene cleanup?', a: 'The property owner is responsible. In practice homeowner or renter insurance pays most of it, state crime victim compensation reimburses cleanup after violent crimes, and the owner or estate covers the rest.' },
      { q: 'Does the police department clean up crime scenes?', a: 'No. Police and the medical examiner process the scene and release it; cleanup is the property owner\'s responsibility and is done by private biohazard remediation companies.' },
      { q: 'How much does crime scene cleanup cost per hour?', a: 'Typically $150 to $300 per technician per hour, plus materials and regulated waste disposal. A single-room scene usually totals $1,500 to $6,000.' },
    ],
  },
  {
    slug: 'biohazard-cleanup-cost',
    title: 'Biohazard cleanup cost: per hour, per job, and what drives it',
    description: 'What biohazard, trauma and sewage cleanup costs in 2026, how companies price it, and how to keep the number down without cutting corners.',
    updated: '2026-09-14',
    html: `
<p>Biohazard cleanup is priced on volume of contaminated material and the labor to remove it safely. Nationally a single room runs $1,500 to $6,000; whole-home sewage backups, hoarding with waste, or multi-room trauma scenes go higher.</p>
<h2>How companies price it</h2>
<ul>
<li><strong>Hourly:</strong> $150 to $300 per technician per hour, two technicians minimum, plus materials and disposal.</li>
<li><strong>Per job:</strong> a flat estimate after a walk-through, common for insurance work.</li>
<li><strong>Disposal:</strong> regulated medical waste is billed per container or per pound; $100 to $500 on a typical job.</li>
<li><strong>Structural removal:</strong> carpet, pad, subfloor, drywall. This is the swing factor; fluids that reached the subfloor can double a job.</li>
</ul>
<h2>Typical ranges</h2>
<ul>
<li>Small blood cleanup, one surface: $500 to $1,500.</li>
<li>Unattended death, one room, found within days: $2,000 to $5,000.</li>
<li>Unattended death, found after weeks, subfloor affected: $5,000 to $10,000.</li>
<li>Sewage backup, basement: $2,000 to $7,000.</li>
<li>Hoarding with animal or human waste: priced as hoarding cleanup with a biohazard surcharge, $6,000 to $25,000.</li>
</ul>
<h2>Keeping it reasonable</h2>
<p>Call the insurer first; most of this work is covered and the company can bill direct. Get the estimate in writing with line items. Ask what is being removed and why; a company that wants to strip a room "to be safe" without testing is padding. And do not delay: contamination spreads and odor sets, and every day adds material to remove.</p>`,
    faq: [
      { q: 'How much does biohazard cleanup cost per hour?', a: 'About $150 to $300 per technician per hour with a two-technician minimum, plus materials and regulated disposal. Most companies will give a flat estimate after a walk-through instead.' },
      { q: 'Is biohazard cleanup covered by insurance?', a: 'Usually, under the property-damage section of homeowner or renter insurance, for trauma, unattended death and sewage backups (sewage may need a rider). Hoarding-related biohazard is often excluded as neglect.' },
    ],
  },
  {
    slug: 'what-happens-after-an-unattended-death',
    title: 'What happens after an unattended death is found: a step-by-step guide',
    description: 'The sequence after someone is found deceased at home, from the 911 call to remediation, who to call in what order, and what the family should not do.',
    updated: '2026-09-14',
    html: `
<p>An unattended death means someone died alone and was not found right away. The steps are the same whether it was hours or weeks, but the urgency of the cleanup changes.</p>
<h2>1. Call 911</h2>
<p>Police and EMS attend. If the death is clearly natural and the person had a doctor, the medical examiner or coroner may release the body to a funeral home quickly; otherwise the ME takes custody for examination. Nobody should touch or clean anything until the scene is released, usually within a day.</p>
<h2>2. Call the funeral home and the insurer</h2>
<p>The funeral home coordinates with the ME. Call the homeowner or renter insurer the same day and open a property claim; remediation is generally covered. Get the claim number.</p>
<h2>3. Call a remediation company</h2>
<p>Once the scene is released, a biohazard company can be on site within hours. They remove affected materials, treat the odor at the source and disinfect. Do not let family members do this: decomposition fluids are a biohazard, household products will not remove the odor, and the emotional cost is real. Most companies bill the insurer directly.</p>
<h2>4. Secure the property and belongings</h2>
<p>Lock the home, collect documents and valuables (the remediation company will bag what they find), and stop deliveries. If the person rented, tell the landlord; the lease usually continues until the estate ends it.</p>
<h2>5. Then the estate</h2>
<p>Death certificate, will, probate if needed. An estate cleanout company can clear the rest of the home once remediation is complete; some biohazard companies do both.</p>
<h2>What it costs</h2>
<p>Remediation: $2,000 to $8,000 nationally, depending on time undiscovered and materials affected. Estate cleanout afterwards: $800 to $4,000.</p>`,
    faq: [
      { q: 'Who cleans up after an unattended death?', a: 'A biohazard remediation company, hired by the family, executor or landlord after police and the medical examiner release the scene. Homeowner insurance usually pays and the company can bill it directly.' },
      { q: 'Can family clean up after an unattended death?', a: 'They should not. Decomposition fluids are a bloodborne-pathogen hazard, ordinary cleaners do not remove the odor from porous materials, and the emotional toll is severe. Insurance generally covers professional remediation.' },
      { q: 'How long after an unattended death can cleanup start?', a: 'As soon as the medical examiner or police release the scene, typically within 24 hours. Remediation companies respond within hours of the call.' },
    ],
  },
  {
    slug: 'estate-cleanout-cost',
    title: 'Estate cleanout cost: by truckload, by square foot, and what changes it',
    description: 'What an estate cleanout costs in 2026, how companies price it, credits for resalable items, and how to get a fair estimate.',
    updated: '2026-09-14',
    html: `
<p>Nationally an estate cleanout runs $800 to $4,000 for a full house. Most companies price by the truckload; some quote per square foot; a few charge by the hour. Here is how to compare them.</p>
<h2>By truckload</h2>
<p>$300 to $800 per 15- to 20-yard load including labor and dump fees. A one-bedroom apartment is one to two loads; a three-bedroom house two to four; a full basement and garage add one each. This is the most common and the easiest to check.</p>
<h2>By square foot</h2>
<p>$1 to $3 per square foot of living area for a normally furnished home. A 1,800-square-foot house lands at $1,800 to $5,400. Useful for a quick budget; less accurate than a walk-through.</p>
<h2>By the hour</h2>
<p>$100 to $200 per hour for a two-person crew plus disposal. Fine for a half-day job; risky for a whole house because you carry the overrun.</p>
<h2>What moves the number</h2>
<ul>
<li>Heavy items: pianos, safes, appliances, hot tubs.</li>
<li>Hazardous waste: paint, chemicals, propane, old electronics, which landfills refuse.</li>
<li>Access: stairs, no driveway, urban parking.</li>
<li>Sorting: if you want the crew to find documents and valuables, say so and expect hours added.</li>
<li>Resale credit: companies with a resale or donation channel may credit part of the value against the bill. Ask.</li>
<li>Final clean: often a separate line ($200 to $600).</li>
</ul>
<h2>Getting a fair estimate</h2>
<p>Walk-through, written, line items. Two estimates for anything over $2,000. Ask where items go (donation receipts help the estate at tax time). Photograph valuable items before the crew arrives.</p>`,
    faq: [
      { q: 'How much does an estate cleanout cost per square foot?', a: 'Roughly $1 to $3 per square foot of living area for a normally furnished home, so $1,800 to $5,400 for 1,800 square feet. Truckload pricing ($300 to $800 per load) is more common and usually cheaper for sparse homes.' },
      { q: 'Do estate cleanout companies pay for items?', a: 'Some credit resalable furniture, tools or collectibles against the bill, or run an estate sale first. Ask up front; not every company has a resale channel.' },
      { q: 'What is the difference between an estate sale and an estate cleanout?', a: 'An estate sale sells the contents over a weekend and takes a commission (30 to 40 percent). A cleanout removes everything left, usually after the sale or when a sale is not worth running.' },
    ],
  },
  {
    slug: 'estate-cleanout-checklist-for-executors',
    title: 'Estate cleanout checklist for executors and family',
    description: 'What to secure, what to keep, what to document and when to hire a company when clearing a home after a death.',
    updated: '2026-09-14',
    html: `
<h2>First week</h2>
<ul>
<li>Secure the home: locks, alarm, a neighbor's eye. Stop mail forwarding to the house and start it to you.</li>
<li>Find and remove: will and trust documents, deeds and titles, insurance policies, tax returns (seven years), bank and investment statements, safe deposit keys, passwords, medications (dispose via pharmacy take-back), firearms (secure lawfully), cash and jewelry.</li>
<li>Photograph every room and anything of value. Executors are accountable to beneficiaries.</li>
<li>Get several copies of the death certificate; utilities, banks and insurers all want one.</li>
</ul>
<h2>Before hiring a cleanout</h2>
<ul>
<li>Confirm your authority: letters testamentary or the trust document. Companies may ask.</li>
<li>Give family a deadline to claim items. Put it in writing. Two to four weeks is typical.</li>
<li>Decide the route for the rest: estate sale (worth it above roughly $5,000 of contents), consignment, donation (get receipts), cleanout.</li>
<li>Get two written estimates for a full-house job. Ask about resale credits and donation receipts.</li>
</ul>
<h2>On cleanout day</h2>
<ul>
<li>One decision-maker present. Tell the crew the categories of things to set aside if found.</li>
<li>Check the trash pile before each load leaves.</li>
<li>Keep the invoice; it is an estate expense.</li>
</ul>
<h2>After</h2>
<ul>
<li>Final clean, minor repairs, utilities to "vacant" plans, insurer told the home is empty (vacancy clauses kick in after 30 to 60 days).</li>
<li>Photos of the empty home for the file.</li>
</ul>
<p>This is general information, not legal advice; an estate attorney can confirm what applies in your state.</p>`,
    faq: [
      { q: 'Can an executor throw things away before probate?', a: 'Generally an executor may secure and, with letters testamentary, dispose of low-value contents as part of administering the estate. Items of value should be inventoried and, if the will or beneficiaries require, appraised first. Check with the estate attorney.' },
      { q: 'What should you not throw away when cleaning out a house?', a: 'Legal and financial documents, tax returns, insurance policies, keys, medications (use a take-back program), firearms, cash, jewelry, photos, and anything a beneficiary has asked for. When in doubt, bag it and decide later.' },
    ],
  },
  {
    slug: 'hoarding-cleanup-after-a-death',
    title: 'Hoarding cleanup after a death: what the family is facing',
    description: 'When a parent or relative who hoarded has died, the cleanout combines estate, hoarding and sometimes biohazard work. What to expect, in what order, and what it costs.',
    updated: '2026-09-14',
    html: `
<p>Families often discover the extent of a hoard only after a death. The job is three jobs at once, and the order matters.</p>
<h2>1. Biohazard first, if any</h2>
<p>If the death was unattended, or there is animal or human waste, mold, or sharps, a biohazard company remediates before anyone sorts anything. Insurance usually covers this part; call the claim in first. See <a href="/guides/what-happens-after-an-unattended-death">what happens after an unattended death</a>.</p>
<h2>2. Documents and valuables</h2>
<p>People who hoard often keep cash, jewelry and important papers in unusual places: inside books, in the freezer, in shoe boxes under other boxes. Tell the crew to check everything, and budget for the sorting hours. Families regularly recover several thousand dollars this way. See the <a href="/guides/estate-cleanout-checklist-for-executors">executor checklist</a>.</p>
<h2>3. Then the cleanout</h2>
<p>With the hazards gone and the valuables out, the rest is a heavy estate cleanout: several truckloads, hazardous household waste separated, donation where possible, final clean.</p>
<h2>Who to hire</h2>
<p>A hoarding cleanup company that also does biohazard can run all three phases; many do. Otherwise a biohazard firm for phase one and a hoarding or estate company for the rest. Ask for a phased estimate with each part separate, so the insurer sees its share clearly.</p>
<h2>Cost</h2>
<p>Remediation $2,000 to $8,000 (usually insured); sorting and cleanout $3,000 to $15,000 depending on volume and level; repairs on top. Estates pay from estate funds; keep every invoice.</p>
<h2>The family</h2>
<p>This is slow, sad work. Let the crew do the physical part. Give yourself one day on site for the decisions, not the whole week.</p>`,
    faq: [
      { q: 'Does insurance cover cleaning a hoarder house after death?', a: 'The biohazard portion after an unattended death is usually covered. The hoarding cleanout itself generally is not; it is paid by the estate as an administration expense.' },
      { q: 'How long does it take to clean out a hoarder\'s house after they die?', a: 'One to three weeks for a typical house: a day or two of remediation if needed, several days of sorting and hauling, then cleaning and repairs. Level-5 homes take longer.' },
    ],
  },
  {
    slug: 'can-you-clean-a-hoarder-house-yourself',
    title: 'Can you clean a hoarder house yourself? When DIY works and when it is dangerous',
    description: 'An honest look at do-it-yourself hoarding cleanup: what families can safely handle, what needs a professional, the gear you need, and how to plan it.',
    updated: '2026-09-14',
    html: `
<p>Yes, for a level-1 or level-2 home with a willing resident and a few helpers. No, for anything with biohazard, structural damage, or a resident who has not agreed. Here is where the line is.</p>
<h2>Safe to do yourself</h2>
<p>Clutter without contamination: paper, clothing, packaging, furniture. Kitchens with old but not rotting food. Homes where the person who hoards is leading the sort. Plan on a dumpster ($300 to $600 a week), gloves, masks, boxes, and more time than you think: a room a day is realistic.</p>
<h2>Not safe to do yourself</h2>
<ul>
<li>Animal or human waste, dead animals, needles, blood, sewage. These are bloodborne-pathogen and respiratory hazards. Professionals wear full protective equipment and dispose of the material as medical waste.</li>
<li>Mold beyond a small patch, or a home with a musty smell you cannot place.</li>
<li>Rodent infestation (hantavirus risk from droppings).</li>
<li>Rotting floors, blocked wiring, propane or chemicals stored inside.</li>
<li>A resident who has not agreed. Clearing behind someone's back is unsafe for the relationship and possibly unlawful.</li>
</ul>
<h2>The hybrid plan</h2>
<p>Hire a company for the hazardous rooms and the sorting sessions with the resident; do the hauling of clean bulk yourselves with a rented dumpster. It cuts the bill roughly in half and keeps the dangerous work with people trained for it.</p>
<h2>Minimum kit if you go ahead</h2>
<p>N95 or better masks, nitrile gloves under work gloves, eye protection, boots, long sleeves, a first aid kit, contractor bags, a dolly, a tetanus shot up to date, and someone outside the house who knows you are in there.</p>`,
    faq: [
      { q: 'Is it safe to clean a hoarder house yourself?', a: 'For clutter-only homes (level 1–2) with a willing resident, yes with masks, gloves and a dumpster. Not if there is animal or human waste, mold, rodent droppings, sharps, structural damage, or a resident who has not consented.' },
      { q: 'What do I need to clean a hoarder house?', a: 'N95 masks, nitrile and work gloves, eye protection, boots, contractor bags, boxes labeled keep / donate / trash, a dolly, a rented dumpster, and a plan agreed with the resident. Anything contaminated needs a professional instead.' },
    ],
  },
];
