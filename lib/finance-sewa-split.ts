/**
 * Pemecahan pembayaran sewa ke beberapa bulan kalender (tanggal 1 tiap bulan)
 * untuk P&L / laporan ke pemilik per bulan.
 */

/** `ymd` = YYYY-MM-DD; mengembalikan YYYY-MM-01 bulan yang sama. */
export function startOfCalendarMonthYmd(ymd: string): string {
  const t = String(ymd ?? "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return "";
  return `${t.slice(0, 7)}-01`;
}

/**
 * Deret tanggal (YYYY-MM-DD) = hari ke-1 tiap bulan kalender berturut-turut,
 * dimulai dari bulan kalender yang berisi `checkInYmd` (jika valid),
 * selain itu dari bulan kalender yang berisi `fallbackYmd` (biasanya tanggal bayar).
 */
export function buildSewaSplitCalendarMonthStarts(
  checkInYmd: string | null | undefined,
  monthCount: number,
  fallbackYmd: string
): string[] {
  const n = Math.max(0, Math.floor(monthCount));
  if (n <= 0) return [];
  const anchorRaw = String(checkInYmd ?? "").trim().slice(0, 10);
  const fallbackRaw = String(fallbackYmd ?? "").trim().slice(0, 10);
  const anchor =
    /^\d{4}-\d{2}-\d{2}$/.test(anchorRaw) ? anchorRaw : /^\d{4}-\d{2}-\d{2}$/.test(fallbackRaw) ? fallbackRaw : "";
  if (!anchor) return [];
  const first = startOfCalendarMonthYmd(anchor);
  if (!first) return [];
  const [y0, m0] = first.split("-").map(Number);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y0, m0 - 1 + i, 1);
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    out.push(`${yy}-${mm}-01`);
  }
  return out;
}

/** Bagi total Rupiah ke `parts` bagian; sisa pembulatan ditambahkan ke entri terakhir. */
export function splitNominalRupiahEqualParts(total: number, parts: number): number[] {
  const p = Math.max(0, Math.floor(parts));
  const t = Math.max(0, Math.round(Number(total) || 0));
  if (p <= 0) return [];
  if (p === 1) return [t];
  const base = Math.floor(t / p);
  const rem = t - base * p;
  return Array.from({ length: p }, (_, i) => base + (i === p - 1 ? rem : 0));
}
