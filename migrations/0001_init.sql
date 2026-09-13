-- Listings
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  phone_digits TEXT,
  website TEXT,
  email TEXT,
  address TEXT,
  city TEXT NOT NULL,
  city_slug TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT,
  lat REAL,
  lng REAL,
  description TEXT,
  services TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  review_count INTEGER DEFAULT 0,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_claimed INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  featured_until INTEGER,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  subscription_status TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT,
  place_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_listings_state_city ON listings(state, city_slug, status);
CREATE INDEX IF NOT EXISTS idx_listings_phone ON listings(phone_digits);
CREATE INDEX IF NOT EXISTS idx_listings_featured ON listings(is_featured, featured_until);
CREATE INDEX IF NOT EXISTS idx_listings_stripe_customer ON listings(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_listings_stripe_sub ON listings(stripe_subscription_id);

-- Full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS listings_fts USING fts5(
  name, city, state, zip, services, content='listings', content_rowid='id'
);
CREATE TRIGGER IF NOT EXISTS listings_ai AFTER INSERT ON listings BEGIN
  INSERT INTO listings_fts(rowid, name, city, state, zip, services)
  VALUES (new.id, new.name, new.city, new.state, new.zip, new.services);
END;
CREATE TRIGGER IF NOT EXISTS listings_ad AFTER DELETE ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, name, city, state, zip, services)
  VALUES ('delete', old.id, old.name, old.city, old.state, old.zip, old.services);
END;
CREATE TRIGGER IF NOT EXISTS listings_au AFTER UPDATE ON listings BEGIN
  INSERT INTO listings_fts(listings_fts, rowid, name, city, state, zip, services)
  VALUES ('delete', old.id, old.name, old.city, old.state, old.zip, old.services);
  INSERT INTO listings_fts(rowid, name, city, state, zip, services)
  VALUES (new.id, new.name, new.city, new.state, new.zip, new.services);
END;

-- Cities (metros)
CREATE TABLE IF NOT EXISTS cities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  state TEXT NOT NULL,
  lat REAL,
  lng REAL,
  population INTEGER,
  intro TEXT,
  UNIQUE(state, slug)
);

-- Leads (quote requests)
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT NOT NULL,
  zip TEXT,
  city TEXT,
  state TEXT,
  service TEXT,
  message TEXT,
  routed_to TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'new',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- Claims
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  verified_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_claims_listing ON claims(listing_id, status);

-- Owners and sessions
CREATE TABLE IF NOT EXISTS owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS owner_listings (
  owner_id INTEGER NOT NULL,
  listing_id INTEGER NOT NULL,
  PRIMARY KEY (owner_id, listing_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  owner_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS login_codes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);

-- Reports (corrections / removal requests)
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'correction',
  message TEXT,
  email TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Stripe event idempotency
CREATE TABLE IF NOT EXISTS stripe_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  received_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Simple rate limiting per key
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL
);
