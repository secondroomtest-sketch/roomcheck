/** Tanggal saja (YYYY-MM-DD), zona waktu lokal peramban. */

export function parseLocalDateOnly(value: string): Date | null {
  const t = String(value ?? "").trim();
  if (!t || t === "-") return null;
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const dt = new Date(y, mo, d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Selisih kalender: tanggal checkout − hari ini.
 * 0 = checkout hari ini, positif = hari ke depan, negatif = sudah lewat.
 */
export function calendarDaysUntilCheckout(checkOutRaw: string, now: Date = new Date()): number | null {
  const co = parseLocalDateOnly(checkOutRaw);
  if (!co) return null;
  const diffMs = startOfLocalDay(co) - startOfLocalDay(now);
  return Math.floor(diffMs / 86400000);
}
