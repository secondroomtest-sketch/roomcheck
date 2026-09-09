import {
  isDepositFinancePos,
  isRefundDepositFinancePos,
  isSewaKamarFinancePos,
} from "@/lib/penghuni-finance-payment-sync";
import { normalizePengeluaranScope, type PengeluaranScope } from "@/lib/pengeluaran-scope";
import type { ReportFinanceRow } from "@/lib/laporan-export-types";

/** Baris UI Finance (nominal string) → bentuk perhitungan P&L yang sama dengan tab Laporan. */
export function financeUiRowsToReportRows(
  rows: Array<{
    id: string;
    tanggal: string;
    kategori: "Pemasukan" | "Pengeluaran";
    nominal: string | number;
    lokasiKos: string;
    unitBlok: string;
    pos?: string;
    pengeluaranScope?: PengeluaranScope | null;
  }>
): ReportFinanceRow[] {
  return rows.map((r) => ({
    id: r.id,
    tanggal: r.tanggal,
    kategori: r.kategori,
    nominal:
      typeof r.nominal === "number" && Number.isFinite(r.nominal)
        ? r.nominal
        : Number(String(r.nominal).replace(/\D/g, "")) || 0,
    lokasiKos: r.lokasiKos,
    unitBlok: r.unitBlok,
    pos: r.pos,
    pengeluaranScope: r.pengeluaranScope,
  }));
}

export type LaporanMonthlyFinanceRow = {
  month: string;
  pemasukanKos: number;
  pemasukanManajemen: number;
  pengeluaranKos: number;
  pengeluaranManajemen: number;
};

export function isPemasukanKosReportRow(row: Pick<ReportFinanceRow, "kategori" | "pos">): boolean {
  if (row.kategori !== "Pemasukan") return false;
  const p = String(row.pos ?? "").trim();
  return isSewaKamarFinancePos(p);
}

/** Deposit kamar: pemasukan yang tidak boleh dipotong pengeluaran manajemen biasa. */
export function isDepositKamarPemasukanReportRow(
  row: Pick<ReportFinanceRow, "kategori" | "pos">
): boolean {
  return row.kategori === "Pemasukan" && isDepositFinancePos(String(row.pos ?? ""));
}

/** Hanya POS Refund deposit yang mengurangi total deposit kamar (bukan P&L operasional). */
export function isRefundDepositPengeluaranReportRow(
  row: Pick<ReportFinanceRow, "kategori" | "pos">
): boolean {
  return row.kategori === "Pengeluaran" && isRefundDepositFinancePos(row.pos);
}

/**
 * POS pengeluaran kos yang juga dihitung sebagai **pemasukan manajemen** (IPL, Manajemen Fee).
 * Tetap masuk `pengeluaranKosTotal` sehingga mengurangi P&amp;L / revenue kos.
 */
export function isForcedPemasukanManajemenFinancePos(pos: string | undefined | null): boolean {
  const p = String(pos ?? "").trim().toLowerCase();
  return p === "ipl" || p === "manajemen fee";
}

/** Pengeluaran yang mengurangi P&amp;L kos (termasuk IPL &amp; Manajemen Fee). */
export function isPengeluaranKosReportRow(
  row: Pick<ReportFinanceRow, "kategori" | "pos" | "pengeluaranScope">
): boolean {
  if (row.kategori !== "Pengeluaran") return false;
  if (isRefundDepositPengeluaranReportRow(row)) return false;
  if (isForcedPemasukanManajemenFinancePos(row.pos)) return true;
  return normalizePengeluaranScope(row.pengeluaranScope) !== "manajemen";
}

function expenseScopeForReportRow(f: ReportFinanceRow): PengeluaranScope {
  return normalizePengeluaranScope(f.pengeluaranScope);
}

/**
 * Baris yang masuk kubah **P&amp;L manajemen saja** (bukan IPL/Manajemen Fee — itu tetap di kubah kos).
 * Dipakai dashboard owner untuk menyembunyikan manajemen murni dari ringkasan kos.
 */
export function isManajemenPlFinanceUiRow(row: {
  kategori: "Pemasukan" | "Pengeluaran";
  pos?: string;
  pengeluaranScope?: PengeluaranScope | null;
}): boolean {
  if (row.kategori === "Pengeluaran") {
    if (isForcedPemasukanManajemenFinancePos(row.pos)) return false;
    if (isRefundDepositPengeluaranReportRow(row)) return true;
    return normalizePengeluaranScope(row.pengeluaranScope) === "manajemen";
  }
  return !isPemasukanKosReportRow(row);
}

export type LaporanFinanceBreakdown = {
  pemasukanKosTotal: number;
  /** Margin manajemen yang boleh dipotong pengeluaran (tanpa deposit kamar). */
  pemasukanManajemenTotal: number;
  /** Deposit kamar neto (pemasukan deposit − POS Refund deposit). Tidak masuk P&L operasional. */
  depositKamarPemasukanTotal: number;
  /** Nominal pengeluaran POS Refund deposit (memotong deposit, bukan margin). */
  refundDepositPengeluaranTotal: number;
  pengeluaranKosTotal: number;
  pengeluaranManajemenTotal: number;
  pengeluaranTotal: number;
  pemasukanTotal: number;
  /** P&amp;L kos: pemasukan sewa kamar − pengeluaran kos. */
  plKosNominal: number;
  /** P&amp;L manajemen: margin tanpa deposit − pengeluaran manajemen. */
  plManajemenNominal: number;
  pemasukanKosTransactionCount: number;
  pemasukanManajemenTransactionCount: number;
  depositKamarPemasukanTransactionCount: number;
  pengeluaranKosTransactionCount: number;
  pengeluaranManajemenTransactionCount: number;
  pengeluaranTransactionCount: number;
};

export function computeLaporanFinanceBreakdown(rows: ReportFinanceRow[]): LaporanFinanceBreakdown {
  let pemasukanKosTotal = 0;
  let pemasukanManajemenTotal = 0;
  let depositKamarPemasukanTotal = 0;
  let refundDepositPengeluaranTotal = 0;
  let pengeluaranKosTotal = 0;
  let pengeluaranManajemenTotal = 0;
  let pemasukanKosTransactionCount = 0;
  let pemasukanManajemenTransactionCount = 0;
  let depositKamarPemasukanTransactionCount = 0;
  let pengeluaranKosTransactionCount = 0;
  let pengeluaranManajemenTransactionCount = 0;

  for (const f of rows) {
    const n = Number(f.nominal) || 0;
    if (f.kategori === "Pengeluaran") {
      if (isRefundDepositPengeluaranReportRow(f)) {
        refundDepositPengeluaranTotal += n;
        continue;
      }
      if (isForcedPemasukanManajemenFinancePos(f.pos)) {
        pengeluaranKosTotal += n;
        pengeluaranKosTransactionCount += 1;
        pemasukanManajemenTotal += n;
        pemasukanManajemenTransactionCount += 1;
        continue;
      }
      const sp = expenseScopeForReportRow(f);
      if (sp === "manajemen") {
        pengeluaranManajemenTotal += n;
        pengeluaranManajemenTransactionCount += 1;
      } else {
        pengeluaranKosTotal += n;
        pengeluaranKosTransactionCount += 1;
      }
      continue;
    }
    if (isPemasukanKosReportRow(f)) {
      pemasukanKosTotal += n;
      pemasukanKosTransactionCount += 1;
    } else if (isDepositKamarPemasukanReportRow(f)) {
      depositKamarPemasukanTotal += n;
      depositKamarPemasukanTransactionCount += 1;
    } else {
      pemasukanManajemenTotal += n;
      pemasukanManajemenTransactionCount += 1;
    }
  }

  const depositKamarNeto = depositKamarPemasukanTotal - refundDepositPengeluaranTotal;
  const pemasukanTotal = pemasukanKosTotal + pemasukanManajemenTotal + depositKamarNeto;
  const pengeluaranTotal = pengeluaranKosTotal + pengeluaranManajemenTotal;
  return {
    pemasukanKosTotal,
    pemasukanManajemenTotal,
    depositKamarPemasukanTotal: depositKamarNeto,
    refundDepositPengeluaranTotal,
    pengeluaranKosTotal,
    pengeluaranManajemenTotal,
    pengeluaranTotal,
    pemasukanTotal,
    plKosNominal: pemasukanKosTotal - pengeluaranKosTotal,
    plManajemenNominal: pemasukanManajemenTotal - pengeluaranManajemenTotal,
    pemasukanKosTransactionCount,
    pemasukanManajemenTransactionCount,
    depositKamarPemasukanTransactionCount,
    pengeluaranKosTransactionCount,
    pengeluaranManajemenTransactionCount,
    pengeluaranTransactionCount: pengeluaranKosTransactionCount + pengeluaranManajemenTransactionCount,
  };
}
