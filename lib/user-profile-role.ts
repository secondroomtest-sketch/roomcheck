const ALLOWED = new Set(["super_admin", "owner", "staff", "supervisor", "manager"]);

/** Samakan format role dari DB ke nilai yang dipakai UI (lowercase + fallback). */
export function normalizeUserProfileRole(raw: unknown): string {
  const r = String(raw ?? "staff").trim().toLowerCase();
  return ALLOWED.has(r) ? r : "staff";
}
