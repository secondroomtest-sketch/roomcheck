/**
 * Handoff lintas-tab: gunakan localStorage (bukan sessionStorage — tab baru tidak
 * mewarisi sessionStorage tab induk).
 */
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
    /** Total nominal pemasukan (semua POS) dalam filter. */
    pemasukanTotal: number;
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
  };
  monthly: { month: string; pemasukan: number; pengeluaran: number }[];
  kamarByStatus: { name: string; value: number }[];
  financeRows: ReportFinanceRow[];
  penghuniRows: LaporanPenghuniSnap[];
  surveyRows: LaporanSurveySnap[];
  dashboardCards: LaporanDashboardCard[];
};
