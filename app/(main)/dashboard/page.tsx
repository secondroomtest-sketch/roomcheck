"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BedDouble,
  Bell,
  Building2,
  CheckCircle2,
  ClipboardList,
} from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import StatusBadge from "@/components/ui/status-badge";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, SB_KEY } from "@/lib/sandbox-storage";
import { readDemoProfileSession } from "@/lib/demo-auth";
import { buildDemoLokasiList, buildDemoUnitList, type SandboxMasterSnapshot } from "@/lib/demo-form-options";
import { supabase } from "@/libsupabaseClient";
import { calendarDaysUntilCheckout } from "@/lib/checkout-dates";
import { isExcludedFromOwnerDashboardRevenue } from "@/lib/finance-dashboard-revenue";
import { defaultPnlCalendarYm, financeRowCalendarYm } from "@/lib/finance-pnl-month";
import { syncKamarRowsWithPenghuniList } from "@/lib/kamar-penghuni-sync";
import type { PenghuniRow, SurveyCalonRow } from "@/components/penghuni-page-client";
import type { FinanceRow } from "@/components/finance-page-client";
import type { KamarRow } from "@/components/kamar-page-client";

const LOKASI_SEMUA = "Semua Lokasi";
const UNIT_SEMUA = "Semua Blok/Unit";

function canSelectAllLokasiDanBlok(role: string): boolean {
  const r = String(role ?? "")
    .trim()
    .toLowerCase();
  return r === "super_admin" || r === "supervisor" || r === "manager";
}

function lokasiFilterActive(selected: string): boolean {
  return Boolean(selected && selected !== LOKASI_SEMUA);
}

function unitFilterActive(selected: string): boolean {
  return Boolean(selected && selected !== UNIT_SEMUA);
}

function buildDemoUnitListAllLocations(
  sandboxReady: boolean,
  kamar: KamarRow[],
  penghuni: PenghuniRow[],
  surveyCalon: SurveyCalonRow[]
): string[] {
  const set = new Set<string>();
  for (const r of kamar) {
    const u = String(r.unitBlok ?? "").trim();
    if (u) set.add(u);
  }
  for (const r of penghuni) {
    const u = String(r.unitBlok ?? "").trim();
    if (u) set.add(u);
  }
  for (const r of surveyCalon) {
    const u = String(r.unitBlok ?? "").trim();
    if (u) set.add(u);
  }
  if (sandboxReady) {
    const m = readSandboxJson<SandboxMasterSnapshot | null>(SB_KEY.master, null);
    for (const b of m?.blokData ?? []) {
      const n = String(b.namaBlok ?? "").trim();
      if (n) set.add(n);
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, "id"));
}

function lokasiNamesForOwnerDemo(fullNames: string[], aksesLokasiIds: string[], sandboxReady: boolean): string[] {
  if (aksesLokasiIds.length === 0) return [];
  const m = sandboxReady ? readSandboxJson<SandboxMasterSnapshot | null>(SB_KEY.master, null) : null;
  const allowed = new Set(
    (m?.lokasiData ?? [])
      .filter((l) => aksesLokasiIds.includes(l.id))
      .map((l) => String(l.namaLokasi ?? "").trim())
      .filter(Boolean)
  );
  return fullNames.filter((n) => allowed.has(n));
}

function unitNamesForOwnerDemo(
  units: string[],
  lokasiName: string,
  aksesBlokIds: string[],
  sandboxReady: boolean
): string[] {
  if (lokasiName === LOKASI_SEMUA || aksesBlokIds.length === 0) return units;
  const m = sandboxReady ? readSandboxJson<SandboxMasterSnapshot | null>(SB_KEY.master, null) : null;
  const lok = m?.lokasiData?.find((l) => String(l.namaLokasi ?? "").trim() === lokasiName);
  if (!lok) return units;
  const allowed = new Set(
    (m?.blokData ?? [])
      .filter((b) => b.lokasiId === lok.id && aksesBlokIds.includes(b.id))
      .map((b) => String(b.namaBlok ?? "").trim())
      .filter(Boolean)
  );
  if (allowed.size === 0) return units;
  const hit = units.filter((u) => allowed.has(u));
  return hit.length ? hit : units;
}

function lokasiNamesForOwnerCloud(
  cloudLokasi: { id: string; nama: string }[],
  aksesLokasiIds: string[]
): string[] {
  if (aksesLokasiIds.length === 0) return [];
  const allowed = new Set(aksesLokasiIds);
  return cloudLokasi.filter((l) => allowed.has(l.id)).map((l) => l.nama);
}

function unitNamesForOwnerCloud(
  units: string[],
  aksesBlokIds: string[],
  cloudBlok: { id: string; lokasiId: string; nama: string }[]
): string[] {
  if (aksesBlokIds.length === 0) return units;
  const allowed = new Set(cloudBlok.filter((b) => aksesBlokIds.includes(b.id)).map((b) => b.nama));
  const hit = units.filter((u) => allowed.has(u));
  return hit.length ? hit : units;
}

function sisaHariLabel(days: number | null): string {
  if (days === null) return "—";
  if (days < 0) return `Lewat ${Math.abs(days)} h`;
  if (days === 0) return "Hari ini";
  if (days === 1) return "Besok";
  return `${days} h lagi`;
}

function sisaHariBadgeClass(days: number | null): string {
  if (days === null) return "border-[#e8dcc9] bg-[#faf6ef] text-[#6b5238] dark:border-[#4a3a28] dark:bg-[#2a2016] dark:text-[#d4bc94]";
  if (days < 0) return "border-rose-300/80 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100";
  if (days === 0) return "border-amber-400/90 bg-amber-100 text-amber-950 dark:border-amber-600 dark:bg-amber-950/50 dark:text-amber-50";
  if (days <= 2) return "border-orange-300/80 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-50";
  return "border-sky-200/90 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-50";
}

function formatBookingFeeDisplay(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "Rp 0";
  return `Rp ${Number(digits).toLocaleString("id-ID")}`;
}

function toYmFromYmd(raw: string): string {
  const v = String(raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "";
  return v.slice(0, 7);
}

function buildLokasiFilterOptions(
  localDemo: boolean,
  kamar: KamarRow[],
  penghuni: PenghuniRow[],
  surveyCalon: SurveyCalonRow[],
  sandboxReady: boolean
) {
  if (!localDemo) {
    return ["Jakarta Selatan", "Bandung", "Yogyakarta"];
  }
  const merged: { lokasiKos: string }[] = [...penghuni, ...surveyCalon];
  return buildDemoLokasiList(sandboxReady, kamar, merged);
}

const PENGHUNI_LIST_FILTER_OPTIONS = [
  { value: "semua", label: "SEMUA PENGHUNI" },
  { value: "hampir7", label: "CHECK OUT H-1 S/D H-7" },
  { value: "telatBayar", label: "DAFTAR TELAT BAYAR" },
  { value: "checkoutLewat", label: "DAFTAR PENGHUNI CHECK OUT" },
  { value: "booking", label: "DAFTAR PENGHUNI BOOKING" },
] as const;

type PenghuniListFilter = (typeof PENGHUNI_LIST_FILTER_OPTIONS)[number]["value"];

export default function DashboardPage() {
  const { localDemoMode } = useSandboxMode();
  const { toast } = useAppFeedback();
  const [sandboxRev, setSandboxRev] = useState(0);
  const [penghuniListFilter, setPenghuniListFilter] = useState<PenghuniListFilter>("semua");
  const checkoutToastLastFiredRef = useRef(0);
  const ownerPnlToastKeyRef = useRef("");
  /** After mount, baca localStorage — sebelum itu samakan dengan SSR agar tidak hydration mismatch */
  const [sandboxReady, setSandboxReady] = useState(false);

  useEffect(() => {
    setSandboxReady(true);
  }, []);

  useEffect(() => {
    const fn = () => setSandboxRev((n) => n + 1);
    if (typeof window === "undefined") return;
    window.addEventListener("secondroom-sandbox-updated", fn as EventListener);
    return () => window.removeEventListener("secondroom-sandbox-updated", fn as EventListener);
  }, []);

  const kamarRows = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as KamarRow[];
    return readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const penghuniRows = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as PenghuniRow[];
    return readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const kamarRowsSynced = useMemo(
    () => syncKamarRowsWithPenghuniList(kamarRows, penghuniRows),
    [kamarRows, penghuniRows]
  );

  const surveyCalonRows = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as SurveyCalonRow[];
    return readSandboxJson<SurveyCalonRow[]>(SB_KEY.surveyCalon, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const financeRows = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as FinanceRow[];
    return readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState("staff");
  /** Owner: agregasi pemasukan/P&amp;L mengikuti bulan kalender (bukan seluruh riwayat). */
  const [ownerPnlMonth, setOwnerPnlMonth] = useState(defaultPnlCalendarYm);
  const [aksesLokasiIds, setAksesLokasiIds] = useState<string[]>([]);
  const [aksesBlokIds, setAksesBlokIds] = useState<string[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [cloudLokasi, setCloudLokasi] = useState<{ id: string; nama: string }[]>([]);
  const [cloudBlok, setCloudBlok] = useState<{ id: string; lokasiId: string; nama: string }[]>([]);

  useEffect(() => {
    if (localDemoMode) {
      const demo = readDemoProfileSession();
      setSessionUserId(demo?.id ?? null);
      setProfileRole(demo?.role ?? "staff");
      setAksesLokasiIds(demo?.aksesLokasi ?? []);
      setAksesBlokIds(demo?.aksesBlok ?? []);
      setProfileLoaded(true);
      return;
    }
    let cancelled = false;
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        setSessionUserId(null);
        setProfileRole("staff");
        setAksesLokasiIds([]);
        setAksesBlokIds([]);
        setProfileLoaded(true);
        return;
      }
      setSessionUserId(user.id);
      const { data } = await supabase
        .from("user_profiles")
        .select("role, akses_lokasi, akses_blok")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const rec = data as Record<string, unknown> | null;
      setProfileRole(String(rec?.role ?? "staff").trim() || "staff");
      const al = rec?.akses_lokasi;
      const ab = rec?.akses_blok;
      setAksesLokasiIds(Array.isArray(al) ? al.map((x) => String(x)) : []);
      setAksesBlokIds(Array.isArray(ab) ? ab.map((x) => String(x)) : []);
      setProfileLoaded(true);
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode]);

  useEffect(() => {
    if (localDemoMode) {
      setCloudLokasi([]);
      setCloudBlok([]);
      return;
    }
    let cancelled = false;
    const loadMaster = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setCloudLokasi([]);
          setCloudBlok([]);
        }
        return;
      }
      const [lokRes, blokRes] = await Promise.all([
        supabase.from("master_lokasi").select("id, nama_lokasi").order("nama_lokasi", { ascending: true }),
        supabase.from("master_blok").select("id, lokasi_id, nama_blok").order("nama_blok", { ascending: true }),
      ]);
      if (cancelled) return;
      setCloudLokasi(
        (lokRes.data ?? [])
          .map((r) => ({
            id: String((r as Record<string, unknown>).id ?? ""),
            nama: String((r as Record<string, unknown>).nama_lokasi ?? "").trim(),
          }))
          .filter((x) => x.id && x.nama)
      );
      setCloudBlok(
        (blokRes.data ?? [])
          .map((r) => ({
            id: String((r as Record<string, unknown>).id ?? ""),
            lokasiId: String((r as Record<string, unknown>).lokasi_id ?? ""),
            nama: String((r as Record<string, unknown>).nama_blok ?? "").trim(),
          }))
          .filter((x) => x.id && x.nama && x.lokasiId)
      );
    };
    void loadMaster();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode]);

  const globalLokasiBlokScope = useMemo(() => {
    if (localDemoMode && !sessionUserId) return true;
    return canSelectAllLokasiDanBlok(profileRole);
  }, [localDemoMode, sessionUserId, profileRole]);

  const lokasiBaseList = useMemo(() => {
    if (localDemoMode) {
      return buildLokasiFilterOptions(true, kamarRows, penghuniRows, surveyCalonRows, sandboxReady);
    }
    if (cloudLokasi.length > 0) return cloudLokasi.map((l) => l.nama);
    return ["Jakarta Selatan", "Bandung", "Yogyakarta"];
  }, [localDemoMode, kamarRows, penghuniRows, surveyCalonRows, sandboxReady, cloudLokasi]);

  const lokasiOptions = useMemo(() => {
    let base = lokasiBaseList;

    if (!globalLokasiBlokScope) {
      if (localDemoMode) {
        const filtered = lokasiNamesForOwnerDemo(base, aksesLokasiIds, sandboxReady);
        if (aksesLokasiIds.length === 0) {
          base = ["(Belum diatur akses lokasi di Master)"];
        } else if (filtered.length > 0) {
          base = filtered;
        } else {
          base = ["(Tidak ada lokasi cocok master + akses)"];
        }
      } else if (cloudLokasi.length > 0) {
        const filtered = lokasiNamesForOwnerCloud(cloudLokasi, aksesLokasiIds);
        if (aksesLokasiIds.length === 0) {
          base = ["(Belum diatur akses lokasi di Master)"];
        } else if (filtered.length > 0) {
          base = filtered;
        } else {
          base = ["(Tidak ada lokasi cocok master + akses)"];
        }
      } else if (aksesLokasiIds.length === 0) {
        base = ["(Belum diatur akses lokasi di Master)"];
      }
    }

    if (globalLokasiBlokScope) {
      const rest = base.filter((x) => x !== LOKASI_SEMUA);
      return [LOKASI_SEMUA, ...rest];
    }

    return base;
  }, [lokasiBaseList, globalLokasiBlokScope, localDemoMode, sandboxReady, aksesLokasiIds, cloudLokasi]);

  const [selectedLokasi, setSelectedLokasi] = useState("");
  const [selectedUnit, setSelectedUnit] = useState(UNIT_SEMUA);

  useEffect(() => {
    if (sessionUserId && !profileLoaded) return;
    const opts = lokasiOptions;
    if (!opts.length) return;
    if (selectedLokasi === "" || !opts.includes(selectedLokasi)) {
      const next = globalLokasiBlokScope && opts.includes(LOKASI_SEMUA) ? LOKASI_SEMUA : opts[0];
      setSelectedLokasi(next);
      setSelectedUnit(UNIT_SEMUA);
    }
  }, [lokasiOptions, selectedLokasi, globalLokasiBlokScope, sessionUserId, profileLoaded]);

  const unitOptions = useMemo(() => {
    let units: string[];
    if (localDemoMode) {
      if (selectedLokasi === LOKASI_SEMUA && globalLokasiBlokScope) {
        units = buildDemoUnitListAllLocations(sandboxReady, kamarRows, penghuniRows, surveyCalonRows);
      } else {
        const merged: { lokasiKos: string; unitBlok: string }[] = [...penghuniRows, ...surveyCalonRows];
        units = buildDemoUnitList(sandboxReady, selectedLokasi, kamarRows, merged);
      }
      if (!globalLokasiBlokScope) {
        units = unitNamesForOwnerDemo(units, selectedLokasi, aksesBlokIds, sandboxReady);
      }
      return units;
    }

    const fallback = ["Blok A", "Blok B", "Blok C"];
    if (cloudBlok.length === 0) {
      units = fallback;
    } else if (selectedLokasi === LOKASI_SEMUA && globalLokasiBlokScope) {
      units = Array.from(new Set(cloudBlok.map((b) => b.nama))).sort((a, b) => a.localeCompare(b, "id"));
    } else {
      const lok = cloudLokasi.find((l) => l.nama === selectedLokasi);
      units = lok
        ? cloudBlok
            .filter((b) => b.lokasiId === lok.id)
            .map((b) => b.nama)
            .sort((a, b) => a.localeCompare(b, "id"))
        : fallback;
    }
    if (!globalLokasiBlokScope && cloudBlok.length > 0) {
      units = unitNamesForOwnerCloud(units, aksesBlokIds, cloudBlok);
    }
    return units;
  }, [
    selectedLokasi,
    localDemoMode,
    kamarRows,
    penghuniRows,
    surveyCalonRows,
    sandboxReady,
    globalLokasiBlokScope,
    aksesBlokIds,
    cloudBlok,
    cloudLokasi,
  ]);

  useEffect(() => {
    if (selectedUnit === UNIT_SEMUA) return;
    if (!unitOptions.includes(selectedUnit)) {
      setSelectedUnit(UNIT_SEMUA);
    }
  }, [selectedUnit, unitOptions]);

  const financeRowsScoped = useMemo(() => {
    let rows = financeRows;
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((f) => !f.lokasiKos || f.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter((f) => !f.unitBlok || f.unitBlok === selectedUnit);
    }
    return rows;
  }, [financeRows, selectedLokasi, selectedUnit]);

  const isOwnerRole = profileRole.trim().toLowerCase() === "owner";
  /** Untuk owner: filter bulan P&amp;L kalender; peran lain: sama dengan filter lokasi/unit saja. */
  const financeRowsForOwnerPnl = useMemo(() => {
    if (!isOwnerRole) return financeRowsScoped;
    return financeRowsScoped.filter((f) => financeRowCalendarYm(f) === ownerPnlMonth);
  }, [isOwnerRole, financeRowsScoped, ownerPnlMonth]);
  const ownerNoDataForMonth = isOwnerRole && financeRowsForOwnerPnl.length === 0;

  useEffect(() => {
    if (!localDemoMode || !isOwnerRole) return;
    const key = `${ownerPnlMonth}|${selectedLokasi}|${selectedUnit}`;
    if (ownerNoDataForMonth && ownerPnlToastKeyRef.current !== key) {
      ownerPnlToastKeyRef.current = key;
      toast(`Data tidak ditemukan untuk P&L ${ownerPnlMonth} pada filter saat ini.`, "info");
    }
    if (!ownerNoDataForMonth) {
      ownerPnlToastKeyRef.current = "";
    }
  }, [localDemoMode, isOwnerRole, ownerNoDataForMonth, ownerPnlMonth, selectedLokasi, selectedUnit, toast]);

  const penghuniForTable = useMemo(() => {
    if (!localDemoMode) return [] as PenghuniRow[];
    let rows = [...penghuniRows];
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((r) => r.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter(
        (r) =>
          r.unitBlok === selectedUnit ||
          `${r.unitBlok} · ${r.noKamar}`.includes(selectedUnit) ||
          `${r.unitBlok} · ${r.noKamar}`.trim().startsWith(selectedUnit)
      );
    }
    if (isOwnerRole) {
      rows = rows.filter((r) => {
        const ci = toYmFromYmd(r.tglCheckIn);
        const co = toYmFromYmd(r.tglCheckOut);
        return ci === ownerPnlMonth || co === ownerPnlMonth;
      });
    }
    return rows;
  }, [localDemoMode, penghuniRows, selectedLokasi, selectedUnit, isOwnerRole, ownerPnlMonth]);

  const kamarRowsFiltered = useMemo(() => {
    if (!localDemoMode) return [] as KamarRow[];
    let rows = kamarRowsSynced;
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((k) => k.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter((k) => String(k.unitBlok ?? "").trim() === selectedUnit);
    }
    if (isOwnerRole) {
      const unitKeys = new Set(
        penghuniForTable.map((p) => `${String(p.lokasiKos ?? "").trim()}|${String(p.unitBlok ?? "").trim()}`)
      );
      rows = rows.filter((k) => unitKeys.has(`${String(k.lokasiKos ?? "").trim()}|${String(k.unitBlok ?? "").trim()}`));
    }
    return rows;
  }, [localDemoMode, kamarRowsSynced, selectedLokasi, selectedUnit, isOwnerRole, penghuniForTable]);

  const surveyDashboardRows = useMemo(() => {
    if (!localDemoMode) return [] as SurveyCalonRow[];
    let rows = [...surveyCalonRows];
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((r) => r.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter((r) => r.unitBlok === selectedUnit);
    }
    if (isOwnerRole) {
      rows = rows.filter((r) => toYmFromYmd(r.rencanaCheckIn) === ownerPnlMonth);
    }
    const sortKey = (d: string) => (d && String(d).trim() ? String(d) : "9999-12-31");
    return rows.sort((a, b) => sortKey(a.rencanaCheckIn).localeCompare(sortKey(b.rencanaCheckIn)));
  }, [localDemoMode, surveyCalonRows, selectedLokasi, selectedUnit, isOwnerRole, ownerPnlMonth]);

  const displayStats = useMemo(() => {
    if (!localDemoMode) return [];
    const total = kamarRowsFiltered.length;
    const occ = kamarRowsFiltered.filter((k) => k.status === "Occupied").length;
    const av = kamarRowsFiltered.filter((k) => k.status === "Available").length;
    const maint = kamarRowsFiltered.filter((k) => k.status === "Maintenance").length;
    const pemasukanRows = financeRowsForOwnerPnl.filter((f) => f.kategori === "Pemasukan");
    const isOwnerRevenue = isOwnerRole;
    const revenueRows = isOwnerRevenue
      ? pemasukanRows.filter((f) => !isExcludedFromOwnerDashboardRevenue(f.pos))
      : pemasukanRows;
    const revenue = revenueRows.reduce((sum, f) => sum + (Number(f.nominal) || 0), 0);
    const revenueStr = revenue > 0 ? `Rp ${revenue.toLocaleString("id-ID")}` : "Rp 0";
    const surveyTotal = isOwnerRole ? surveyDashboardRows.length : surveyCalonRows.length;
    const surveyFiltered = surveyDashboardRows.length;

    return [
      {
        label: "Kamar Occupied",
        value: String(occ),
        note: total ? `${occ} dari ${total} kamar (demo)` : "Belum ada data kamar demo",
        icon: Building2,
      },
      {
        label: "Kamar Available",
        value: String(av),
        note: total ? `${av} tersedia` : "Tambah di halaman Kamar",
        icon: CheckCircle2,
      },
      {
        label: "Maintenance",
        value: String(maint),
        note: maint ? "Perlu perhatian" : "Tidak ada",
        icon: AlertTriangle,
      },
      {
        label: "Calon survey",
        value: String(surveyFiltered),
        note:
          surveyTotal === 0
            ? isOwnerRole
              ? `Tidak ada data survey untuk P&L ${ownerPnlMonth}`
              : "Tambah lewat Penghuni → Survey Baru"
            : `${surveyTotal} total · ${surveyFiltered} sesuai filter`,
        icon: ClipboardList,
      },
      {
        label: "Total Revenue (Pemasukan)",
        value: revenueStr,
        note:
          isOwnerRevenue
            ? ownerNoDataForMonth
              ? `Data P&L ${ownerPnlMonth} tidak ditemukan pada filter saat ini`
              : `${revenueRows.length} transaksi · P&L ${ownerPnlMonth} (deposit/booking tidak dijumlahkan)`
            : `${pemasukanRows.length} transaksi demo`,
        icon: BadgeDollarSign,
      },
    ];
  }, [
    localDemoMode,
    kamarRowsFiltered,
    financeRowsScoped,
    financeRowsForOwnerPnl,
    surveyCalonRows,
    surveyDashboardRows,
    profileRole,
    isOwnerRole,
    ownerNoDataForMonth,
    ownerPnlMonth,
  ]);

  const okupansiPercent = useMemo(() => {
    if (!localDemoMode || kamarRowsFiltered.length === 0) return 0;
    const occ = kamarRowsFiltered.filter((k) => k.status === "Occupied").length;
    return Math.round((occ / kamarRowsFiltered.length) * 100);
  }, [localDemoMode, kamarRowsFiltered]);

  /** Checkout hari ini + H-1 … H-7 (mengikuti filter lokasi/unit) — untuk panel & notifikasi in-app. */
  const checkoutNoticeEntries = useMemo(() => {
    if (!localDemoMode) return [];
    return penghuniForTable
      .map((r) => ({ row: r, days: calendarDaysUntilCheckout(r.tglCheckOut) }))
      .filter((x) => x.days !== null && x.days >= 0 && x.days <= 7)
      .sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
  }, [localDemoMode, penghuniForTable]);

  const checkoutNoticeCount = checkoutNoticeEntries.length;

  useEffect(() => {
    if (!localDemoMode || !sandboxReady) return;
    if (checkoutNoticeCount === 0) return;
    const now = Date.now();
    if (now - checkoutToastLastFiredRef.current < 750) return;
    checkoutToastLastFiredRef.current = now;
    toast(
      checkoutNoticeCount === 1
        ? "Ada 1 penghuni dalam jendela checkout (hari ini s/d 7 hari ke depan). Lihat panel peringatan di bawah."
        : `Ada ${checkoutNoticeCount} penghuni dalam jendela checkout (hari ini s/d 7 hari ke depan). Lihat panel peringatan di bawah.`,
      "info"
    );
  }, [localDemoMode, sandboxReady, checkoutNoticeCount, toast]);

  const displayPenghuni = useMemo(() => {
    if (!localDemoMode) return [];
    const mapped = penghuniForTable.map((r) => {
      const daysUntilCheckout = calendarDaysUntilCheckout(r.tglCheckOut);
      return {
        id: r.id,
        nama: r.namaLengkap,
        lokasi: r.lokasiKos,
        unit: `${r.unitBlok} · ${r.noKamar}`.trim(),
        status: r.status === "Stay" ? "Occupied" : "Booking",
        penghuniStatus: r.status,
        checkIn: r.tglCheckIn || "-",
        checkOut: r.tglCheckOut && r.tglCheckOut !== "-" ? r.tglCheckOut : "—",
        bookingFeeFormatted: formatBookingFeeDisplay(r.bookingFee ?? ""),
        tagihan: r.status === "Stay" ? "Lunas" : "Pending",
        daysUntilCheckout,
      };
    });

    return mapped.filter((row) => {
      const d = row.daysUntilCheckout;
      if (penghuniListFilter === "semua") return true;
      if (penghuniListFilter === "hampir7") return d !== null && d >= 1 && d <= 7;
      if (penghuniListFilter === "checkoutLewat") return d !== null && d < 0;
      if (penghuniListFilter === "telatBayar") return d !== null && d < 0;
      if (penghuniListFilter === "booking") return row.penghuniStatus === "Booking";
      return true;
    });
  }, [localDemoMode, penghuniForTable, penghuniListFilter]);

  const displayPengeluaran = useMemo(() => {
    if (!localDemoMode) return [];
    let rows = financeRows;
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((f) => !f.lokasiKos || f.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter(
        (f) =>
          !f.unitBlok ||
          f.unitBlok === selectedUnit ||
          Boolean(f.keterangan?.includes(selectedUnit))
      );
    }
    if (isOwnerRole) {
      rows = rows.filter((f) => financeRowCalendarYm(f) === ownerPnlMonth);
    }
    return rows
      .filter((f) => f.kategori === "Pengeluaran")
      .map((f) => ({
        id: f.id,
        kategori: f.pos || f.keterangan || "Pengeluaran",
        tanggal: f.tanggal,
        nominal:
          f.nominal !== "" && !Number.isNaN(Number(f.nominal))
            ? `Rp ${Number(f.nominal).toLocaleString("id-ID")}`
            : "Rp 0",
        status: "Paid Out",
      }));
  }, [localDemoMode, financeRows, selectedLokasi, selectedUnit, isOwnerRole, ownerPnlMonth]);

  const displayPemasukan = useMemo(() => {
    if (!localDemoMode) return [];
    return financeRowsForOwnerPnl
      .filter((f) => f.kategori === "Pemasukan")
      .map((f) => ({
        id: f.id,
        sumber: f.pos || f.keterangan || "Pemasukan",
        tanggal: f.tanggal,
        nominal:
          f.nominal !== "" && !Number.isNaN(Number(f.nominal))
            ? `Rp ${Number(f.nominal).toLocaleString("id-ID")}`
            : "Rp 0",
        status: "Paid",
      }));
  }, [localDemoMode, financeRowsForOwnerPnl]);

  const totalPengeluaranNominal = useMemo(
    () => displayPengeluaran.reduce((s, r) => s + Number(String(r.nominal).replace(/[^\d]/g, "") || 0), 0),
    [displayPengeluaran]
  );
  const totalPemasukanNominal = useMemo(
    () => displayPemasukan.reduce((s, r) => s + Number(String(r.nominal).replace(/[^\d]/g, "") || 0), 0),
    [displayPemasukan]
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-[#d8defc]/70 bg-gradient-to-r from-[#f6f8ff] via-[#eef2ff] to-[#f3f1ff] p-6 shadow-[0_22px_70px_-35px_rgba(63,79,157,0.45)] dark:border-[#4f5b99] dark:from-[#1a2144] dark:via-[#1b1f3d] dark:to-[#1f2344]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[#9b7a4f] dark:text-[#d8bc94]">
              Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-[#2a2017] dark:text-[#f7e9d4]">
              Ringkasan Operasional Second Room
            </h1>
            <p className="mt-2 text-sm text-[#725a3d] dark:text-[#c0a783]">
              {localDemoMode
                ? "Angka dan tabel di bawah mengikuti data demo lokal (Penghuni, Kamar, Finance) di browser Anda."
                : "Aktifkan demo lokal di header untuk melihat ringkasan dari data yang Anda isi, atau hubungkan ke Supabase untuk data cloud."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full border border-[#c5a67b]/60 bg-[#f4e6d0] px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-[#725531] dark:border-[#5d4832] dark:bg-[#35281a] dark:text-[#e5c8a2]">
              Role: {profileRole || "—"}
            </span>
            <select
              value={selectedLokasi}
              onChange={(event) => {
                setSelectedLokasi(event.target.value);
                setSelectedUnit(UNIT_SEMUA);
              }}
              className="rounded-full border border-[#d5bea0] bg-white px-4 py-2 text-sm text-[#5f472d] outline-none ring-[#b89468] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4f3d2b] dark:bg-[#2f2419] dark:text-[#dec49f]"
            >
              {lokasiOptions.map((lokasi) => (
                <option key={lokasi} value={lokasi}>
                  {lokasi}
                </option>
              ))}
            </select>
            <select
              value={selectedUnit}
              onChange={(event) => setSelectedUnit(event.target.value)}
              className="rounded-full border border-[#d5bea0] bg-white px-4 py-2 text-sm text-[#5f472d] outline-none ring-[#b89468] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4f3d2b] dark:bg-[#2f2419] dark:text-[#dec49f]"
            >
              <option value={UNIT_SEMUA}>{UNIT_SEMUA}</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            {isOwnerRole ? (
              <label className="flex flex-col gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8c6d47] dark:text-[#c9a77e]">
                P&amp;L bulan (owner)
                <input
                  type="month"
                  value={ownerPnlMonth}
                  onChange={(e) => setOwnerPnlMonth(e.target.value || defaultPnlCalendarYm())}
                  className="rounded-full border border-[#b89468] bg-white px-3 py-2 text-sm font-medium normal-case tracking-normal text-[#4a3824] outline-none ring-[#b89468] focus:ring-2 dark:border-[#6b5238] dark:bg-[#2f2419] dark:text-[#dec49f]"
                />
              </label>
            ) : null}
          </div>
        </div>
        {isOwnerRole && ownerNoDataForMonth ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            Data tidak ditemukan untuk P&amp;L bulan {ownerPnlMonth} pada filter lokasi/unit saat ini.
          </p>
        ) : null}
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <div className="rounded-[1.7rem] border border-[#d6ddff] bg-[#f7f8ff] p-5 dark:border-[#4f5b99] dark:bg-[#1a2144] lg:col-span-1">
          <div className="flex items-center gap-2">
            <BedDouble size={15} className={iconTone.brand} />
            <p className="text-xs uppercase tracking-[0.2em] text-[#8c6b43] dark:text-[#d8bb92]">
              Okupansi
            </p>
          </div>
          <p className="mt-3 text-4xl font-semibold text-[#2d2217] dark:text-[#f5e8d4]">
            {localDemoMode ? `${okupansiPercent}%` : "—"}
          </p>
          <p className="mt-1 text-xs text-[#816344] dark:text-[#bfa27f]">
            {localDemoMode && kamarRows.length > 0
              ? `${kamarRowsFiltered.filter((k) => k.status === "Occupied").length} dari ${kamarRowsFiltered.length} kamar terisi (demo, sesuai filter lokasi/unit)`
              : localDemoMode
                ? "Tambah data kamar di halaman Kamar (demo)."
                : "Okupansi tersedia saat demo lokal aktif."}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-4 xl:grid-cols-4">
          {displayStats.map((item) => (
            <article key={item.label} className="rounded-[1.7rem] border border-[#d6ddff] bg-white/90 p-5 dark:border-[#4f5b99] dark:bg-[#1a2144]/95">
              <div className="flex items-center gap-2">
                <item.icon
                  size={16}
                  className={
                    item.label.includes("Available")
                      ? iconTone.success
                      : item.label.includes("Maintenance")
                        ? iconTone.danger
                        : item.label.includes("Revenue")
                          ? iconTone.info
                          : iconTone.brand
                  }
                />
                <p className="text-xs uppercase tracking-[0.2em] text-[#8d704a] dark:text-[#cbab7c]">
                  {item.label}
                </p>
              </div>
              <p className="mt-3 text-2xl font-semibold text-[#2e2318] dark:text-[#f7e9d5]">
                {item.value}
              </p>
              <p className="mt-2 text-xs text-[#7d6042] dark:text-[#b79875]">{item.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="space-y-5">
        <article className="rounded-[1.8rem] border border-[#d6ddff] bg-white/90 p-5 dark:border-[#4f5b99] dark:bg-[#1a2144]/95">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitleWithIcon
              icon={BedDouble}
              title="Data Penghuni Kos"
              className="text-[#2d2217] dark:text-[#f6e9d5]"
              iconClassName={iconTone.brand}
            />
            <select
              value={penghuniListFilter}
              onChange={(event) => setPenghuniListFilter(event.target.value as PenghuniListFilter)}
              className="max-w-[min(100%,22rem)] rounded-full border border-[#dac3a5] bg-[#fdf9f2] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#6e5336] outline-none ring-[#bb986e] focus:ring-2 dark:border-[#56422e] dark:bg-[#2a2016] dark:text-[#d9bc95] sm:text-xs sm:tracking-[0.12em]"
              aria-label="Filter daftar penghuni"
            >
              {PENGHUNI_LIST_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {localDemoMode && checkoutNoticeEntries.length > 0 ? (
            <div
              className="mb-5 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/95 to-[#fffdf9] p-4 dark:border-amber-800/50 dark:from-[#2a2215] dark:to-[#20170f]/95"
              role="region"
              aria-label="Peringatan checkout mendekat"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Bell size={16} className={iconTone.warning} aria-hidden />
                <p className="text-sm font-semibold text-[#4a341c] dark:text-[#f0dcc0]">
                  Peringatan checkout (hari ini dan 1–7 hari ke depan)
                </p>
                <span className="rounded-full border border-amber-300/80 bg-amber-100/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                  {checkoutNoticeEntries.length} penghuni
                </span>
              </div>
              <p className="mb-3 text-xs text-[#6e5336] dark:text-[#bfa27f]">
                Mengikuti filter lokasi/unit di atas. Toast peringatan checkout muncul lagi setiap kali halaman dashboard dimuat ulang (refresh), jika ada penghuni dalam jendela ini.
              </p>
              <ul className="max-h-48 space-y-2 overflow-y-auto text-sm">
                {checkoutNoticeEntries.map(({ row, days }) => (
                  <li
                    key={row.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#eadcc9] bg-white/90 px-3 py-2 dark:border-[#3d2f22] dark:bg-[#2a2016]/90"
                  >
                    <span className="font-medium text-[#2d2217] dark:text-[#f6e9d5]">{row.namaLengkap}</span>
                    <span className="text-xs text-[#6e5336] dark:text-[#bfa27f]">
                      {row.lokasiKos} · {row.unitBlok} / {row.noKamar}
                    </span>
                    <span className="text-xs text-[#6e5336] dark:text-[#bfa27f]">
                      Out: {row.tglCheckOut && row.tglCheckOut !== "-" ? row.tglCheckOut : "—"}
                    </span>
                    <span
                      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${sisaHariBadgeClass(days)}`}
                    >
                      {sisaHariLabel(days)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#ecdcc6] text-xs uppercase tracking-[0.18em] text-[#8f724c] dark:border-[#3f3023] dark:text-[#cba97d]">
                  <th className="px-3 py-3">Nama</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Status Kamar</th>
                  <th className="px-3 py-3">Check In</th>
                  <th className="px-3 py-3">{penghuniListFilter === "booking" ? "Booking Fee" : "Check Out"}</th>
                  {penghuniListFilter !== "booking" ? (
                    <th className="px-3 py-3">SISA HARI</th>
                  ) : null}
                  <th className="px-3 py-3">Tagihan</th>
                </tr>
              </thead>
              <tbody>
                {displayPenghuni.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#e3e9ff] last:border-none dark:border-[#3a467f] dark:bg-transparent"
                  >
                    <td className="px-3 py-3">{row.nama}</td>
                    <td className="px-3 py-3">{row.unit}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="px-3 py-3">{row.checkIn}</td>
                    <td className="px-3 py-3">
                      {penghuniListFilter === "booking" ? row.bookingFeeFormatted : row.checkOut}
                    </td>
                    {penghuniListFilter !== "booking" ? (
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] ${sisaHariBadgeClass(row.daysUntilCheckout)}`}
                        >
                          {sisaHariLabel(row.daysUntilCheckout)}
                        </span>
                      </td>
                    ) : null}
                    <td className="px-3 py-3">{row.tagihan}</td>
                  </tr>
                ))}
                {displayPenghuni.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-[#7d6042]" colSpan={penghuniListFilter === "booking" ? 6 : 7}>
                      {localDemoMode
                        ? isOwnerRole
                          ? `Tidak ada data penghuni untuk P&L ${ownerPnlMonth} pada filter ini.`
                          : penghuniListFilter === "checkoutLewat"
                          ? "Tidak ada penghuni dengan tanggal check-out sudah lewat untuk filter ini."
                          : penghuniListFilter === "hampir7"
                            ? "Tidak ada penghuni dengan checkout dalam 1–7 hari (H-1 s/d H-7) untuk filter ini."
                            : penghuniListFilter === "telatBayar"
                              ? "Tidak ada penghuni dengan tanggal check-out yang sudah lewat untuk filter ini."
                              : penghuniListFilter === "booking"
                                ? "Tidak ada penghuni dengan status Booking untuk filter ini."
                                : "Belum ada penghuni demo atau tidak cocok filter lokasi/unit."
                        : "Aktifkan demo lokal untuk melihat data penghuni dari browser."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="rounded-full border border-[#dbc6a8] bg-[#f6ecde] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#7a5c3a] dark:border-[#4b3928] dark:bg-[#2b2016] dark:text-[#d2b58f]">
              Total: {displayPenghuni.length}
            </span>
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-violet-200/80 bg-gradient-to-br from-[#f3f1ff]/90 to-white/95 p-5 dark:border-[#4f5b99] dark:from-[#1f2344] dark:to-[#1a2144]/95">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitleWithIcon
              icon={ClipboardList}
              title="Calon survey (sinkron demo)"
              className="text-[#2d2217] dark:text-[#f6e9d5]"
              iconClassName={iconTone.warning}
            />
          </div>
          <p className="mb-3 text-xs text-[#7d6042] dark:text-[#bfa27f]">
            Data dari form Survey Baru di halaman Penghuni; urut berdasarkan rencana check-in; mengikuti filter lokasi/unit di atas.
          </p>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-amber-200/90 text-xs uppercase tracking-[0.18em] text-[#8f6a2d] dark:border-[#4a3a22] dark:text-[#dcb97a]">
                  <th className="px-3 py-3">Nama</th>
                  <th className="px-3 py-3">Unit</th>
                  <th className="px-3 py-3">Rencana check-in</th>
                  <th className="px-3 py-3">Negosiasi</th>
                  <th className="px-3 py-3">WA</th>
                </tr>
              </thead>
              <tbody>
                {surveyDashboardRows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#e3e9ff] last:border-none dark:border-[#3a467f] dark:bg-transparent"
                  >
                    <td className="px-3 py-3">{row.namaLengkap}</td>
                    <td className="px-3 py-3">{row.unitBlok}</td>
                    <td className="px-3 py-3">{row.rencanaCheckIn || "—"}</td>
                    <td className="px-3 py-3">
                      {row.negosiasiHarga ? `Rp ${row.negosiasiHarga}` : "—"}
                    </td>
                    <td className="px-3 py-3">{row.noWa || "—"}</td>
                  </tr>
                ))}
                {surveyDashboardRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-[#7d6042]" colSpan={5}>
                      {localDemoMode
                        ? isOwnerRole
                          ? `Tidak ada data survey untuk P&L ${ownerPnlMonth} pada filter ini.`
                          : "Belum ada survey demo atau tidak cocok filter lokasi/unit."
                        : "Aktifkan demo lokal untuk melihat data survey."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="rounded-full border border-amber-300/80 bg-amber-100/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {localDemoMode ? `Total: ${surveyDashboardRows.length}` : "Demo mati"}
            </span>
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-[#d6ddff] bg-white/90 p-5 dark:border-[#4f5b99] dark:bg-[#1a2144]/95">
          <SectionTitleWithIcon
            icon={AlertTriangle}
            title="Tabel Pengeluaran"
            className="mb-4 text-[#2d2217] dark:text-[#f6e9d5]"
            iconClassName={iconTone.warning}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#ecdcc6] text-xs uppercase tracking-[0.18em] text-[#8f724c] dark:border-[#3f3023] dark:text-[#cba97d]">
                  <th className="px-3 py-3">Kategori</th>
                  <th className="px-3 py-3">Tanggal</th>
                  <th className="px-3 py-3">Nominal</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayPengeluaran.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#e3e9ff] last:border-none dark:border-[#3a467f] dark:bg-transparent"
                  >
                    <td className="px-3 py-3">{row.kategori}</td>
                    <td className="px-3 py-3">{row.tanggal}</td>
                    <td className="px-3 py-3">{row.nominal}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {displayPengeluaran.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-[#7d6042]" colSpan={4}>
                      {localDemoMode
                        ? isOwnerRole
                          ? `Tidak ada data pengeluaran untuk P&L ${ownerPnlMonth} pada filter ini.`
                          : "Belum ada pengeluaran demo atau tidak cocok filter."
                        : "Aktifkan demo lokal untuk melihat finance demo."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-100">
              Total pengeluaran: Rp {totalPengeluaranNominal.toLocaleString("id-ID")}
            </span>
          </div>
        </article>

        <article className="rounded-[1.8rem] border border-[#d6ddff] bg-white/90 p-5 dark:border-[#4f5b99] dark:bg-[#1a2144]/95">
          <SectionTitleWithIcon
            icon={BadgeDollarSign}
            title="Tabel Pemasukan"
            className="mb-4 text-[#2d2217] dark:text-[#f6e9d5]"
            iconClassName={iconTone.success}
          />
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#ecdcc6] text-xs uppercase tracking-[0.18em] text-[#8f724c] dark:border-[#3f3023] dark:text-[#cba97d]">
                  <th className="px-3 py-3">Sumber</th>
                  <th className="px-3 py-3">Tanggal</th>
                  <th className="px-3 py-3">Nominal</th>
                  <th className="px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayPemasukan.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-[#e3e9ff] last:border-none dark:border-[#3a467f] dark:bg-transparent"
                  >
                    <td className="px-3 py-3">{row.sumber}</td>
                    <td className="px-3 py-3">{row.tanggal}</td>
                    <td className="px-3 py-3">{row.nominal}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {displayPemasukan.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-[#7d6042]" colSpan={4}>
                      {localDemoMode
                        ? isOwnerRole
                          ? `Tidak ada data pemasukan untuk P&L ${ownerPnlMonth} pada filter ini.`
                          : "Belum ada pemasukan demo atau tidak cocok filter."
                        : "Aktifkan demo lokal untuk melihat finance demo."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100">
              Total pemasukan: Rp {totalPemasukanNominal.toLocaleString("id-ID")}
            </span>
          </div>
        </article>
      </section>
    </div>
  );
}
