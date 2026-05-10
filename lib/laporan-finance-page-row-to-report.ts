import type { ReportFinanceRow } from "@/lib/laporan-export-types";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";

/** Mengonversi baris dari halaman Finance ke bentuk laporan tanpa mengimpor komponen (hindari siklus). */
export function financePageRowToReportRow(f: {
  id: string;
  tanggal: string;
  kategori: "Pemasukan" | "Pengeluaran";
  nominal: string | number;
  lokasiKos: string;
  unitBlok: string;
  pos?: string;
  pengeluaranScope?: string | null;
}): ReportFinanceRow {
  const kategori = f.kategori === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";
  const n =
    typeof f.nominal === "number" && Number.isFinite(f.nominal)
      ? f.nominal
      : Number(String(f.nominal).replace(/\D/g, "")) || 0;
  return {
    id: f.id,
    tanggal: f.tanggal,
    kategori,
    nominal: n,
    lokasiKos: f.lokasiKos,
    unitBlok: f.unitBlok,
    pos: f.pos ?? "",
    pengeluaranScope: kategori === "Pengeluaran" ? normalizePengeluaranScope(f.pengeluaranScope) : null,
  };
}
