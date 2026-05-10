/** Parse tanggal YYYY-MM-DD atau awal string ISO sebagai Date kalender lokal (hindari offset UTC). */
export function parseYmdLocal(dateString: string): Date {
  const day = String(dateString).slice(0, 10);
  const [y, m, d] = day.split("-").map((x) => parseInt(x, 10));
  if (!y || !m || !d) return new Date(NaN);
  return new Date(y, m - 1, d);
}

export function financeRowInYmdInclusiveRange(row: { tanggal: string }, startYmd: string, endYmd: string): boolean {
  const rowDate = parseYmdLocal(row.tanggal);
  if (Number.isNaN(rowDate.getTime())) return false;
  const start = parseYmdLocal(startYmd);
  start.setHours(0, 0, 0, 0);
  const end = parseYmdLocal(endYmd);
  end.setHours(23, 59, 59, 999);
  return rowDate >= start && rowDate <= end;
}

export function monthKeyFromYmd(dateString: string): string {
  const parsed = parseYmdLocal(dateString);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

/** Rentang tidak valid atau melebihi 366 hari — sama dengan aturan tab Laporan. */
export function ymdRangeInvalidOrTooLong(startYmd: string, endYmd: string): boolean {
  const start = new Date(startYmd);
  const end = new Date(endYmd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
  const diffMs = end.getTime() - start.getTime();
  const maxMs = 366 * 24 * 60 * 60 * 1000;
  return diffMs < 0 || diffMs > maxMs;
}
