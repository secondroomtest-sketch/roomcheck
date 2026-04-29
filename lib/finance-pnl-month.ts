import type { FinanceRow } from "@/components/finance-page-client";

/** YYYY-MM untuk agregasi P&L: `pelaporan_bulan` jika ada, selain itu dari `tanggal`. */
export function financeRowCalendarYm(f: FinanceRow): string {
  const pb = (f.pelaporanBulan ?? "").trim();
  if (pb.length >= 7) return pb.slice(0, 7);
  return (f.tanggal ?? "").trim().slice(0, 7);
}

export function defaultPnlCalendarYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
