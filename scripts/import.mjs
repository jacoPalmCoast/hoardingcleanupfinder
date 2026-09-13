// Converts data/listings.json (normalized records) into SQL for D1.
// Usage: node scripts/import.mjs data/listings.json > data/seed.sql
import fs from 'node:fs';

const SERVICES = [
  { slug: 'hoarding-cleanup', kw: ['hoard', 'clutter', 'gross filth', 'extreme clean'] },
  { slug: 'biohazard-cleanup', kw: ['biohazard', 'trauma', 'crime scene', 'blood', 'sewage', 'decon', 'remediation', 'bio-one', 'bio one', 'aftermath', 'spaulding'] },
  { slug: 'unattended-death-cleanup', kw: ['unattended', 'death', 'decomposition', 'odor'] },
  { slug: 'estate-cleanout', kw: ['estate', 'cleanout', 'clean out', 'junk', 'haul', 'clearance', 'debris'] },
];

const slugify = (s) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
const digits = (s) => (s ?? '').replace(/\D/g, '').replace(/^1(\d{10})$/, '$1');
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

function inferServices(r) {
  const t = `${r.name} ${r.category ?? ''} ${r.subtypes ?? ''} ${r.query ?? ''}`.toLowerCase();
  const out = SERVICES.filter((s) => s.kw.some((k) => t.includes(k))).map((s) => s.slug);
  // Companies found via a hoarding query but categorised as junk removal still do hoarding work.
  if (!out.includes('hoarding-cleanup') && /hoard/.test((r.query ?? '').toLowerCase())) out.unshift('hoarding-cleanup');
  return out.length ? [...new Set(out)] : ['hoarding-cleanup'];
}

function describe(r, services) {
  const svc = services.map((s) => ({ 'hoarding-cleanup': 'hoarding cleanup', 'biohazard-cleanup': 'biohazard cleanup', 'unattended-death-cleanup': 'unattended death cleanup', 'estate-cleanout': 'estate cleanouts' })[s]);
  const list = svc.length > 1 ? `${svc.slice(0, -1).join(', ')} and ${svc.at(-1)}` : svc[0];
  const where = r.city ? `${r.city}, ${r.state_code}` : `the ${r.metro} area`;
  const hours = r.hours24 ? ' Available 24 hours.' : '';
  return `${r.name} provides ${list} in ${where}.${hours}`;
}

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const seenPhone = new Set();
const seenSlug = new Set();
const cities = new Map();
const out = [];
let kept = 0;

for (const r of rows) {
  if (r.business_status && r.business_status !== 'OPERATIONAL') continue;
  const pd = digits(r.phone);
  if (pd.length !== 10) continue;
  if (seenPhone.has(pd)) continue;
  const state = (r.state_code ?? r.metro_state ?? '').toUpperCase();
  const city = r.city ?? r.metro_city;
  if (!state || !city) continue;
  seenPhone.add(pd);
  let slug = slugify(`${r.name} ${city} ${state}`);
  if (seenSlug.has(slug)) slug = `${slug}-${pd.slice(-4)}`;
  seenSlug.add(slug);
  const services = inferServices(r);
  const citySlug = slugify(city);
  const key = `${state}/${citySlug}`;
  if (!cities.has(key)) cities.set(key, { slug: citySlug, name: city, state, lat: r.latitude, lng: r.longitude, population: r.metro_population ?? null });
  const website = r.website ? r.website.split('?')[0] : null;
  out.push(
    `INSERT INTO listings(slug,name,phone,phone_digits,website,address,city,city_slug,state,zip,lat,lng,description,services,rating,review_count,is_verified,status,source,place_id) VALUES (` +
      [q(slug), q(r.name), q(r.phone), q(pd), q(website), q(r.address), q(city), q(citySlug), q(state), q(r.postal_code || null), r.latitude ?? 'NULL', r.longitude ?? 'NULL', q(describe(r, services)), q(JSON.stringify(services)), r.rating ?? 'NULL', r.reviews ?? 0, r.verified ? 1 : 0, "'active'", "'outscraper'", q(r.place_id)].join(',') +
      ');',
  );
  kept++;
}
for (const c of cities.values()) {
  out.unshift(`INSERT OR IGNORE INTO cities(slug,name,state,lat,lng,population) VALUES (${q(c.slug)},${q(c.name)},${q(c.state)},${c.lat ?? 'NULL'},${c.lng ?? 'NULL'},${c.population ?? 'NULL'});`);
}
process.stdout.write(out.join('\n') + '\n');
console.error(`kept ${kept} of ${rows.length}; ${cities.size} cities`);
