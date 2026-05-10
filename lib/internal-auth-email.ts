/**
 * Supabase Auth membutuhkan email per user. Pola: simpan `username@INTERNAL_DOMAIN`
 * sebagai email di Auth; UI hanya menampilkan username.
 */

const DEFAULT_INTERNAL_DOMAIN = "secondroom.internal";

export function getInternalLoginEmailDomain(): string {
  const raw = process.env.NEXT_PUBLIC_INTERNAL_LOGIN_EMAIL_DOMAIN?.trim().toLowerCase();
  return raw && raw.length > 0 ? raw : DEFAULT_INTERNAL_DOMAIN;
}

/** Normalisasi untuk disimpan sebagai local-part email (hanya huruf/angka/._-) */
export function sanitizeLoginUsername(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "");
  return s.replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "");
}

export function isValidLoginUsername(raw: string): boolean {
  const u = sanitizeLoginUsername(raw);
  return u.length >= 3 && u.length <= 64;
}

export function usernameToAuthEmail(username: string): string {
  const u = sanitizeLoginUsername(username);
  return `${u}@${getInternalLoginEmailDomain()}`;
}

/** Input login: alamat email penuh tetap dipakai; selain itu dianggap username internal. */
export function credentialToSupabaseLoginEmail(credential: string): string {
  const c = credential.trim();
  if (!c) return c;
  if (c.includes("@")) return c.toLowerCase();
  return usernameToAuthEmail(c);
}

export function isLegacyEmailLogin(profileEmail: string, profileUsername?: string | null): boolean {
  if (profileUsername && String(profileUsername).trim()) return false;
  const em = String(profileEmail ?? "")
    .trim()
    .toLowerCase();
  if (!em.includes("@")) return false;
  return !em.endsWith(`@${getInternalLoginEmailDomain()}`);
}

/** Tampilan satu kolom: username tersimpan, atau local-part email internal, atau email legacy. */
export function loginDisplayPrimary(profile: { username?: string | null; email?: string | null }): string {
  const un = String(profile.username ?? "").trim();
  if (un) return un;
  const em = String(profile.email ?? "").trim().toLowerCase();
  const domain = getInternalLoginEmailDomain();
  if (em.endsWith(`@${domain}`)) {
    return em.slice(0, -(domain.length + 1));
  }
  return String(profile.email ?? "").trim();
}
