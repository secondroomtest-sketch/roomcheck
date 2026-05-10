import type { LaporanDashboardCard, ReportFinanceRow } from "@/lib/laporan-export-types";
import {
  isForcedPemasukanManajemenFinancePos,
  isPemasukanKosReportRow,
} from "@/lib/laporan-finance-breakdown";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";

export type LaporanFokusCetak = "kos" | "manajemen";

const KOLOM_KARTU_EKSKLUSIF_MANAJEMEN = new Set([
  "Pemasukan manajemen",
  "Pengeluaran manajemen",
  "P&L Manajemen",
]);

const KOLOM_KARTU_EKSKLUSIF_KOS = new Set([
  "Pemasukan kos (sewa + booking)",
  "Pengeluaran kos",
  "P&L Kos",
]);

export function filterDashboardCardsByLaporanFokus(
  cards: LaporanDashboardCard[],
  fokus?: LaporanFokusCetak | null
): LaporanDashboardCard[] {
  if (!fokus) return cards;
  if (fokus === "kos") {
    return cards.filter((c) => !KOLOM_KARTU_EKSKLUSIF_MANAJEMEN.has(c.label));
  }
  return cards.filter((c) => !KOLOM_KARTU_EKSKLUSIF_KOS.has(c.label));
}

function pemasukanKosUntukDetail(r: ReportFinanceRow): boolean {
  return r.kategori === "Pemasukan" && isPemasukanKosReportRow(r);
}

function pemasukanManajemenUntukDetail(r: ReportFinanceRow): boolean {
  if (r.kategori === "Pemasukan" && !isPemasukanKosReportRow(r)) return true;
  return r.kategori === "Pengeluaran" && isForcedPemasukanManajemenFinancePos(r.pos);
}

function pengeluaranKosUntukDetail(r: ReportFinanceRow): boolean {
  if (r.kategori !== "Pengeluaran") return false;
  if (isForcedPemasukanManajemenFinancePos(r.pos)) return false;
  return normalizePengeluaranScope(r.pengeluaranScope) !== "manajemen";
}

function pengeluaranManajemenUntukDetail(r: ReportFinanceRow): boolean {
  return (
    r.kategori === "Pengeluaran" &&
    normalizePengeluaranScope(r.pengeluaranScope) === "manajemen" &&
    !isForcedPemasukanManajemenFinancePos(r.pos)
  );
}

export function filterPemasukanRowsForLaporanCetak(
  rows: ReportFinanceRow[],
  fokus?: LaporanFokusCetak | null
): ReportFinanceRow[] {
  const pem = rows.filter((r) => r.kategori === "Pemasukan");
  if (!fokus) return pem;
  if (fokus === "kos") return pem.filter((r) => pemasukanKosUntukDetail(r));

  const pemMan = pem.filter((r) => pemasukanManajemenUntukDetail(r));
  const forced = rows.filter(
    (r) => r.kategori === "Pengeluaran" && isForcedPemasukanManajemenFinancePos(r.pos)
  );
  return [...pemMan, ...forced].sort((a, b) => String(b.tanggal).localeCompare(String(a.tanggal)));
}

export function filterPengeluaranRowsForLaporanCetak(
  rows: ReportFinanceRow[],
  fokus?: LaporanFokusCetak | null
): ReportFinanceRow[] {
  const peng = rows.filter((r) => r.kategori === "Pengeluaran");
  if (!fokus) return peng;
  if (fokus === "kos") return peng.filter((r) => pengeluaranKosUntukDetail(r));
  return peng.filter((r) => pengeluaranManajemenUntukDetail(r));
}
