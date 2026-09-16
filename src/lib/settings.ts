// Editable business settings, stored in the `settings` table and managed from Admin → Setup.
// Read fresh each call (cheap PK lookups; changes take effect immediately across isolates). Env
// vars are the fallback so nothing breaks before a value is set.
import { env } from './env';

export const SETTING_KEYS = ['business_name', 'mailing_address', 'support_email', 'support_phone'] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getSettings(keys: readonly string[] = SETTING_KEYS): Promise<Record<string, string>> {
  if (keys.length === 0) return {};
  try {
    const ph = keys.map((_, i) => `?${i + 1}`).join(',');
    const rows = (await env.DB.prepare(`SELECT key, value FROM settings WHERE key IN (${ph})`).bind(...keys).all<{ key: string; value: string }>()).results;
    const out: Record<string, string> = {};
    for (const r of rows) if (r.value != null) out[r.key] = r.value;
    return out;
  } catch { return {}; }
}
export async function getSetting(key: string): Promise<string | null> {
  return (await getSettings([key]))[key] ?? null;
}
export async function setSetting(key: string, value: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO settings(key, value, updated_at) VALUES (?1, ?2, unixepoch())
     ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = unixepoch()`,
  ).bind(key, value.trim()).run();
}

// Convenience accessors with env fallback.
export async function mailingAddress(): Promise<string> { return (await getSetting('mailing_address')) || env.MAILING_ADDRESS || ''; }
export async function businessName(): Promise<string> { return (await getSetting('business_name')) || env.SITE_NAME || ''; }
