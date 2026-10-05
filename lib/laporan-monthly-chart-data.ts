import type { ReportFinanceRow } from "@/lib/laporan-export-types";
import type { LaporanMonthlyFinanceRow } from "@/lib/laporan-finance-breakdown";
import {
  isDepositKamarPemasukanReportRow,
  isForcedPemasukanManajemenFinancePos,
  isPemasukanKosReportRow,
  isRefundDepositPengeluaranReportRow,
} from "@/lib/laporan-finance-breakdown";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";
import { monthKeyFromFinanceRow } from "@/lib/laporan-report-dates";

export type LaporanMonthlyChartDatum = LaporanMonthlyFinanceRow & {
  pemasukanSewaKamar: number;
  marginManajemen: number;
};

/** Agregasi keuangan per bulan — selaras blok useMemo di `laporan-page-client`. */
export function computeMonthlyChartData(filteredFinance: ReportFinanceRow[]): LaporanMonthlyChartDatum[] {
  const collector = new Map<string, LaporanMonthlyFinanceRow>();

  filteredFinance.forEach((row) => {
    const monthKey = monthKeyFromFinanceRow(row);
    if (!monthKey) return;

    const existing =
      collector.get(monthKey) ??
      ({
        month: monthKey,
        pemasukanKos: 0,
        pemasukanManajemen: 0,
        pengeluaranKos: 0,
        pengeluaranManajemen: 0,
      } satisfies LaporanMonthlyFinanceRow);
    const n = row.nominal;
    if (row.kategori === "Pengeluaran") {
      if (isRefundDepositPengeluaranReportRow(row)) {
        /** Memotong deposit kamar, bukan bar pengeluaran manajemen. */
      } else if (isForcedPemasukanManajemenFinancePos(row.pos)) {
        existing.pengeluaranKos += n;
        existing.pemasukanManajemen += n;
      } else if (normalizePengeluaranScope(row.pengeluaranScope) === "manajemen") {
        existing.pengeluaranManajemen += n;
      } else {
        existing.pengeluaranKos += n;
      }
    } else if (isPemasukanKosReportRow(row)) {
      existing.pemasukanKos += n;
    } else if (isDepositKamarPemasukanReportRow(row)) {
      /** Deposit dicatat terpisah — tidak masuk margin yang dipotong pengeluaran. */
    } else {
      existing.pemasukanManajemen += n;
    }
    collector.set(monthKey, existing);
  });

  return Array.from(collector.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => ({
      ...row,
      pemasukanSewaKamar: row.pemasukanKos,
      marginManajemen: row.pemasukanManajemen,
    }));
}
