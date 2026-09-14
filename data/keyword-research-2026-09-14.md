# Keyword research — 2026-09-14

Source: Google autocomplete (US, en) via `/complete/search?client=chrome`. Outscraper's
Google Search endpoint returned empty SERPs for every query (13 jobs, all `Success` with no
results), so People-Also-Ask was not captured; the question set in `src/data/intents.ts`
is curated from autocomplete plus the buyer questions in the guides. Re-run PAA later with
SerpAPI if needed.

## Head terms and modifiers seen

- hoarding cleanup: services, near me, cost, help, pros (competitor brand), jobs, [city]
- hoarding cleanup cost: hoarding removal cost, hoarder cleaning cost, hoarding house cleanup cost,
  **level 2 hoarding cleanup cost**, **level 5 hoarding cleanup cost**, average cost, prices,
  cost calculator, cost reddit
- hoarder house: cleaning, cleaning services, cleaners near me, for sale, pictures (TV show noise)
- biohazard cleanup: near me, companies, services, cost, **cost per hour**, remediation cost, kit (noise)
- crime scene cleanup: **who pays**, who does, companies, cost, cost per hour
- unattended death cleanup: cost, near me, services, reddit
- estate cleanout: services, near me, services cost, company, cost, **cost per square foot**, meaning
- how to help a hoarder: get rid of things, clean, clean their house, declutter, **parent**, organize, **in denial**
- hoarding levels: **1-5**, chart, examples, explained
- who pays for hoarding: who pays for hoarders clean up, **is hoarding covered by insurance**
- hoarding cleanup for seniors: **free hoarding clean up for seniors**, hoarding help for seniors near me
- landlord / tenant hoarding (partial capture)

## Where each lands

| Intent | Page type |
|---|---|
| cost (overall, by level, per hour, per sq ft) | metro + service FAQ, cost guides |
| near me / services / [city] | metro and service-in-metro pages (already) |
| who pays / insurance | FAQ everywhere + guide "Who pays for cleanup" |
| levels 1–5 | new guide "Hoarding levels 1–5 explained" + FAQ item |
| help a hoarder parent / in denial | new guides |
| free / seniors | new guide "Free and low-cost hoarding help" |
| landlord / tenant | new guide |
| crime scene who pays | biohazard FAQ + guide |
| estate cleanout meaning / vs junk | estate FAQ + guide |
