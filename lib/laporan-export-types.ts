/**
 * Handoff lintas-tab: gunakan localStorage (bukan sessionStorage — tab baru tidak
 * mewarisi sessionStorage tab induk).
 */
import type { PengeluaranScope } from "@/lib/pengeluaran-scope";

export const LAPORAN_EXPORT_STORAGE_KEY = "secondroom_laporan_export_v1";

export type ReportFinanceRow = {
  id: string;
  tanggal: string;
  kategori: "Pemasukan" | "Pengeluaran";
  nominal: number;
  lokasiKos: string;
  unitBlok: string;
  /** POS finance (untuk aturan revenue owner di ringkasan). */
  pos?: string;
  /** Hanya Pengeluaran: kos vs manajemen (dari Master / kolom finance). */
  pengeluaranScope?: PengeluaranScope | null;
};

export type ReportKamarRow = {
  id: string;
  status: "Occupied" | "Available" | "Maintenance";
  lokasiKos: string;
  unitBlok: string;
};

export type LaporanPenghuniSnap = {
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  status: string;
  tglCheckIn: string;
  tglCheckOut: string;
};

export type LaporanSurveySnap = {
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
  rencanaCheckIn: string;
  noWa: string;
};

/** Kartu ringkasan selaras kartu statistik dashboard. */
export type LaporanDashboardCard = {
  label: string;
  value: string;
  note: string;
};

export type LaporanExportPayloadV1 = {
  v: 1;
  generatedAt: string;
  currentUserName: string;
  /** Role profil saat ekspor (untuk revenue owner). */
  userProfileRole: string;
  localDemoMode: boolean;
  /** Tab cetak: sorot struktur kos vs manajemen (opsional = tampilkan keduanya). */
  laporanFokus?: "kos" | "manajemen";
  filters: {
    startDate: string;
    endDate: string;
    selectedLokasi: string;
    selectedUnit: string;
  };
  summary: {
    kamarTotal: number;
    occupied: number;
    available: number;
    maintenance: number;
    occupancyPct: number;
    /** Total nominal pemasukan (sewa kamar + margin), selaras halaman Finance. */
    pemasukanTotal: number;
    /** Total nominal pemasukan kos (sewa kamar + booking fee). */
    pemasukanKosTotal: number;
    /** Total nominal pemasukan manajemen (selain sewa + booking fee). */
    pemasukanManajemenTotal: number;
    pengeluaranKosTotal: number;
    pengeluaranManajemenTotal: number;
    /** P&L kos: pemasukan kos − pengeluaran kos. */
    plKosNominal: number;
    /** P&L manajemen: pemasukan manajemen − pengeluaran manajemen. */
    plManajemenNominal: number;
    /** Total pemasukan tampilan owner (deposit/booking tidak dijumlahkan). */
    revenueOwnerView: number;
    pengeluaranTotal: number;
    penghuniStay: number;
    penghuniBooking: number;
    /** Survey sesuai filter lokasi/unit. */
    surveyCount: number;
    /** Semua baris survey di sistem (sebelum filter lokasi/unit). */
    surveyTotalAll: number;
    pemasukanTransactionCount: number;
    pemasukanTransactionCountOwnerView: number;
    pemasukanKosTransactionCount: number;
    pemasukanManajemenTransactionCount: number;
    pengeluaranKosTransactionCount: number;
    pengeluaranManajemenTransactionCount: number;
    pengeluaranTransactionCount: number;
  };
  monthly: {
    month: string;
    pemasukanKos: number;
    pemasukanManajemen: number;
    pengeluaranKos: number;
    pengeluaranManajemen: number;
  }[];
  kamarByStatus: { name: string; value: number }[];
  financeRows: ReportFinanceRow[];
  penghuniRows: LaporanPenghuniSnap[];
  surveyRows: LaporanSurveySnap[];
  dashboardCards: LaporanDashboardCard[];
};
