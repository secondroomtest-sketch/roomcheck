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

/** Tanggal pengakuan P&L: `pelaporanBulan` (split sewa) jika ada, selain itu tanggal payment. */
export function financeRowPnlYmd(row: { tanggal?: string | null; pelaporanBulan?: string | null }): string {
  const pb = String(row.pelaporanBulan ?? "").trim();
  const pbDay = pb.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(pbDay)) return pbDay;
  if (/^\d{4}-\d{2}$/.test(pb.slice(0, 7))) return `${pb.slice(0, 7)}-01`;
  return String(row.tanggal ?? "").trim().slice(0, 10);
}

/**
 * Filter by Bulan P&L: pakai `pelaporanBulan` jika ada, selain itu fallback ke `tanggal` transaksi
 * (selaras agregrasi P&L dashboard / mode pelaporan di Finance).
 */
export function financeRowInPelaporanYmdInclusiveRange(
  row: { tanggal: string; pelaporanBulan?: string },
  startYmd: string,
  endYmd: string
): boolean {
  return financeRowInYmdInclusiveRange({ tanggal: financeRowPnlYmd(row) }, startYmd, endYmd);
}

export function monthKeyFromYmd(dateString: string): string {
  const parsed = parseYmdLocal(dateString);
  if (Number.isNaN(parsed.getTime())) return "";
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export function monthKeyFromFinanceRow(row: { tanggal?: string | null; pelaporanBulan?: string | null }): string {
  return monthKeyFromYmd(financeRowPnlYmd(row));
}

export function collectFinancePnlBoundaryYmds(
  rows: Array<{ tanggal?: string | null; pelaporanBulan?: string | null }>
): string[] {
  return rows
    .map((r) => financeRowPnlYmd(r))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort((a, b) => a.localeCompare(b));
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

/** Jika rentang > 1 tahun, geser mulai agar tetap valid (akhir tetap). */
export function clampYmdRangeToMaxYear(startYmd: string, endYmd: string): { start: string; end: string } {
  if (!ymdRangeInvalidOrTooLong(startYmd, endYmd)) return { start: startYmd, end: endYmd };
  const end = parseYmdLocal(endYmd);
  if (Number.isNaN(end.getTime())) return { start: startYmd, end: endYmd };
  const start = new Date(end);
  start.setDate(start.getDate() - 365);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-${d}`, end: endYmd };
}
