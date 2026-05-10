import type { PenghuniRow, SurveyCalonRow } from "@/components/penghuni-page-client";
import { isExcludedFromOwnerDashboardRevenue } from "@/lib/finance-dashboard-revenue";
import type { LaporanMonthlyFinanceRow } from "@/lib/laporan-finance-breakdown";
import { computeLaporanFinanceBreakdown } from "@/lib/laporan-finance-breakdown";
import type {
  LaporanDashboardCard,
  LaporanExportPayloadV1,
  LaporanPenghuniSnap,
  LaporanSurveySnap,
  ReportFinanceRow,
  ReportKamarRow,
} from "@/lib/laporan-export-types";

function lokasiMatch(selectedLokasi: string, rowLokasi: string) {
  return selectedLokasi === "Semua Lokasi" || rowLokasi === selectedLokasi;
}

function unitMatch(selectedUnit: string, rowUnit: string) {
  return selectedUnit === "Semua Blok/Unit" || rowUnit === selectedUnit;
}

function filterPenghuniSurvey(
  selectedLokasi: string,
  selectedUnit: string,
  penghuni: PenghuniRow[],
  survey: SurveyCalonRow[]
): { penghuni: LaporanPenghuniSnap[]; survey: LaporanSurveySnap[] } {
  const pen = penghuni
    .filter((p) => lokasiMatch(selectedLokasi, p.lokasiKos) && unitMatch(selectedUnit, p.unitBlok))
    .map(
      (p): LaporanPenghuniSnap => ({
        namaLengkap: p.namaLengkap,
        lokasiKos: p.lokasiKos,
        unitBlok: p.unitBlok,
        noKamar: p.noKamar,
        status: p.status,
        tglCheckIn: p.tglCheckIn,
        tglCheckOut: p.tglCheckOut,
      })
    );
  const sur = survey
    .filter((s) => lokasiMatch(selectedLokasi, s.lokasiKos) && unitMatch(selectedUnit, s.unitBlok))
    .map(
      (s): LaporanSurveySnap => ({
        namaLengkap: s.namaLengkap,
        lokasiKos: s.lokasiKos,
        unitBlok: s.unitBlok,
        rencanaCheckIn: s.rencanaCheckIn,
        noWa: s.noWa,
      })
    );
  return { penghuni: pen, survey: sur };
}

function formatRp(n: number): string {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

export function buildLaporanExportPayloadV1(params: {
  generatedAt: Date;
  currentUserName: string;
  userProfileRole: string;
  localDemoMode: boolean;
  laporanFokus?: "kos" | "manajemen";
  filters: {
    startDate: string;
    endDate: string;
    selectedLokasi: string;
    selectedUnit: string;
  };
  filteredFinance: ReportFinanceRow[];
  filteredKamar: ReportKamarRow[];
  monthlyChartData: LaporanMonthlyFinanceRow[];
  statusPieData: { name: string; value: number }[];
  penghuniRows: PenghuniRow[];
  surveyRows: SurveyCalonRow[];
}): LaporanExportPayloadV1 {
  const {
    generatedAt,
    currentUserName,
    userProfileRole,
    localDemoMode,
    laporanFokus,
    filters,
    filteredFinance,
    filteredKamar,
    monthlyChartData,
    statusPieData,
    penghuniRows,
    surveyRows,
  } = params;

  const total = filteredKamar.length;
  const occupied = filteredKamar.filter((k) => k.status === "Occupied").length;
  const available = filteredKamar.filter((k) => k.status === "Available").length;
  const maintenance = filteredKamar.filter((k) => k.status === "Maintenance").length;
  const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;

  const finBreak = computeLaporanFinanceBreakdown(filteredFinance);

  const pemasukanRows = filteredFinance.filter((f) => f.kategori === "Pemasukan");
  const revenueOwnerRows = pemasukanRows.filter(
    (f) => !isExcludedFromOwnerDashboardRevenue(f.pos ?? "")
  );
  const revenueOwnerView = revenueOwnerRows.reduce((s, f) => s + f.nominal, 0);

  const { penghuni: penSnaps, survey: surSnaps } = filterPenghuniSurvey(
    filters.selectedLokasi,
    filters.selectedUnit,
    penghuniRows,
    surveyRows
  );

  const penghuniStay = penSnaps.filter((p) => p.status === "Stay").length;
  const penghuniBooking = penSnaps.filter((p) => p.status === "Booking").length;
  const surveyTotalAll = surveyRows.length;
  const surveyFiltered = surSnaps.length;

  const dashboardCards: LaporanDashboardCard[] = [
    {
      label: "Kamar Occupied",
      value: String(occupied),
      note: total ? `${occupied} dari ${total} kamar` : "Belum ada data kamar",
    },
    {
      label: "Kamar Available",
      value: String(available),
      note: total ? `${available} tersedia` : "Tambah di halaman Kamar",
    },
    {
      label: "Maintenance",
      value: String(maintenance),
      note: maintenance ? "Perlu perhatian" : "Tidak ada",
    },
    {
      label: "Calon survey",
      value: String(surveyFiltered),
      note:
        surveyTotalAll === 0
          ? "Tambah lewat Penghuni → Survey Baru"
          : `${surveyTotalAll} total · ${surveyFiltered} sesuai filter`,
    },
    {
      label: "Pemasukan kos (sewa + booking)",
      value: formatRp(finBreak.pemasukanKosTotal),
      note:
        finBreak.pemasukanKosTransactionCount === 0
          ? "Basis P&L kos — belum ada transaksi sewa/booking"
          : `${finBreak.pemasukanKosTransactionCount} transaksi`,
    },
    {
      label: "Pengeluaran kos",
      value: formatRp(finBreak.pengeluaranKosTotal),
      note:
        finBreak.pengeluaranKosTransactionCount === 0
          ? "Dipotong dari pemasukan sewa (POS Master: kos)"
          : `${finBreak.pengeluaranKosTransactionCount} transaksi`,
    },
    {
      label: "P&L Kos",
      value: formatRp(finBreak.plKosNominal),
      note: "Pemasukan kos − pengeluaran kos",
    },
    {
      label: "Pemasukan manajemen",
      value: formatRp(finBreak.pemasukanManajemenTotal),
      note:
        finBreak.pemasukanManajemenTransactionCount === 0
          ? "Dasar P&L manajemen"
          : `${finBreak.pemasukanManajemenTransactionCount} transaksi`,
    },
    {
      label: "Pengeluaran manajemen",
      value: formatRp(finBreak.pengeluaranManajemenTotal),
      note:
        finBreak.pengeluaranManajemenTransactionCount === 0
          ? "POS Master: manajemen"
          : `${finBreak.pengeluaranManajemenTransactionCount} transaksi`,
    },
    {
      label: "P&L Manajemen",
      value: formatRp(finBreak.plManajemenNominal),
      note: "Pemasukan manajemen − pengeluaran manajemen",
    },
  ];

  return {
    v: 1,
    generatedAt: generatedAt.toISOString(),
    currentUserName,
    userProfileRole,
    localDemoMode,
    laporanFokus,
    filters,
    summary: {
      kamarTotal: total,
      occupied,
      available,
      maintenance,
      occupancyPct,
      pemasukanTotal: finBreak.pemasukanTotal,
      pemasukanKosTotal: finBreak.pemasukanKosTotal,
      pemasukanManajemenTotal: finBreak.pemasukanManajemenTotal,
      pengeluaranKosTotal: finBreak.pengeluaranKosTotal,
      pengeluaranManajemenTotal: finBreak.pengeluaranManajemenTotal,
      plKosNominal: finBreak.plKosNominal,
      plManajemenNominal: finBreak.plManajemenNominal,
      revenueOwnerView,
      pengeluaranTotal: finBreak.pengeluaranTotal,
      penghuniStay,
      penghuniBooking,
      surveyCount: surveyFiltered,
      surveyTotalAll,
      pemasukanTransactionCount: pemasukanRows.length,
      pemasukanTransactionCountOwnerView: revenueOwnerRows.length,
      pemasukanKosTransactionCount: finBreak.pemasukanKosTransactionCount,
      pemasukanManajemenTransactionCount: finBreak.pemasukanManajemenTransactionCount,
      pengeluaranKosTransactionCount: finBreak.pengeluaranKosTransactionCount,
      pengeluaranManajemenTransactionCount: finBreak.pengeluaranManajemenTransactionCount,
      pengeluaranTransactionCount: finBreak.pengeluaranTransactionCount,
    },
    monthly: monthlyChartData,
    kamarByStatus: statusPieData,
    financeRows: filteredFinance,
    penghuniRows: penSnaps,
    surveyRows: surSnaps,
    dashboardCards,
  };
}
