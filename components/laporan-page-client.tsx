"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, FileText, PieChart as PieChartIcon } from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, SB_KEY } from "@/lib/sandbox-storage";
import type { FinanceRow } from "@/components/finance-page-client";
import type { KamarRow } from "@/components/kamar-page-client";
import type { PenghuniRow, SurveyCalonRow } from "@/components/penghuni-page-client";
import { syncKamarRowsWithPenghuniList } from "@/lib/kamar-penghuni-sync";
import { supabase } from "@/libsupabaseClient";
import { buildLaporanExportPayloadV1 } from "@/lib/laporan-export-payload";
import { LAPORAN_EXPORT_STORAGE_KEY, type ReportFinanceRow, type ReportKamarRow } from "@/lib/laporan-export-types";
import { readDemoProfileSession } from "@/lib/demo-auth";

export type { ReportFinanceRow, ReportKamarRow } from "@/lib/laporan-export-types";

const pieColors = ["#2563eb", "#16a34a", "#dc2626"];

function financeRowToReport(f: FinanceRow): ReportFinanceRow {
  return {
    id: f.id,
    tanggal: f.tanggal,
    kategori: f.kategori,
    nominal: Number(f.nominal) || 0,
    lokasiKos: f.lokasiKos,
    unitBlok: f.unitBlok,
    pos: f.pos ?? "",
  };
}

function kamarRowToReport(k: KamarRow): ReportKamarRow {
  return {
    id: k.id,
    status: k.status,
    lokasiKos: k.lokasiKos,
    unitBlok: k.unitBlok,
  };
}

function toMonthKey(dateString: string) {
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}`;
}

export default function LaporanPageClient({
  financeRows,
  kamarRows,
  penghuniRows: penghuniRowsProp,
  availableLokasi,
  availableUnit,
}: {
  financeRows: ReportFinanceRow[];
  kamarRows: ReportKamarRow[];
  penghuniRows: PenghuniRow[];
  availableLokasi: string[];
  availableUnit: string[];
}) {
  const { localDemoMode } = useSandboxMode();
  const { toast } = useAppFeedback();
  const [profileRole, setProfileRole] = useState("staff");
  /** Nama tampilan ekspor: dari profil login / email (bukan string statis). */
  const [exportUserName, setExportUserName] = useState("");
  const [sandboxRev, setSandboxRev] = useState(0);
  /** Samakan SSR & hydration: jangan baca localStorage sandbox sebelum mount (lihat dashboard). */
  const [sandboxReady, setSandboxReady] = useState(false);
  /** Hindari render Recharts saat prerender server (mencegah width/height -1). */
  const chartReady = sandboxReady;

  useEffect(() => {
    setSandboxReady(true);
    const fn = () => setSandboxRev((n) => n + 1);
    window.addEventListener("secondroom-sandbox-updated", fn as EventListener);
    return () => window.removeEventListener("secondroom-sandbox-updated", fn as EventListener);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadProfile = async () => {
      if (localDemoMode) {
        const demo = readDemoProfileSession();
        if (!cancelled) {
          setProfileRole(demo?.role ?? "staff");
          setExportUserName(demo?.nama || demo?.email || "Pengguna");
        }
        return;
      }
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const rec = data as Record<string, unknown> | null;
      setProfileRole(String(rec?.role ?? "staff").trim() || "staff");
      const fullName = String(rec?.full_name ?? "").trim();
      setExportUserName(fullName || user.email || "Pengguna");
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode]);
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStartDate = new Date(today);
  defaultStartDate.setMonth(today.getMonth() - 5);
  const defaultStart = defaultStartDate.toISOString().slice(0, 10);

  const [selectedLokasi, setSelectedLokasi] = useState("Semua Lokasi");
  const [selectedUnit, setSelectedUnit] = useState("Semua Blok/Unit");
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [openingReport, setOpeningReport] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const effectiveFinanceRows = useMemo(() => {
    if (!localDemoMode) return financeRows;
    if (!sandboxReady) return [];
    return readSandboxJson<FinanceRow[]>(SB_KEY.finance, []).map(financeRowToReport);
  }, [localDemoMode, sandboxReady, financeRows, sandboxRev]);

  const effectiveKamarRows = useMemo(() => {
    if (!localDemoMode) return kamarRows;
    if (!sandboxReady) return [];
    const rawKamar = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
    const pen = readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
    return syncKamarRowsWithPenghuniList(rawKamar, pen).map(kamarRowToReport);
  }, [localDemoMode, sandboxReady, kamarRows, sandboxRev]);

  const effectivePenghuniRows = useMemo(() => {
    if (!localDemoMode) return penghuniRowsProp;
    if (!sandboxReady) return [];
    return readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
  }, [localDemoMode, sandboxReady, penghuniRowsProp, sandboxRev]);

  const effectiveSurveyRows = useMemo(() => {
    if (!localDemoMode) return [] as SurveyCalonRow[];
    if (!sandboxReady) return [];
    return readSandboxJson<SurveyCalonRow[]>(SB_KEY.surveyCalon, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);
  const effectiveAvailableLokasi = useMemo(
    () =>
      Array.from(
        new Set(
          [...effectiveFinanceRows.map((row) => row.lokasiKos), ...effectiveKamarRows.map((row) => row.lokasiKos)].filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [effectiveFinanceRows, effectiveKamarRows]
  );
  const effectiveAvailableUnit = useMemo(
    () =>
      Array.from(
        new Set(
          [...effectiveFinanceRows.map((row) => row.unitBlok), ...effectiveKamarRows.map((row) => row.unitBlok)].filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b)),
    [effectiveFinanceRows, effectiveKamarRows]
  );

  const filteredFinance = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);

    return effectiveFinanceRows.filter((row) => {
      const rowDate = new Date(row.tanggal);
      if (Number.isNaN(rowDate.getTime())) {
        return false;
      }

      const inDateRange = rowDate >= start && rowDate <= end;
      const lokasiMatch = selectedLokasi === "Semua Lokasi" || row.lokasiKos === selectedLokasi;
      const unitMatch = selectedUnit === "Semua Blok/Unit" || row.unitBlok === selectedUnit;
      return inDateRange && lokasiMatch && unitMatch;
    });
  }, [effectiveFinanceRows, endDate, selectedLokasi, selectedUnit, startDate]);

  const unitOptionsByLokasi = useMemo(() => {
    if (selectedLokasi === "Semua Lokasi") {
      return effectiveAvailableUnit;
    }
    const unitSet = new Set<string>();
    effectiveFinanceRows.forEach((row) => {
      if (row.lokasiKos === selectedLokasi && row.unitBlok) {
        unitSet.add(row.unitBlok);
      }
    });
    effectiveKamarRows.forEach((row) => {
      if (row.lokasiKos === selectedLokasi && row.unitBlok) {
        unitSet.add(row.unitBlok);
      }
    });
    return Array.from(unitSet).sort((a, b) => a.localeCompare(b));
  }, [effectiveAvailableUnit, effectiveFinanceRows, effectiveKamarRows, selectedLokasi]);

  const filteredKamar = useMemo(
    () =>
      effectiveKamarRows.filter((row) => {
        const lokasiMatch = selectedLokasi === "Semua Lokasi" || row.lokasiKos === selectedLokasi;
        const unitMatch = selectedUnit === "Semua Blok/Unit" || row.unitBlok === selectedUnit;
        return lokasiMatch && unitMatch;
      }),
    [effectiveKamarRows, selectedLokasi, selectedUnit]
  );

  const monthlyChartData = useMemo(() => {
    const collector = new Map<string, { month: string; pemasukan: number; pengeluaran: number }>();

    filteredFinance.forEach((row) => {
      const monthKey = toMonthKey(row.tanggal);
      if (!monthKey) {
        return;
      }

      const existing = collector.get(monthKey) ?? { month: monthKey, pemasukan: 0, pengeluaran: 0 };
      if (row.kategori === "Pemasukan") {
        existing.pemasukan += row.nominal;
      } else {
        existing.pengeluaran += row.nominal;
      }
      collector.set(monthKey, existing);
    });

    return Array.from(collector.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [filteredFinance]);

  const statusPieData = useMemo(() => {
    const counts = {
      Occupied: 0,
      Available: 0,
      Maintenance: 0,
    };

    filteredKamar.forEach((row) => {
      counts[row.status] += 1;
    });

    return [
      { name: "Occupied", value: counts.Occupied },
      { name: "Available", value: counts.Available },
      { name: "Maintenance", value: counts.Maintenance },
    ];
  }, [filteredKamar]);

  const handleDateRangeChange = (value: string, field: "start" | "end") => {
    if (field === "start") {
      setStartDate(value);
      return;
    }
    setEndDate(value);
  };

  const dateRangeTooLong = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    const oneYearMs = 366 * 24 * 60 * 60 * 1000;
    return diffMs < 0 || diffMs > oneYearMs;
  }, [endDate, startDate]);

  const handleOpenFullReportTab = () => {
    if (dateRangeTooLong) {
      const msg = "Rentang waktu maksimal 1 tahun dan tanggal harus valid.";
      setErrorMessage(msg);
      toast(msg, "error");
      return;
    }

    setErrorMessage("");
    setOpeningReport(true);

    try {
      const generatedAt = new Date();
      const payload = buildLaporanExportPayloadV1({
        generatedAt,
        currentUserName: exportUserName.trim() || "Pengguna",
        userProfileRole: profileRole,
        localDemoMode,
        filters: {
          startDate,
          endDate,
          selectedLokasi,
          selectedUnit,
        },
        filteredFinance,
        filteredKamar,
        monthlyChartData,
        statusPieData,
        penghuniRows: effectivePenghuniRows,
        surveyRows: effectiveSurveyRows,
      });

      const json = JSON.stringify(payload);
      try {
        localStorage.setItem(LAPORAN_EXPORT_STORAGE_KEY, json);
      } catch {
        toast("Penyimpanan penuh. Kurangi data atau kosongkan situs.", "error");
        setOpeningReport(false);
        return;
      }

      window.open("/laporan/cetak", "_blank", "noopener,noreferrer");
      toast("Tab laporan lengkap dibuka. Gunakan Print, Unduh HTML, atau Email di sana.", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menyiapkan laporan.";
      setErrorMessage(msg);
      toast(msg, "error");
    } finally {
      setOpeningReport(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
        <div className="grid gap-4 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-[#5d6fc0]">Lokasi Kos</label>
            <select
              value={selectedLokasi}
              onChange={(event) => {
                setSelectedLokasi(event.target.value);
                setSelectedUnit("Semua Blok/Unit");
              }}
              className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8ea2ff] dark:border-[#424a80] dark:bg-[#1b1f3d]"
            >
              <option>Semua Lokasi</option>
              {effectiveAvailableLokasi.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-[#5d6fc0]">Unit / Blok</label>
            <select
              value={selectedUnit}
              onChange={(event) => setSelectedUnit(event.target.value)}
              className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8ea2ff] dark:border-[#424a80] dark:bg-[#1b1f3d]"
            >
              <option>Semua Blok/Unit</option>
              {unitOptionsByLokasi.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-[#5d6fc0]">Mulai Tanggal</label>
            <input
              type="date"
              value={startDate}
              onChange={(event) => handleDateRangeChange(event.target.value, "start")}
              className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8ea2ff] dark:border-[#424a80] dark:bg-[#1b1f3d]"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-[#5d6fc0]">Sampai Tanggal</label>
            <input
              type="date"
              value={endDate}
              onChange={(event) => handleDateRangeChange(event.target.value, "end")}
              className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#8ea2ff] dark:border-[#424a80] dark:bg-[#1b1f3d]"
            />
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <div className="space-y-5">
        <p className="rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-3 text-sm text-[#4f61aa] dark:border-[#424a80] dark:bg-[#1b1f3d] dark:text-[#dbe3ff]">
          Pratinjau grafik di halaman ini. Untuk laporan lengkap (logo, ringkasan seperti dashboard, tabel finance,
          penghuni, survey) gunakan tombol di bawah — halaman dibuka di tab baru dengan opsi print / unduh HTML /
          email.
        </p>

        <section className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#1f1b42] dark:text-[#dbe3ff]">
            <BarChart3 size={18} className={iconTone.info} />
            Pemasukan vs Pengeluaran per Bulan
          </h2>
          <div className="h-80 w-full">
            {chartReady ? (
              <ResponsiveContainer>
                <LineChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="pemasukan" stroke="#16a34a" strokeWidth={2} />
                  <Line type="monotone" dataKey="pengeluaran" stroke="#dc2626" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            ) : null}
          </div>

          <div className="mt-5 h-72 w-full">
            {chartReady ? (
              <ResponsiveContainer>
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="pemasukan" fill="#16a34a" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="pengeluaran" fill="#dc2626" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#1f1b42] dark:text-[#dbe3ff]">
            <PieChartIcon size={18} className={iconTone.brand} />
            Pie Chart Status Kamar
          </h2>
          <div className="h-80 w-full">
            {chartReady ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={statusPieData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={110}
                    innerRadius={45}
                    label
                  >
                    {statusPieData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : null}
          </div>
        </section>
      </div>

      <button
        type="button"
        onClick={handleOpenFullReportTab}
        disabled={openingReport}
        className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-8 py-3 text-sm font-semibold tracking-[0.14em] text-[#eef3ff] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <FileText size={16} className={iconTone.info} aria-hidden />
        {openingReport ? "Membuka…" : "Buka laporan lengkap (tab baru)"}
      </button>
    </div>
  );
}
