import { isSewaKamarFinancePos } from "@/lib/penghuni-finance-payment-sync";
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

/**
 * Pengeluaran dengan POS ini di P&amp;L manajemen diperlakukan sebagai **masuk/manajemen** (sama seperti tab Finance —
 * IPL &amp; fee manajemen walau dicatat lewat jurnal pengeluaran).
 */
export function isForcedPemasukanManajemenFinancePos(pos: string | undefined | null): boolean {
  const p = String(pos ?? "").trim().toLowerCase();
  return p === "ipl" || p === "manajemen fee";
}

function expenseScopeForReportRow(f: ReportFinanceRow): PengeluaranScope {
  return normalizePengeluaranScope(f.pengeluaranScope);
}

/**
 * Baris yang masuk kubah **P&amp;L manajemen** (pembebanan luar sewa kamar / pengeluaran scope manajemen).
 * Dipakai dashboard owner untuk menyembunyikan manajemen dari ringkasan &amp; tabel.
 */
export function isManajemenPlFinanceUiRow(row: {
  kategori: "Pemasukan" | "Pengeluaran";
  pos?: string;
  pengeluaranScope?: PengeluaranScope | null;
}): boolean {
  if (row.kategori === "Pengeluaran") {
    if (isForcedPemasukanManajemenFinancePos(row.pos)) return true;
    return normalizePengeluaranScope(row.pengeluaranScope) === "manajemen";
  }
  return !isPemasukanKosReportRow(row);
}

export type LaporanFinanceBreakdown = {
  pemasukanKosTotal: number;
  pemasukanManajemenTotal: number;
  pengeluaranKosTotal: number;
  pengeluaranManajemenTotal: number;
  pengeluaranTotal: number;
  pemasukanTotal: number;
  /** P&amp;L kos: pemasukan sewa kamar − pengeluaran kos. */
  plKosNominal: number;
  /** P&amp;L manajemen: pemasukan manajemen − pengeluaran manajemen. */
  plManajemenNominal: number;
  pemasukanKosTransactionCount: number;
  pemasukanManajemenTransactionCount: number;
  pengeluaranKosTransactionCount: number;
  pengeluaranManajemenTransactionCount: number;
  pengeluaranTransactionCount: number;
};

export function computeLaporanFinanceBreakdown(rows: ReportFinanceRow[]): LaporanFinanceBreakdown {
  let pemasukanKosTotal = 0;
  let pemasukanManajemenTotal = 0;
  let pengeluaranKosTotal = 0;
  let pengeluaranManajemenTotal = 0;
  let pemasukanKosTransactionCount = 0;
  let pemasukanManajemenTransactionCount = 0;
  let pengeluaranKosTransactionCount = 0;
  let pengeluaranManajemenTransactionCount = 0;

  for (const f of rows) {
    const n = Number(f.nominal) || 0;
    if (f.kategori === "Pengeluaran") {
      if (isForcedPemasukanManajemenFinancePos(f.pos)) {
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
    } else {
      pemasukanManajemenTotal += n;
      pemasukanManajemenTransactionCount += 1;
    }
  }

  const pemasukanTotal = pemasukanKosTotal + pemasukanManajemenTotal;
  const pengeluaranTotal = pengeluaranKosTotal + pengeluaranManajemenTotal;
  return {
    pemasukanKosTotal,
    pemasukanManajemenTotal,
    pengeluaranKosTotal,
    pengeluaranManajemenTotal,
    pengeluaranTotal,
    pemasukanTotal,
    plKosNominal: pemasukanKosTotal - pengeluaranKosTotal,
    plManajemenNominal: pemasukanManajemenTotal - pengeluaranManajemenTotal,
    pemasukanKosTransactionCount,
    pemasukanManajemenTransactionCount,
    pengeluaranKosTransactionCount,
    pengeluaranManajemenTransactionCount,
    pengeluaranTransactionCount: pengeluaranKosTransactionCount + pengeluaranManajemenTransactionCount,
  };
}
