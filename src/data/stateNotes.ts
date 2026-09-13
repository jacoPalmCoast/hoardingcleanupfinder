// Short, factual per-state context shown on state pages. Only states with a specific,
// verifiable point get a note; everything else falls back to the generic line.
const GENERIC =
  'Hoarding cleanup is not a licensed trade in most states. What matters is whether the crew has bloodborne-pathogen training, proper insurance, and a legal disposal route for any medical or hazardous waste. Ask every company those three questions.';

const SPECIFIC: Record<string, string> = {
  CA: 'In California, companies that remove trauma scene waste must be registered with the California Department of Public Health as Trauma Scene Waste Management Practitioners. Ask to see the registration before hiring for a biohazard or unattended death job.',
  FL: 'In Florida, anyone transporting biomedical waste needs a Florida Department of Health biomedical waste transporter registration. General hoarding and estate cleanouts do not need a license, but ask about insurance and disposal.',
  TX: 'In Texas, medical waste transport is regulated by the Texas Commission on Environmental Quality. Hoarding and estate cleanouts themselves are not licensed; check insurance and how the company disposes of sharps and contaminated materials.',
};

export const STATE_NOTES: Record<string, string> = new Proxy(SPECIFIC, {
  get: (t, k: string) => t[k] ?? GENERIC,
});
