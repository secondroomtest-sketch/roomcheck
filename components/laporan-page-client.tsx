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
import { financePageRowToReportRow } from "@/lib/laporan-finance-page-row-to-report";
import { computeMonthlyChartData } from "@/lib/laporan-monthly-chart-data";
import { openLaporanCetakTabWithPayload } from "@/lib/laporan-open-cetak-tab";
import { financeRowInYmdInclusiveRange, ymdRangeInvalidOrTooLong } from "@/lib/laporan-report-dates";
import { type ReportFinanceRow, type ReportKamarRow } from "@/lib/laporan-export-types";
import { readDemoProfileSession } from "@/lib/demo-auth";
import { normalizeUserProfileRole } from "@/lib/user-profile-role";
import { useSupabaseSessionHydrated } from "@/components/supabase-session-ready";
import { useCloudDataResyncTick } from "@/components/cloud-resync-hook";
import {
  pageFieldClass as lapFieldClass,
  pageLabelClass as lapLabelClass,
  pageSectionClass as lapSectionClass,
  pageSectionTitleClass as lapSectionTitleClass,
} from "@/lib/ui-page-layout";
import {
  buildPenghuniLookupMap,
  canSelectAllLokasiDanBlok,
  lokasiNamesForOwnerCloud,
  mapCloudFinanceRow,
  mapCloudKamarRow,
  mapCloudPenghuniRow,
  mapCloudSurveyRow,
  unitNamesForOwnerCloud,
} from "@/lib/laporan-fetch-mappers";
import {
  isForcedPemasukanManajemenFinancePos,
  isPemasukanKosReportRow,
} from "@/lib/laporan-finance-breakdown";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";
import type { LaporanFokusCetak } from "@/lib/laporan-cetak-filters";
import LaporanLengkapChoiceModal from "@/components/laporan-lengkap-choice-modal";

export type { ReportFinanceRow, ReportKamarRow } from "@/lib/laporan-export-types";

const pieColors = ["#2563eb", "#16a34a", "#dc2626"];
const LOKASI_SEMUA = "Semua Lokasi";
const UNIT_SEMUA = "Semua Blok/Unit";

type PlTableRow = {
  pemasukan: number;
  pengeluaran: number;
  saldo: number;
  keterangan: string;
  isTotal?: boolean;
};

function formatRp(value: number): string {
  return `Rp ${Number(value || 0).toLocaleString("id-ID")}`;
}

/** Di bawah lebar `md` (768px), legenda di dalam Recharts sering bertumpuk — pakai legenda inline. */
function useChartCompact(maxWidthPx = 767) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${maxWidthPx}px)`);
    const apply = () => setCompact(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [maxWidthPx]);
  return compact;
}

function InlineChartLegend({ items }: { items: { color: string; label: string }[] }) {
  return (
    <ul
      className="mt-2.5 grid grid-cols-1 gap-x-3 gap-y-2 border-t border-[#e0e6ff] pt-2.5 min-[400px]:grid-cols-2 dark:border-[#39437a]"
      role="list"
      aria-label="Keterangan warna grafik"
    >
      {items.map((item) => (
        <li
          key={item.label}
          className="flex min-h-[1.35rem] items-start gap-2 text-[11px] leading-snug text-[#4f61aa] dark:text-[#c5d1ff]"
        >
          <span
            className="mt-[0.35rem] size-2 shrink-0 rounded-full shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.12]"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          <span className="min-w-0 flex-1">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

const LINE_CHART_LEGEND_ITEMS = [
  { color: "#15803d", label: "Pemasukan sewa (P&L kos)" },
  { color: "#b91c1c", label: "Pengeluaran kos" },
  { color: "#059669", label: "Margin (P&L manajemen)" },
  { color: "#c2410c", label: "Pengeluaran manajemen" },
] as const;

const BAR_CHART_LEGEND_ITEMS = [
  { color: "#15803d", label: "Sewa kamar" },
  { color: "#ef4444", label: "Keluar kos" },
  { color: "#34d399", label: "Margin" },
  { color: "#ea580c", label: "Keluar manajemen" },
] as const;

function PlTableMobileCards({ rows }: { rows: PlTableRow[] }) {
  return (
    <ul className="flex flex-col gap-2.5 md:hidden" role="list">
      {rows.map((row, idx) => (
        <li
          key={`pl-card-${idx}-${row.keterangan}`}
          className={`touch-manipulation rounded-xl border px-3.5 py-3 shadow-sm dark:shadow-none ${
            row.isTotal
              ? "border-[#9aaef0]/55 bg-[#eef2ff] ring-2 ring-[#d6ddff]/80 dark:border-[#4f5fb0] dark:bg-[#232c58] dark:ring-[#39437a]"
              : "border-[#d8defc] bg-white/95 dark:border-[#424a80] dark:bg-[#1b1f3d]/90"
          }`}
        >
          <p
            className={`leading-snug text-[#1f1b42] dark:text-[#dbe3ff] ${
              row.isTotal ? "text-[0.9375rem] font-bold tracking-tight" : "text-[13px] font-semibold"
            }`}
          >
            {row.keterangan}
          </p>
          <dl className="mt-2.5 space-y-0 rounded-lg bg-[#f7f9ff]/80 p-2.5 dark:bg-[#14182d]/85">
            <div className="flex items-center justify-between gap-3 py-1.5">
              <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-[#5d6fc0]/95 dark:text-[#a8b5e8]">
                Pemasukan
              </dt>
              <dd className="truncate text-right text-[13px] font-semibold tabular-nums tracking-tight text-emerald-700 dark:text-emerald-300">
                {formatRp(row.pemasukan)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#e2e9ff]/90 py-1.5 dark:border-[#353c64]/90">
              <dt className="shrink-0 text-[11px] font-medium uppercase tracking-wide text-[#5d6fc0]/95 dark:text-[#a8b5e8]">
                Pengeluaran
              </dt>
              <dd className="truncate text-right text-[13px] font-semibold tabular-nums tracking-tight text-rose-700 dark:text-rose-300">
                {formatRp(row.pengeluaran)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t-2 border-[#c9d6ff]/80 pt-2 dark:border-[#4a5585]/70">
              <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#4457a6] dark:text-[#aeb9f0]">
                Saldo
              </dt>
              <dd className="truncate text-right text-[0.9375rem] font-bold tabular-nums tracking-tight text-[#1f1b42] dark:text-[#eef2ff]">
                {formatRp(row.saldo)}
              </dd>
            </div>
          </dl>
        </li>
      ))}
    </ul>
  );
}

function kamarRowToReport(k: KamarRow): ReportKamarRow {
  return {
    id: k.id,
    status: k.status,
    lokasiKos: k.lokasiKos,
    unitBlok: k.unitBlok,
  };
}

export default function LaporanPageClient({
  financeRows: _financeRows,
  kamarRows: _kamarRows,
  penghuniRows: _penghuniRowsProp,
  surveyRows: _surveyRowsProp,
  availableLokasi: _availableLokasi,
  availableUnit: _availableUnit,
}: {
  financeRows: ReportFinanceRow[];
  kamarRows: ReportKamarRow[];
  penghuniRows: PenghuniRow[];
  surveyRows: SurveyCalonRow[];
  availableLokasi: string[];
  availableUnit: string[];
}) {
  const sessionHydrated = useSupabaseSessionHydrated();
  const cloudSyncTick = useCloudDataResyncTick();
  const { localDemoMode } = useSandboxMode();
  const { toast } = useAppFeedback();
  const [profileRole, setProfileRole] = useState("staff");
  /** Nama tampilan ekspor: dari profil login / email (bukan string statis). */
  const [exportUserName, setExportUserName] = useState("");
  const [sandboxRev, setSandboxRev] = useState(0);
  const [sandboxReady, setSandboxReady] = useState(false);
  const [aksesLokasiIds, setAksesLokasiIds] = useState<string[]>([]);
  const [aksesBlokIds, setAksesBlokIds] = useState<string[]>([]);
  const [cloudFinance, setCloudFinance] = useState<ReportFinanceRow[]>([]);
  const [cloudKamar, setCloudKamar] = useState<ReportKamarRow[]>([]);
  const [cloudPenghuni, setCloudPenghuni] = useState<PenghuniRow[]>([]);
  const [cloudSurvey, setCloudSurvey] = useState<SurveyCalonRow[]>([]);
  const [cloudLokasi, setCloudLokasi] = useState<{ id: string; nama: string }[]>([]);
  const [cloudBlok, setCloudBlok] = useState<{ id: string; lokasiId: string; nama: string }[]>([]);
  const [cloudSyncReady, setCloudSyncReady] = useState(false);
  const [cloudDataLoadError, setCloudDataLoadError] = useState("");
  /** Hindari render Recharts saat prerender server; di cloud tunggu fetch Supabase selesai. */
  const chartReady = sandboxReady && (localDemoMode || cloudSyncReady);
  const chartCompact = useChartCompact();

  useEffect(() => {
    setSandboxReady(true);
    const fn = () => setSandboxRev((n) => n + 1);
    window.addEventListener("secondroom-sandbox-updated", fn as EventListener);
    return () => window.removeEventListener("secondroom-sandbox-updated", fn as EventListener);
  }, []);

  useEffect(() => {
    if (localDemoMode) {
      const demo = readDemoProfileSession();
      setProfileRole(normalizeUserProfileRole(demo?.role));
      setExportUserName(demo?.nama || demo?.email || "Pengguna");
      setAksesLokasiIds(demo?.aksesLokasi ?? []);
      setAksesBlokIds(demo?.aksesBlok ?? []);
      setCloudFinance([]);
      setCloudKamar([]);
      setCloudPenghuni([]);
      setCloudSurvey([]);
      setCloudLokasi([]);
      setCloudBlok([]);
      setCloudSyncReady(false);
      setCloudDataLoadError("");
      return;
    }

    let cancelled = false;
    const syncCloud = async () => {
      if (!sessionHydrated) return;
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;

      if (!user) {
        setProfileRole("staff");
        setExportUserName("");
        setAksesLokasiIds([]);
        setAksesBlokIds([]);
        setCloudFinance([]);
        setCloudKamar([]);
        setCloudPenghuni([]);
        setCloudSurvey([]);
        setCloudLokasi([]);
        setCloudBlok([]);
        setCloudDataLoadError("");
        setCloudSyncReady(true);
        return;
      }

      setCloudDataLoadError("");
      const [profRes, finRes, kamRes, penRes, lokRes, blokRes] = await Promise.all([
        supabase.from("user_profiles").select("full_name, role, akses_lokasi, akses_blok").eq("id", user.id).maybeSingle(),
        supabase.from("finance").select("*"),
        supabase.from("kamar").select("*"),
        supabase.from("penghuni").select("*"),
        supabase.from("master_lokasi").select("id, nama_lokasi").order("nama_lokasi", { ascending: true }),
        supabase.from("master_blok").select("id, lokasi_id, nama_blok").order("nama_blok", { ascending: true }),
      ]);

      if (cancelled) return;

      const loadErrs = [profRes.error, finRes.error, kamRes.error, penRes.error, lokRes.error, blokRes.error].filter(
        Boolean
      ) as { message: string }[];
      setCloudDataLoadError(loadErrs.map((e) => e.message).join(" · ") || "");

      const rec = profRes.data as Record<string, unknown> | null;
      setProfileRole(normalizeUserProfileRole(rec?.role));
      const fullName = String(rec?.full_name ?? "").trim();
      setExportUserName(fullName || user.email || "Pengguna");
      const al = rec?.akses_lokasi;
      const ab = rec?.akses_blok;
      setAksesLokasiIds(Array.isArray(al) ? al.map((x) => String(x)) : []);
      setAksesBlokIds(Array.isArray(ab) ? ab.map((x) => String(x)) : []);

      const rawPen = (penRes.data ?? []) as Array<Record<string, unknown>>;
      const lookup = buildPenghuniLookupMap(rawPen);

      setCloudFinance((finRes.data ?? []).map((r) => mapCloudFinanceRow(r as Record<string, unknown>, lookup)));
      setCloudKamar((kamRes.data ?? []).map((r) => mapCloudKamarRow(r as Record<string, unknown>)));
      setCloudPenghuni(
        rawPen.filter((row) => String(row.status ?? "").toLowerCase() !== "survey").map((r) => mapCloudPenghuniRow(r))
      );
      setCloudSurvey(
        rawPen.filter((row) => String(row.status ?? "").toLowerCase() === "survey").map((r) => mapCloudSurveyRow(r))
      );

      setCloudLokasi(
        (lokRes.data ?? [])
          .map((r) => {
            const x = r as Record<string, unknown>;
            return { id: String(x.id ?? ""), nama: String(x.nama_lokasi ?? "").trim() };
          })
          .filter((x) => x.id && x.nama)
      );
      setCloudBlok(
        (blokRes.data ?? [])
          .map((r) => {
            const x = r as Record<string, unknown>;
            return {
              id: String(x.id ?? ""),
              lokasiId: String(x.lokasi_id ?? ""),
              nama: String(x.nama_blok ?? "").trim(),
            };
          })
          .filter((x) => x.id && x.nama && x.lokasiId)
      );
      setCloudSyncReady(true);
    };

    void syncCloud();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);
  const today = new Date();
  const defaultEnd = today.toISOString().slice(0, 10);
  const defaultStartDate = new Date(today);
  defaultStartDate.setMonth(today.getMonth() - 5);
  const defaultStart = defaultStartDate.toISOString().slice(0, 10);

  const [selectedLokasi, setSelectedLokasi] = useState(LOKASI_SEMUA);
  const [selectedUnit, setSelectedUnit] = useState(UNIT_SEMUA);
  const [draftFilterStartDate, setDraftFilterStartDate] = useState(defaultStart);
  const [draftFilterEndDate, setDraftFilterEndDate] = useState(defaultEnd);
  const [appliedFilterStartDate, setAppliedFilterStartDate] = useState(defaultStart);
  const [appliedFilterEndDate, setAppliedFilterEndDate] = useState(defaultEnd);
  const [dateRangeInitialized, setDateRangeInitialized] = useState(false);
  const [openingReport, setOpeningReport] = useState(false);
  const [filterApplyBusy, setFilterApplyBusy] = useState(false);
  const [laporanChoiceOpen, setLaporanChoiceOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const effectiveFinanceRows = useMemo(() => {
    if (!localDemoMode) return cloudSyncReady ? cloudFinance : [];
    if (!sandboxReady) return [];
    return readSandboxJson<FinanceRow[]>(SB_KEY.finance, []).map(financePageRowToReportRow);
  }, [localDemoMode, sandboxReady, cloudSyncReady, cloudFinance, sandboxRev]);

  const effectiveKamarRows = useMemo(() => {
    if (!localDemoMode) return cloudSyncReady ? cloudKamar : [];
    if (!sandboxReady) return [];
    const rawKamar = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
    const pen = readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
    return syncKamarRowsWithPenghuniList(rawKamar, pen).map(kamarRowToReport);
  }, [localDemoMode, sandboxReady, cloudSyncReady, cloudKamar, sandboxRev]);

  const effectivePenghuniRows = useMemo(() => {
    if (!localDemoMode) return cloudSyncReady ? cloudPenghuni : [];
    if (!sandboxReady) return [];
    return readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
  }, [localDemoMode, sandboxReady, cloudSyncReady, cloudPenghuni, sandboxRev]);

  const effectiveSurveyRows = useMemo(() => {
    if (!localDemoMode) return cloudSyncReady ? cloudSurvey : [];
    if (!sandboxReady) return [];
    return readSandboxJson<SurveyCalonRow[]>(SB_KEY.surveyCalon, []);
  }, [localDemoMode, sandboxReady, cloudSyncReady, cloudSurvey, sandboxRev]);

  /**
   * Samakan perilaku awal dengan halaman Finance: rentang tanggal default = seluruh data yang tersedia.
   * Ini mencegah total P&L awal tampak lebih kecil hanya karena default 6 bulan.
   */
  useEffect(() => {
    if (dateRangeInitialized) return;
    const dates = effectiveFinanceRows
      .map((r) => String(r.tanggal ?? "").slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort((a, b) => a.localeCompare(b));
    if (!dates.length) return;
    setDraftFilterStartDate(dates[0]);
    setDraftFilterEndDate(dates[dates.length - 1]);
    setAppliedFilterStartDate(dates[0]);
    setAppliedFilterEndDate(dates[dates.length - 1]);
    setDateRangeInitialized(true);
  }, [dateRangeInitialized, effectiveFinanceRows]);

  /** Lokasi turun dari baris data sandbox (mode demo). */
  const effectiveAvailableLokasi = useMemo(
    () =>
      Array.from(
        new Set(
          [...effectiveFinanceRows.map((row) => row.lokasiKos), ...effectiveKamarRows.map((row) => row.lokasiKos)].filter(
            (x) => x && x !== "Unknown"
          )
        )
      ).sort((a, b) => a.localeCompare(b, "id")),
    [effectiveFinanceRows, effectiveKamarRows]
  );

  /** Fallback cloud: nama lokasi dari finance/kamar jika master kosong. */
  const rowDerivedLokasiFallback = useMemo(
    () =>
      Array.from(
        new Set(
          [...effectiveFinanceRows.map((row) => row.lokasiKos), ...effectiveKamarRows.map((row) => row.lokasiKos)].filter(
            (x) => x && x !== "Unknown"
          )
        )
      ).sort((a, b) => a.localeCompare(b, "id")),
    [effectiveFinanceRows, effectiveKamarRows]
  );

  const lokasiSelectOptions = useMemo(() => {
    if (localDemoMode) {
      return [LOKASI_SEMUA, ...effectiveAvailableLokasi.filter((x) => x !== LOKASI_SEMUA)];
    }
    const globalScope = canSelectAllLokasiDanBlok(profileRole);
    let base: string[] = [];

    if (cloudLokasi.length > 0) {
      if (globalScope) {
        base = cloudLokasi.map((l) => l.nama);
      } else {
        const filtered = lokasiNamesForOwnerCloud(cloudLokasi, aksesLokasiIds);
        if (aksesLokasiIds.length === 0) {
          base = ["(Belum diatur akses lokasi di Master)"];
        } else if (filtered.length > 0) {
          base = filtered;
        } else {
          base = ["(Tidak ada lokasi cocok master + akses)"];
        }
      }
    } else if (cloudSyncReady) {
      base = rowDerivedLokasiFallback;
    }

    if (globalScope && base.length > 0 && !String(base[0] ?? "").startsWith("(")) {
      return [LOKASI_SEMUA, ...base.filter((x) => x !== LOKASI_SEMUA)];
    }
    return base;
  }, [
    localDemoMode,
    profileRole,
    effectiveAvailableLokasi,
    cloudLokasi,
    cloudSyncReady,
    aksesLokasiIds,
    rowDerivedLokasiFallback,
  ]);

  useEffect(() => {
    if (!lokasiSelectOptions.length) return;
    if (!lokasiSelectOptions.includes(selectedLokasi)) {
      setSelectedLokasi(lokasiSelectOptions[0]);
      setSelectedUnit(UNIT_SEMUA);
    }
  }, [lokasiSelectOptions, selectedLokasi]);

  const unitOptionsForSelect = useMemo(() => {
    if (localDemoMode) {
      if (selectedLokasi === LOKASI_SEMUA) {
        return Array.from(
          new Set(
            [...effectiveFinanceRows.map((r) => r.unitBlok), ...effectiveKamarRows.map((r) => r.unitBlok)].filter(
              (x) => x && x !== "Unknown"
            )
          )
        ).sort((a, b) => a.localeCompare(b, "id"));
      }
      const unitSet = new Set<string>();
      effectiveFinanceRows.forEach((row) => {
        if (row.lokasiKos === selectedLokasi && row.unitBlok) unitSet.add(row.unitBlok);
      });
      effectiveKamarRows.forEach((row) => {
        if (row.lokasiKos === selectedLokasi && row.unitBlok) unitSet.add(row.unitBlok);
      });
      return Array.from(unitSet).sort((a, b) => a.localeCompare(b, "id"));
    }

    const globalScope = canSelectAllLokasiDanBlok(profileRole);

    let units: string[];
    if (cloudBlok.length === 0) {
      if (selectedLokasi === LOKASI_SEMUA) {
        units = Array.from(
          new Set(
            [...effectiveFinanceRows.map((r) => r.unitBlok), ...effectiveKamarRows.map((r) => r.unitBlok)].filter(
              (x) => x && x !== "Unknown"
            )
          )
        ).sort((a, b) => a.localeCompare(b, "id"));
      } else {
        const us = new Set<string>();
        effectiveFinanceRows.forEach((row) => {
          if (row.lokasiKos === selectedLokasi && row.unitBlok) us.add(row.unitBlok);
        });
        effectiveKamarRows.forEach((row) => {
          if (row.lokasiKos === selectedLokasi && row.unitBlok) us.add(row.unitBlok);
        });
        units = Array.from(us).sort((a, b) => a.localeCompare(b, "id"));
      }
    } else if (selectedLokasi === LOKASI_SEMUA && globalScope) {
      units = Array.from(new Set(cloudBlok.map((b) => b.nama))).sort((a, b) => a.localeCompare(b, "id"));
    } else {
      const lok = cloudLokasi.find((l) => l.nama === selectedLokasi);
      units = lok
        ? cloudBlok
            .filter((b) => b.lokasiId === lok.id)
            .map((b) => b.nama)
            .sort((a, b) => a.localeCompare(b, "id"))
        : [];
    }

    if (!globalScope && cloudBlok.length > 0) {
      units = unitNamesForOwnerCloud(units, aksesBlokIds, cloudBlok);
    }
    return units;
  }, [
    localDemoMode,
    profileRole,
    selectedLokasi,
    effectiveFinanceRows,
    effectiveKamarRows,
    cloudBlok,
    cloudLokasi,
    aksesBlokIds,
  ]);

  useEffect(() => {
    if (selectedUnit === UNIT_SEMUA) return;
    if (!unitOptionsForSelect.includes(selectedUnit)) {
      setSelectedUnit(UNIT_SEMUA);
    }
  }, [selectedUnit, unitOptionsForSelect]);

  const filteredFinance = useMemo(() => {
    return effectiveFinanceRows.filter((row) => {
      const inDateRange = financeRowInYmdInclusiveRange(row, appliedFilterStartDate, appliedFilterEndDate);
      const lokasiMatch = selectedLokasi === LOKASI_SEMUA || row.lokasiKos === selectedLokasi;
      const unitMatch = selectedUnit === UNIT_SEMUA || row.unitBlok === selectedUnit;
      return inDateRange && lokasiMatch && unitMatch;
    });
  }, [effectiveFinanceRows, appliedFilterEndDate, appliedFilterStartDate, selectedLokasi, selectedUnit]);

  const filteredKamar = useMemo(
    () =>
      effectiveKamarRows.filter((row) => {
        const lokasiMatch = selectedLokasi === LOKASI_SEMUA || row.lokasiKos === selectedLokasi;
        const unitMatch = selectedUnit === UNIT_SEMUA || row.unitBlok === selectedUnit;
        return lokasiMatch && unitMatch;
      }),
    [effectiveKamarRows, selectedLokasi, selectedUnit]
  );

  const monthlyChartData = useMemo(
    () => computeMonthlyChartData(filteredFinance),
    [filteredFinance]
  );

  const plKosTableRows = useMemo(() => {
    const map = new Map<string, PlTableRow>();
    for (const row of filteredFinance) {
      if (row.kategori === "Pemasukan" && isPemasukanKosReportRow(row)) {
        const key = `p:${(row.pos ?? "").trim() || "Pemasukan kos lain"}`;
        const prev = map.get(key) ?? { pemasukan: 0, pengeluaran: 0, saldo: 0, keterangan: "" };
        const pemasukan = prev.pemasukan + row.nominal;
        map.set(key, { ...prev, pemasukan, saldo: pemasukan - prev.pengeluaran, keterangan: `Pemasukan · ${key.slice(2)}` });
      } else if (row.kategori === "Pengeluaran" && normalizePengeluaranScope(row.pengeluaranScope) !== "manajemen") {
        const key = `k:${(row.pos ?? "").trim() || "Pengeluaran kos lain"}`;
        const prev = map.get(key) ?? { pemasukan: 0, pengeluaran: 0, saldo: 0, keterangan: "" };
        const pengeluaran = prev.pengeluaran + row.nominal;
        map.set(key, { ...prev, pengeluaran, saldo: prev.pemasukan - pengeluaran, keterangan: `Pengeluaran · ${key.slice(2)}` });
      }
    }
    const rows = Array.from(map.values()).sort((a, b) => a.keterangan.localeCompare(b.keterangan, "id"));
    const totalPemasukan = rows.reduce((s, r) => s + r.pemasukan, 0);
    const totalPengeluaran = rows.reduce((s, r) => s + r.pengeluaran, 0);
    rows.push({
      pemasukan: totalPemasukan,
      pengeluaran: totalPengeluaran,
      saldo: totalPemasukan - totalPengeluaran,
      keterangan: "TOTAL P&L Kos",
      isTotal: true,
    });
    return rows;
  }, [filteredFinance]);

  const plManajemenTableRows = useMemo(() => {
    const map = new Map<string, PlTableRow>();
    for (const row of filteredFinance) {
      if (
        (row.kategori === "Pemasukan" && !isPemasukanKosReportRow(row)) ||
        (row.kategori === "Pengeluaran" && isForcedPemasukanManajemenFinancePos(row.pos))
      ) {
        const key = `p:${(row.pos ?? "").trim() || "Pemasukan manajemen lain"}`;
        const prev = map.get(key) ?? { pemasukan: 0, pengeluaran: 0, saldo: 0, keterangan: "" };
        const pemasukan = prev.pemasukan + row.nominal;
        map.set(key, {
          ...prev,
          pemasukan,
          saldo: pemasukan - prev.pengeluaran,
          keterangan: `Pemasukan · ${key.slice(2)}`,
        });
      } else if (row.kategori === "Pengeluaran" && normalizePengeluaranScope(row.pengeluaranScope) === "manajemen") {
        const key = `k:${(row.pos ?? "").trim() || "Pengeluaran manajemen lain"}`;
        const prev = map.get(key) ?? { pemasukan: 0, pengeluaran: 0, saldo: 0, keterangan: "" };
        const pengeluaran = prev.pengeluaran + row.nominal;
        map.set(key, { ...prev, pengeluaran, saldo: prev.pemasukan - pengeluaran, keterangan: `Pengeluaran · ${key.slice(2)}` });
      }
    }
    const rows = Array.from(map.values()).sort((a, b) => a.keterangan.localeCompare(b.keterangan, "id"));
    const totalPemasukan = rows.reduce((s, r) => s + r.pemasukan, 0);
    const totalPengeluaran = rows.reduce((s, r) => s + r.pengeluaran, 0);
    rows.push({
      pemasukan: totalPemasukan,
      pengeluaran: totalPengeluaran,
      saldo: totalPemasukan - totalPengeluaran,
      keterangan: "TOTAL P&L Manajemen",
      isTotal: true,
    });
    return rows;
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

  const draftDateRangeInvalid = useMemo(
    () => ymdRangeInvalidOrTooLong(draftFilterStartDate, draftFilterEndDate),
    [draftFilterEndDate, draftFilterStartDate]
  );

  const appliedDateRangeInvalid = useMemo(
    () => ymdRangeInvalidOrTooLong(appliedFilterStartDate, appliedFilterEndDate),
    [appliedFilterEndDate, appliedFilterStartDate]
  );

  const handleDateRangeChange = (value: string, field: "start" | "end") => {
    if (field === "start") {
      setDraftFilterStartDate(value);
      return;
    }
    setDraftFilterEndDate(value);
  };

  const handleApplyDateFilter = () => {
    if (draftDateRangeInvalid) {
      const msg = "Rentang waktu maksimal 1 tahun dan tanggal harus valid.";
      setErrorMessage(msg);
      toast(msg, "error");
      return;
    }
    setErrorMessage("");
    setFilterApplyBusy(true);
    window.setTimeout(() => {
      setAppliedFilterStartDate(draftFilterStartDate);
      setAppliedFilterEndDate(draftFilterEndDate);
      setFilterApplyBusy(false);
    }, 350);
  };

  const handleResetFullDateRange = () => {
    const dates = effectiveFinanceRows
      .map((r) => String(r.tanggal ?? "").slice(0, 10))
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .sort((a, b) => a.localeCompare(b));
    if (!dates.length) {
      const msg = "Belum ada data finance untuk reset rentang tanggal.";
      setErrorMessage(msg);
      toast(msg, "info");
      return;
    }
    setDraftFilterStartDate(dates[0]);
    setDraftFilterEndDate(dates[dates.length - 1]);
    setAppliedFilterStartDate(dates[0]);
    setAppliedFilterEndDate(dates[dates.length - 1]);
    setErrorMessage("");
    toast("Rentang tanggal direset ke seluruh periode data.", "success");
  };

  const handleOpenLaporanChoice = () => {
    if (appliedDateRangeInvalid) {
      const msg = "Rentang waktu maksimal 1 tahun dan tanggal harus valid.";
      setErrorMessage(msg);
      toast(msg, "error");
      return;
    }
    setErrorMessage("");
    setLaporanChoiceOpen(true);
  };

  const handlePickLaporanFokus = (fokus: LaporanFokusCetak) => {
    if (appliedDateRangeInvalid) {
      const msg = "Rentang waktu maksimal 1 tahun dan tanggal harus valid.";
      setErrorMessage(msg);
      toast(msg, "error");
      setLaporanChoiceOpen(false);
      return;
    }

    setOpeningReport(true);
    try {
      const generatedAt = new Date();
      const payload = buildLaporanExportPayloadV1({
        generatedAt,
        currentUserName: exportUserName.trim() || "Pengguna",
        userProfileRole: profileRole,
        localDemoMode,
        laporanFokus: fokus,
        filters: {
          startDate: appliedFilterStartDate,
          endDate: appliedFilterEndDate,
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

      const ok = openLaporanCetakTabWithPayload(payload);
      if (!ok) {
        toast("Penyimpanan penuh. Kurangi data atau kosongkan situs.", "error");
        return;
      }
      toast("Tab laporan lengkap dibuka. Gunakan Print, Unduh HTML, atau Email di sana.", "success");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Gagal menyiapkan laporan.";
      setErrorMessage(msg);
      toast(msg, "error");
    } finally {
      setOpeningReport(false);
      setLaporanChoiceOpen(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <section className={lapSectionClass}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-5">
          <div>
            <label className={lapLabelClass}>Lokasi Kos</label>
            <select
              value={selectedLokasi}
              onChange={(event) => {
                setSelectedLokasi(event.target.value);
                setSelectedUnit(UNIT_SEMUA);
              }}
              className={lapFieldClass}
            >
              {lokasiSelectOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={lapLabelClass}>Unit / Blok</label>
            <select
              value={selectedUnit}
              onChange={(event) => setSelectedUnit(event.target.value)}
              className={lapFieldClass}
            >
              <option value={UNIT_SEMUA}>{UNIT_SEMUA}</option>
              {unitOptionsForSelect.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-3 sm:col-span-2 sm:gap-4 lg:contents">
            <div className="min-w-0">
              <label className={lapLabelClass}>Mulai</label>
              <input
                type="date"
                value={draftFilterStartDate}
                onChange={(event) => handleDateRangeChange(event.target.value, "start")}
                className={lapFieldClass}
              />
            </div>

            <div className="min-w-0">
              <label className={lapLabelClass}>Sampai</label>
              <input
                type="date"
                value={draftFilterEndDate}
                onChange={(event) => handleDateRangeChange(event.target.value, "end")}
                className={lapFieldClass}
              />
            </div>
          </div>
        </div>

        <div className="mt-3.5 flex flex-col gap-2 sm:mt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
          <button
            type="button"
            onClick={handleApplyDateFilter}
            disabled={draftDateRangeInvalid || filterApplyBusy}
            className="min-h-[46px] w-full rounded-xl bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-5 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#eef3ff] shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-55 sm:min-h-0 sm:w-auto sm:rounded-full sm:py-2.5 sm:text-xs sm:tracking-[0.12em]"
          >
            {filterApplyBusy ? "Memuat…" : "Tampilkan"}
          </button>
          <button
            type="button"
            onClick={handleResetFullDateRange}
            className="min-h-[46px] w-full rounded-xl border border-[#b8c4ff] bg-white px-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-[#4a54a8] transition active:bg-[#eef1ff] sm:min-h-0 sm:w-auto sm:rounded-full sm:py-2 sm:text-xs sm:tracking-[0.12em] dark:border-[#5560a8] dark:bg-[#232c58] dark:text-[#d8e0ff] dark:hover:bg-[#2c3770] dark:active:bg-[#323d70]"
          >
            Reset ke seluruh tanggal
          </button>
        </div>

        {errorMessage ? (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] leading-relaxed text-red-700 sm:px-3.5 sm:text-sm">
            {errorMessage}
          </p>
        ) : null}
      </section>

      <div className="relative flex flex-col gap-4 md:gap-5">
        {filterApplyBusy ? (
          <div
            className="pointer-events-none absolute inset-0 z-[6] flex flex-col items-center justify-center gap-3 rounded-xl bg-[#f7f8ff]/70 backdrop-blur-[2px] dark:bg-[#121327]/65"
            role="status"
            aria-busy="true"
            aria-label="Menampilkan data sesuai rentang tanggal"
          >
            <div className="h-11 w-11 animate-spin rounded-full border-[3px] border-[#4d6dff]/35 border-t-[#6d32ff]" />
            <p className="text-[13px] font-semibold text-[#3f4f9d] dark:text-[#dbe3ff]">Memuat grafik dan tabel…</p>
          </div>
        ) : null}
        <div
          className={
            filterApplyBusy ? "pointer-events-none min-h-[12rem] opacity-55 transition-opacity" : "transition-opacity"
          }
        >
        {!localDemoMode && cloudDataLoadError ? (
          <p
            role="alert"
            className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13px] leading-relaxed text-amber-950 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100"
          >
            Beberapa data cloud gagal dimuat (grafik bisa kosong).{" "}
            <span className="font-medium">{cloudDataLoadError}</span>
            {" · "}
            Pakai tombol HARD REFRESH di header.
          </p>
        ) : null}
        <p className="rounded-xl border border-[#d6ddff] bg-[#f7f8ff] px-3.5 py-2.5 text-[13px] leading-relaxed text-[#4f61aa] sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm dark:border-[#424a80] dark:bg-[#1b1f3d] dark:text-[#dbe3ff]">
          Setelah mengubah <span className="font-semibold">Mulai</span> / <span className="font-semibold">Sampai</span>, ketuk{" "}
          <span className="font-semibold">Tampilkan</span> untuk memuat ulang grafik dan tabel. Grafik membedakan P&amp;L kos
          (sewa − pengeluaran kos) dan P&amp;L manajemen (margin − pengeluaran manajemen). Tab laporan lengkap membuka popup
          pilihan struktur kos vs manajemen.
        </p>

        <section className={lapSectionClass}>
          <h2 className={lapSectionTitleClass}>Tabel P&amp;L Kos</h2>
          <PlTableMobileCards rows={plKosTableRows} />
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[#d6ddff] text-sm dark:border-[#424a80]">
              <thead>
                <tr className="bg-[#eef2ff] text-left text-[#4457a6] dark:bg-[#273064] dark:text-[#dbe3ff]">
                  <th className="px-4 py-2.5 font-semibold">Pemasukan</th>
                  <th className="px-4 py-2.5 font-semibold">Pengeluaran</th>
                  <th className="px-4 py-2.5 font-semibold">Saldo</th>
                  <th className="px-4 py-2.5 font-semibold">Keterangan / Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                {plKosTableRows.map((row, idx) => (
                  <tr
                    key={`pl-kos-${idx}`}
                    className={`border-t border-[#e0e6ff] dark:border-[#39437a] ${
                      row.isTotal ? "bg-[#f4f7ff] dark:bg-[#232c58]" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-300">{formatRp(row.pemasukan)}</td>
                    <td className="px-4 py-2.5 text-rose-700 dark:text-rose-300">{formatRp(row.pengeluaran)}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#1f1b42] dark:text-[#dbe3ff]">{formatRp(row.saldo)}</td>
                    <td className={`px-4 py-2.5 text-[#4f61aa] dark:text-[#c5d1ff] ${row.isTotal ? "font-semibold" : ""}`}>
                      {row.keterangan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={lapSectionClass}>
          <h2 className={lapSectionTitleClass}>Tabel P&amp;L Manajemen</h2>
          <PlTableMobileCards rows={plManajemenTableRows} />
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-2xl border border-[#d6ddff] text-sm dark:border-[#424a80]">
              <thead>
                <tr className="bg-[#eef2ff] text-left text-[#4457a6] dark:bg-[#273064] dark:text-[#dbe3ff]">
                  <th className="px-4 py-2.5 font-semibold">Pemasukan</th>
                  <th className="px-4 py-2.5 font-semibold">Pengeluaran</th>
                  <th className="px-4 py-2.5 font-semibold">Saldo</th>
                  <th className="px-4 py-2.5 font-semibold">Keterangan / Deskripsi</th>
                </tr>
              </thead>
              <tbody>
                {plManajemenTableRows.map((row, idx) => (
                  <tr
                    key={`pl-manajemen-${idx}`}
                    className={`border-t border-[#e0e6ff] dark:border-[#39437a] ${
                      row.isTotal ? "bg-[#f4f7ff] dark:bg-[#232c58]" : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 text-emerald-700 dark:text-emerald-300">{formatRp(row.pemasukan)}</td>
                    <td className="px-4 py-2.5 text-rose-700 dark:text-rose-300">{formatRp(row.pengeluaran)}</td>
                    <td className="px-4 py-2.5 font-semibold text-[#1f1b42] dark:text-[#dbe3ff]">{formatRp(row.saldo)}</td>
                    <td className={`px-4 py-2.5 text-[#4f61aa] dark:text-[#c5d1ff] ${row.isTotal ? "font-semibold" : ""}`}>
                      {row.keterangan}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className={lapSectionClass}>
          <h2 className={`${lapSectionTitleClass} mb-4 flex flex-wrap items-center gap-2 sm:mb-5`}>
            <BarChart3 size={20} strokeWidth={1.85} className={`shrink-0 ${iconTone.info}`} />
            <span className="flex-1 min-[360px]:text-[0.9625rem]">Keuangan per bulan — P&amp;L kos &amp; manajemen</span>
          </h2>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5d6fc0]/95 md:hidden dark:text-[#8ea2ff]/90">
            Tren (garis)
          </p>
          <div className="h-[min(17.5rem,max(13.75rem,45vw))] w-full min-h-0 sm:h-[17rem] md:h-80 lg:h-[21rem]">
            {chartReady ? (
              <>
                <ResponsiveContainer>
                  <LineChart
                    data={monthlyChartData}
                    margin={{
                      top: 8,
                      right: chartCompact ? 6 : 12,
                      left: chartCompact ? 4 : 8,
                      bottom: chartCompact ? 10 : 20,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-40" />
                    <XAxis
                      dataKey="month"
                      tick={{ fontSize: chartCompact ? 9 : 11 }}
                      angle={chartCompact ? -42 : 0}
                      textAnchor={chartCompact ? "end" : "middle"}
                      height={chartCompact ? 58 : 32}
                      interval={chartCompact ? "preserveStartEnd" : 0}
                    />
                    <YAxis width={chartCompact ? 38 : 48} tick={{ fontSize: chartCompact ? 9 : 11 }} />
                    <Tooltip />
                    {!chartCompact ? <Legend wrapperStyle={{ fontSize: "12px", paddingTop: 8 }} /> : null}
                    <Line
                      type="monotone"
                      dataKey="pemasukanSewaKamar"
                      name="Pemasukan sewa (P&L kos)"
                      stroke="#15803d"
                      strokeWidth={chartCompact ? 1.75 : 2}
                      dot={{ r: chartCompact ? 2 : 3 }}
                      activeDot={{ r: chartCompact ? 4 : 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pengeluaranKos"
                      name="Pengeluaran kos"
                      stroke="#b91c1c"
                      strokeWidth={chartCompact ? 1.75 : 2}
                      dot={{ r: chartCompact ? 2 : 3 }}
                      activeDot={{ r: chartCompact ? 4 : 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="marginManajemen"
                      name="Margin (P&L manajemen)"
                      stroke="#059669"
                      strokeWidth={chartCompact ? 1.75 : 2}
                      dot={{ r: chartCompact ? 2 : 3 }}
                      activeDot={{ r: chartCompact ? 4 : 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="pengeluaranManajemen"
                      name="Pengeluaran manajemen"
                      stroke="#c2410c"
                      strokeWidth={chartCompact ? 1.75 : 2}
                      dot={{ r: chartCompact ? 2 : 3 }}
                      activeDot={{ r: chartCompact ? 4 : 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                {chartCompact ? (
                  <InlineChartLegend items={LINE_CHART_LEGEND_ITEMS.slice()} />
                ) : null}
              </>
            ) : null}
          </div>

          <div className="mt-7 border-t border-[#eaf0ff] pt-6 dark:border-[#2c335a]/90 md:mt-8 md:border-0 md:pt-0">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#5d6fc0]/95 md:hidden dark:text-[#8ea2ff]/90">
              Perbandingan (batang)
            </p>
            <div className="h-[min(16rem,max(12.75rem,40vw))] w-full min-h-0 sm:h-[16rem] md:h-80 lg:h-[21rem]">
            {chartReady ? (
              <>
                <ResponsiveContainer>
                  <BarChart
                    data={monthlyChartData}
                    margin={{
                      top: 8,
                      right: chartCompact ? 6 : 10,
                      left: chartCompact ? 4 : 8,
                      bottom: chartCompact ? 14 : 20,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" className="dark:opacity-40" />
                    <XAxis
                      dataKey="month"
                      interval={chartCompact ? "preserveStartEnd" : 0}
                      angle={chartCompact ? -36 : -20}
                      textAnchor="end"
                      height={chartCompact ? 50 : 56}
                      fontSize={chartCompact ? 9 : 11}
                      tick={{ fill: "currentColor" }}
                    />
                    <YAxis width={chartCompact ? 38 : 48} tick={{ fontSize: chartCompact ? 9 : 11 }} />
                    <Tooltip />
                    {!chartCompact ? <Legend wrapperStyle={{ fontSize: "11px" }} /> : null}
                    <Bar dataKey="pemasukanSewaKamar" name="Sewa kamar" fill="#15803d" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pengeluaranKos" name="Keluar kos" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="marginManajemen" name="Margin" fill="#34d399" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="pengeluaranManajemen" name="Keluar manajemen" fill="#ea580c" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                {chartCompact ? (
                  <InlineChartLegend items={BAR_CHART_LEGEND_ITEMS.slice()} />
                ) : null}
              </>
            ) : null}
          </div>
          </div>
        </section>

        <section className={lapSectionClass}>
          <h2 className={`${lapSectionTitleClass} flex flex-wrap items-center gap-2`}>
            <PieChartIcon size={20} strokeWidth={1.85} className={`shrink-0 ${iconTone.brand}`} />
            Status kamar
          </h2>
          <p className="-mt-1 mb-3 text-[12px] leading-snug text-[#5d6fc0]/90 md:hidden dark:text-[#96a7e8]">
            Distribusi Occupied · Available · Maintenance
          </p>
          <div className="h-[min(17.25rem,max(13.5rem,44vw))] w-full min-h-0 sm:h-[17rem] md:h-80 lg:h-[24rem]">
            {chartReady ? (
              <>
                <ResponsiveContainer>
                  <PieChart
                    margin={{
                      top: chartCompact ? 0 : 4,
                      right: chartCompact ? 0 : 4,
                      bottom: chartCompact ? 0 : 4,
                      left: chartCompact ? 0 : 4,
                    }}
                  >
                    <Pie
                      data={statusPieData}
                      dataKey="value"
                      nameKey="name"
                      outerRadius={chartCompact ? "74%" : "82%"}
                      innerRadius={chartCompact ? "32%" : "36%"}
                      paddingAngle={chartCompact ? 1.5 : 1}
                      label={
                        chartCompact
                          ? false
                          : ({ name, percent }) =>
                              `${String(name ?? "")} ${Math.round((percent ?? 0) * 100)}%`
                      }
                    >
                      {statusPieData.map((entry, index) => (
                        <Cell key={`${entry.name}-${index}`} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    {!chartCompact ? <Legend wrapperStyle={{ fontSize: "12px", paddingTop: 4 }} /> : null}
                  </PieChart>
                </ResponsiveContainer>
                {chartCompact ? (
                  <InlineChartLegend
                    items={statusPieData.map((entry, index) => ({
                      color: pieColors[index % pieColors.length],
                      label: `${entry.name}: ${entry.value} kamar`,
                    }))}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </section>
        </div>
      </div>

      <button
        type="button"
        onClick={handleOpenLaporanChoice}
        disabled={openingReport}
        className="flex min-h-[50px] w-full touch-manipulation items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-5 py-3.5 text-[13px] font-semibold tracking-[0.1em] text-[#eef3ff] shadow-sm transition hover:brightness-105 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-70 sm:inline-flex sm:min-h-0 sm:w-auto sm:rounded-full sm:px-8 sm:py-3 sm:text-sm sm:tracking-[0.14em]"
      >
        <FileText size={17} strokeWidth={1.9} className={`shrink-0 ${iconTone.info}`} aria-hidden />
        {openingReport ? "Membuka…" : "Buka laporan lengkap (tab baru)"}
      </button>

      <LaporanLengkapChoiceModal
        open={laporanChoiceOpen}
        busy={openingReport}
        onClose={() => {
          if (openingReport) return;
          setLaporanChoiceOpen(false);
        }}
        onPick={handlePickLaporanFokus}
      />
    </div>
  );
}
