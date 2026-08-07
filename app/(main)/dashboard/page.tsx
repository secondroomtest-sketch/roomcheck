"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BadgeDollarSign,
  BedDouble,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  LayoutGrid,
  PieChart,
  Receipt,
  TrendingUp,
  Users,
  Wrench,
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
import { normalizeUserProfileRole } from "@/lib/user-profile-role";
import { useSupabaseSessionHydrated } from "@/components/supabase-session-ready";
import { useCloudDataResyncTick } from "@/components/cloud-resync-hook";
import { getSupabaseSessionSafe, getSupabaseUserSafe } from "@/lib/supabase-auth-api";
import { calendarDaysUntilCheckout } from "@/lib/checkout-dates";
import { isExcludedFromOwnerDashboardRevenue } from "@/lib/finance-dashboard-revenue";
import { pelaporanBulanIsoFromDbRecord } from "@/lib/finance-pelaporan-bulan-from-db";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";
import {
  computeLaporanFinanceBreakdown,
  financeUiRowsToReportRows,
  isManajemenPlFinanceUiRow,
} from "@/lib/laporan-finance-breakdown";
import {
  defaultPnlCalendarYm,
  financeRowCalendarYm,
  resolveDefaultOwnerPnlMonth,
} from "@/lib/finance-pnl-month";
import { syncKamarRowsWithPenghuniList } from "@/lib/kamar-penghuni-sync";
import { computeKamarOccupancyStats } from "@/lib/occupancy-for-month";
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

/** Geser string YYYY-MM sejumlah bulan (untuk tombol cepat Owner). */
function addCalendarMonthsYm(ym: string, deltaMonths: number): string {
  const parts = String(ym ?? "").trim().split("-");
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) {
    return defaultPnlCalendarYm();
  }
  const d = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const PENGHUNI_LIST_FILTER_OPTIONS = [
  { value: "semua", label: "SEMUA PENGHUNI" },
  { value: "hampir7", label: "CHECK OUT H-1 S/D H-7" },
  { value: "telatBayar", label: "DAFTAR TELAT BAYAR" },
  { value: "checkoutLewat", label: "DAFTAR PENGHUNI CHECK OUT" },
  { value: "booking", label: "DAFTAR PENGHUNI BOOKING" },
] as const;

/** Tema interaktif bergilir — dashboard khusus role owner. */
const OWNER_LIST_CARD_THEMES = [
  "border-violet-200/85 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/45 shadow-[0_6px_18px_-10px_rgba(139,92,246,0.2)] hover:border-violet-300/90 hover:shadow-[0_10px_24px_-8px_rgba(139,92,246,0.26)] dark:border-violet-800/45 dark:from-violet-950/30 dark:via-[#1a2144]/98 dark:to-fuchsia-950/20",
  "border-emerald-200/85 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/40 shadow-[0_6px_18px_-10px_rgba(16,185,129,0.2)] hover:border-emerald-300/90 hover:shadow-[0_10px_24px_-8px_rgba(16,185,129,0.26)] dark:border-emerald-800/45 dark:from-emerald-950/30 dark:via-[#1a2144]/98 dark:to-teal-950/20",
  "border-sky-200/85 bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/45 shadow-[0_6px_18px_-10px_rgba(14,165,233,0.2)] hover:border-sky-300/90 hover:shadow-[0_10px_24px_-8px_rgba(14,165,233,0.26)] dark:border-sky-800/45 dark:from-sky-950/30 dark:via-[#1a2144]/98 dark:to-cyan-950/20",
  "border-amber-200/85 bg-gradient-to-br from-amber-50/95 via-white to-yellow-50/40 shadow-[0_6px_18px_-10px_rgba(245,158,11,0.2)] hover:border-amber-300/90 hover:shadow-[0_10px_24px_-8px_rgba(245,158,11,0.26)] dark:border-amber-800/45 dark:from-amber-950/28 dark:via-[#1a2144]/98 dark:to-yellow-950/18",
  "border-rose-200/85 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/50 shadow-[0_6px_18px_-10px_rgba(244,63,94,0.22)] hover:border-rose-300/90 hover:shadow-[0_10px_24px_-8px_rgba(244,63,94,0.28)] dark:border-rose-800/45 dark:from-rose-950/35 dark:via-[#1a2144]/98 dark:to-orange-950/25",
  "border-indigo-200/85 bg-gradient-to-br from-indigo-50/95 via-white to-blue-50/45 shadow-[0_6px_18px_-10px_rgba(99,102,241,0.2)] hover:border-indigo-300/90 hover:shadow-[0_10px_24px_-8px_rgba(99,102,241,0.26)] dark:border-indigo-800/45 dark:from-indigo-950/30 dark:via-[#1a2144]/98 dark:to-blue-950/22",
] as const;

const OWNER_TABLE_ROW_THEMES = [
  "bg-violet-50/70 hover:bg-violet-50 dark:bg-violet-950/20 dark:hover:bg-violet-950/35",
  "bg-emerald-50/65 hover:bg-emerald-50 dark:bg-emerald-950/18 dark:hover:bg-emerald-950/32",
  "bg-sky-50/65 hover:bg-sky-50 dark:bg-sky-950/18 dark:hover:bg-sky-950/32",
  "bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/16 dark:hover:bg-amber-950/28",
  "bg-rose-50/70 hover:bg-rose-50 dark:bg-rose-950/20 dark:hover:bg-rose-950/35",
  "bg-indigo-50/65 hover:bg-indigo-50 dark:bg-indigo-950/18 dark:hover:bg-indigo-950/32",
] as const;

const OWNER_METRIC_CARD_THEMES = [
  "border-violet-200/85 bg-gradient-to-br from-violet-50/95 via-white to-fuchsia-50/40 shadow-[0_8px_26px_-12px_rgba(139,92,246,0.28)] hover:border-violet-300 hover:shadow-[0_14px_36px_-12px_rgba(139,92,246,0.35)] dark:border-violet-800/50 dark:from-violet-950/35 dark:to-[#1a2144]/95",
  "border-emerald-200/85 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/35 shadow-[0_8px_26px_-12px_rgba(16,185,129,0.26)] hover:border-emerald-300 hover:shadow-[0_14px_36px_-12px_rgba(16,185,129,0.32)] dark:border-emerald-800/50 dark:from-emerald-950/32 dark:to-[#1a2144]/95",
  "border-sky-200/85 bg-gradient-to-br from-sky-50/95 via-white to-cyan-50/35 shadow-[0_8px_26px_-12px_rgba(14,165,233,0.26)] hover:border-sky-300 hover:shadow-[0_14px_36px_-12px_rgba(14,165,233,0.32)] dark:border-sky-800/50 dark:from-sky-950/30 dark:to-[#1a2144]/95",
  "border-amber-200/85 bg-gradient-to-br from-amber-50/95 via-white to-yellow-50/30 shadow-[0_8px_26px_-12px_rgba(245,158,11,0.24)] hover:border-amber-300 hover:shadow-[0_14px_36px_-12px_rgba(245,158,11,0.3)] dark:border-amber-800/50 dark:from-amber-950/28 dark:to-[#1a2144]/95",
  "border-rose-200/85 bg-gradient-to-br from-rose-50/95 via-white to-orange-50/35 shadow-[0_8px_26px_-12px_rgba(244,63,94,0.26)] hover:border-rose-300 hover:shadow-[0_14px_36px_-12px_rgba(244,63,94,0.32)] dark:border-rose-800/50 dark:from-rose-950/32 dark:to-[#1a2144]/95",
] as const;

const OWNER_SECTION_ARTICLE_THEMES = [
  "border-violet-200/75 bg-gradient-to-br from-violet-50/25 via-white/95 to-white/90 ring-1 ring-violet-200/50 dark:border-violet-800/45 dark:from-violet-950/20 dark:via-[#1a2144]/95 dark:to-[#1a2144]/95 dark:ring-violet-800/35",
  "border-emerald-200/75 bg-gradient-to-br from-emerald-50/25 via-white/95 to-white/90 ring-1 ring-emerald-200/50 dark:border-emerald-800/45 dark:from-emerald-950/18 dark:via-[#1a2144]/95 dark:to-[#1a2144]/95 dark:ring-emerald-800/35",
  "border-sky-200/75 bg-gradient-to-br from-sky-50/25 via-white/95 to-white/90 ring-1 ring-sky-200/50 dark:border-sky-800/45 dark:from-sky-950/18 dark:via-[#1a2144]/95 dark:to-[#1a2144]/95 dark:ring-sky-800/35",
  "border-amber-200/75 bg-gradient-to-br from-amber-50/25 via-white/95 to-white/90 ring-1 ring-amber-200/50 dark:border-amber-800/45 dark:from-amber-950/16 dark:via-[#1a2144]/95 dark:to-[#1a2144]/95 dark:ring-amber-800/35",
] as const;

const OWNER_INTERACTIVE_MOTION =
  "transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0";

function ownerListCardTheme(index: number): string {
  return OWNER_LIST_CARD_THEMES[index % OWNER_LIST_CARD_THEMES.length];
}

function ownerTableRowTheme(index: number): string {
  return OWNER_TABLE_ROW_THEMES[index % OWNER_TABLE_ROW_THEMES.length];
}

function ownerMetricCardTheme(index: number): string {
  return OWNER_METRIC_CARD_THEMES[index % OWNER_METRIC_CARD_THEMES.length];
}

function ownerSectionArticleTheme(index: number): string {
  return OWNER_SECTION_ARTICLE_THEMES[index % OWNER_SECTION_ARTICLE_THEMES.length];
}

type PenghuniListFilter = (typeof PENGHUNI_LIST_FILTER_OPTIONS)[number]["value"];

type OwnerDashboardMenuId = "ringkasan" | "penghuni" | "pl" | "finance";

const OWNER_DASHBOARD_MENU: {
  id: OwnerDashboardMenuId;
  title: string;
  description: string;
  Icon: typeof LayoutGrid;
  cardIdle: string;
  cardSelected: string;
  iconIdle: string;
  iconSelected: string;
  focusRing: string;
  descClass: string;
}[] = [
  {
    id: "ringkasan",
    title: "Ringkasan Metrik",
    description: "Okupansi, revenue, dan ringkasan status kamar.",
    Icon: LayoutGrid,
    cardIdle:
      "border-amber-200/85 bg-gradient-to-br from-[#fffbf5] via-white to-[#fff0db] shadow-[0_12px_32px_-10px_rgba(251,191,36,0.28),0_4px_16px_-6px_rgba(30,41,59,0.1),inset_0_1px_0_0_rgba(255,255,255,0.85)] dark:border-amber-900/40 dark:from-[#2a2218] dark:via-[#1a1510] dark:to-[#261c0f] dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.58),0_6px_20px_-10px_rgba(251,146,60,0.16),inset_0_1px_0_0_rgba(255,255,255,0.07)]",
    cardSelected:
      "border-amber-400/90 bg-gradient-to-br from-amber-100/95 to-[#ffe4c7] shadow-[0_20px_52px_-12px_rgba(251,191,36,0.42),0_10px_28px_-10px_rgba(30,41,59,0.15),inset_0_1px_0_0_rgba(255,255,255,0.92)] ring-2 ring-amber-400/50 dark:border-amber-600/75 dark:from-[#3f3018] dark:to-[#36260f] dark:shadow-[0_22px_56px_-12px_rgba(0,0,0,0.72),0_10px_32px_-12px_rgba(251,146,60,0.24),inset_0_1px_0_0_rgba(255,255,255,0.09)] dark:ring-amber-500/40",
    iconIdle:
      "border-amber-300/75 bg-amber-50 text-amber-900 shadow-[0_5px_14px_-6px_rgba(245,158,11,0.35),inset_0_1px_0_0_rgba(255,255,255,0.72)] dark:border-amber-700/50 dark:bg-[#3d2e18] dark:text-amber-100 dark:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
    iconSelected:
      "border-amber-500/80 bg-white text-amber-950 shadow-[0_6px_18px_-6px_rgba(245,158,11,0.45),inset_0_1px_0_0_rgba(255,255,255,0.95)] dark:border-amber-500 dark:bg-amber-950/65 dark:text-amber-50 dark:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
    focusRing: "focus-visible:ring-amber-400/70",
    descClass: "text-amber-950/75 dark:text-amber-100/75",
  },
  {
    id: "penghuni",
    title: "Daftar Penghuni",
    description: "Data penghuni, peringatan checkout, dan list survey calon penghuni.",
    Icon: Users,
    cardIdle:
      "border-violet-200/85 bg-gradient-to-br from-violet-50/95 via-white to-[#f5f0ff] shadow-[0_12px_32px_-10px_rgba(167,139,250,0.28),0_4px_16px_-6px_rgba(30,41,59,0.1),inset_0_1px_0_0_rgba(255,255,255,0.85)] dark:border-violet-800/45 dark:from-[#251a32] dark:via-[#16121e] dark:to-[#201830] dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.58),0_6px_20px_-10px_rgba(167,139,250,0.18),inset_0_1px_0_0_rgba(255,255,255,0.07)]",
    cardSelected:
      "border-violet-400/85 bg-gradient-to-br from-violet-100/95 to-[#e9ddfd] shadow-[0_20px_52px_-12px_rgba(167,139,250,0.4),0_10px_28px_-10px_rgba(30,41,59,0.15),inset_0_1px_0_0_rgba(255,255,255,0.92)] ring-2 ring-violet-400/45 dark:border-violet-500/70 dark:from-[#3d2d55] dark:to-[#322448] dark:shadow-[0_22px_56px_-12px_rgba(0,0,0,0.72),0_10px_32px_-12px_rgba(167,139,250,0.26),inset_0_1px_0_0_rgba(255,255,255,0.09)] dark:ring-violet-500/40",
    iconIdle:
      "border-violet-300/75 bg-violet-50 text-violet-900 shadow-[0_5px_14px_-6px_rgba(139,92,246,0.35),inset_0_1px_0_0_rgba(255,255,255,0.72)] dark:border-violet-700/45 dark:bg-[#3a2a4d] dark:text-violet-100 dark:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
    iconSelected:
      "border-violet-500/80 bg-white text-violet-950 shadow-[0_6px_18px_-6px_rgba(139,92,246,0.42),inset_0_1px_0_0_rgba(255,255,255,0.95)] dark:border-violet-400 dark:bg-violet-950/55 dark:text-violet-50 dark:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
    focusRing: "focus-visible:ring-violet-400/65",
    descClass: "text-violet-950/78 dark:text-violet-100/78",
  },
  {
    id: "pl",
    title: "Laporan P&L Bulanan",
    description: "Ringkasan laba rugi kos sesuai bulan P&L yang dipilih.",
    Icon: PieChart,
    cardIdle:
      "border-emerald-200/85 bg-gradient-to-br from-emerald-50/95 via-white to-[#e8fcf2] shadow-[0_12px_32px_-10px_rgba(52,211,153,0.28),0_4px_16px_-6px_rgba(30,41,59,0.1),inset_0_1px_0_0_rgba(255,255,255,0.85)] dark:border-emerald-800/45 dark:from-[#13241c] dark:via-[#101814] dark:to-[#12261a] dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.58),0_6px_20px_-10px_rgba(52,211,153,0.16),inset_0_1px_0_0_rgba(255,255,255,0.07)]",
    cardSelected:
      "border-emerald-400/85 bg-gradient-to-br from-emerald-100/95 to-[#c8f7e4] shadow-[0_20px_52px_-12px_rgba(52,211,153,0.4),0_10px_28px_-10px_rgba(30,41,59,0.15),inset_0_1px_0_0_rgba(255,255,255,0.92)] ring-2 ring-emerald-400/45 dark:border-emerald-500/65 dark:from-[#1a4030] dark:to-[#153528] dark:shadow-[0_22px_56px_-12px_rgba(0,0,0,0.72),0_10px_32px_-12px_rgba(52,211,153,0.24),inset_0_1px_0_0_rgba(255,255,255,0.09)] dark:ring-emerald-500/38",
    iconIdle:
      "border-emerald-300/75 bg-emerald-50 text-emerald-900 shadow-[0_5px_14px_-6px_rgba(16,185,129,0.35),inset_0_1px_0_0_rgba(255,255,255,0.72)] dark:border-emerald-700/45 dark:bg-[#1a3528] dark:text-emerald-100 dark:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
    iconSelected:
      "border-emerald-500/75 bg-white text-emerald-950 shadow-[0_6px_18px_-6px_rgba(16,185,129,0.42),inset_0_1px_0_0_rgba(255,255,255,0.95)] dark:border-emerald-500 dark:bg-emerald-950/55 dark:text-emerald-50 dark:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
    focusRing: "focus-visible:ring-emerald-400/65",
    descClass: "text-emerald-950/78 dark:text-emerald-100/76",
  },
  {
    id: "finance",
    title: "Detail Finance",
    description: "Tabel pengeluaran dan pemasukan terfilter.",
    Icon: Receipt,
    cardIdle:
      "border-sky-200/85 bg-gradient-to-br from-sky-50/95 via-white to-[#e0f4ff] shadow-[0_12px_32px_-10px_rgba(56,189,248,0.28),0_4px_16px_-6px_rgba(30,41,59,0.1),inset_0_1px_0_0_rgba(255,255,255,0.85)] dark:border-sky-800/45 dark:from-[#14252e] dark:via-[#121a22] dark:to-[#152830] dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.58),0_6px_20px_-10px_rgba(56,189,248,0.18),inset_0_1px_0_0_rgba(255,255,255,0.07)]",
    cardSelected:
      "border-sky-400/85 bg-gradient-to-br from-sky-100/95 to-[#bae6fd] shadow-[0_20px_52px_-12px_rgba(56,189,248,0.4),0_10px_28px_-10px_rgba(30,41,59,0.15),inset_0_1px_0_0_rgba(255,255,255,0.92)] ring-2 ring-sky-400/45 dark:border-sky-500/65 dark:from-[#1e3f52] dark:to-[#1a3648] dark:shadow-[0_22px_56px_-12px_rgba(0,0,0,0.72),0_10px_32px_-12px_rgba(56,189,248,0.26),inset_0_1px_0_0_rgba(255,255,255,0.09)] dark:ring-sky-500/38",
    iconIdle:
      "border-sky-300/75 bg-sky-50 text-sky-950 shadow-[0_5px_14px_-6px_rgba(14,165,233,0.35),inset_0_1px_0_0_rgba(255,255,255,0.72)] dark:border-sky-700/45 dark:bg-[#1a3545] dark:text-sky-100 dark:shadow-[0_6px_16px_-6px_rgba(0,0,0,0.45),inset_0_1px_0_0_rgba(255,255,255,0.08)]",
    iconSelected:
      "border-sky-500/75 bg-white text-sky-950 shadow-[0_6px_18px_-6px_rgba(14,165,233,0.42),inset_0_1px_0_0_rgba(255,255,255,0.95)] dark:border-sky-500 dark:bg-sky-950/50 dark:text-sky-50 dark:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.5),inset_0_1px_0_0_rgba(255,255,255,0.1)]",
    focusRing: "focus-visible:ring-sky-400/65",
    descClass: "text-sky-950/80 dark:text-sky-100/78",
  },
];

export default function DashboardPage() {
  const sessionHydrated = useSupabaseSessionHydrated();
  const cloudSyncTick = useCloudDataResyncTick();
  const { localDemoMode } = useSandboxMode();
  const { toast } = useAppFeedback();
  const [sandboxRev, setSandboxRev] = useState(0);
  const [penghuniListFilter, setPenghuniListFilter] = useState<PenghuniListFilter>("semua");
  const checkoutToastLastFiredRef = useRef(0);
  const ownerPnlToastKeyRef = useRef("");
  /** After mount, baca localStorage — sebelum itu samakan dengan SSR agar tidak hydration mismatch */
  const [sandboxReady, setSandboxReady] = useState(false);
  const [cloudKamarRows, setCloudKamarRows] = useState<KamarRow[]>([]);
  const [cloudPenghuniRows, setCloudPenghuniRows] = useState<PenghuniRow[]>([]);
  const [cloudSurveyRows, setCloudSurveyRows] = useState<SurveyCalonRow[]>([]);
  const [cloudFinanceRows, setCloudFinanceRows] = useState<FinanceRow[]>([]);

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
    if (!localDemoMode) return cloudKamarRows;
    if (!sandboxReady) return [] as KamarRow[];
    return readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
  }, [localDemoMode, sandboxReady, sandboxRev, cloudKamarRows]);

  const penghuniRows = useMemo(() => {
    if (!localDemoMode) return cloudPenghuniRows;
    if (!sandboxReady) return [] as PenghuniRow[];
    return readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
  }, [localDemoMode, sandboxReady, sandboxRev, cloudPenghuniRows]);

  const kamarRowsSynced = useMemo(
    () => syncKamarRowsWithPenghuniList(kamarRows, penghuniRows),
    [kamarRows, penghuniRows]
  );

  const surveyCalonRows = useMemo(() => {
    if (!localDemoMode) return cloudSurveyRows;
    if (!sandboxReady) return [] as SurveyCalonRow[];
    return readSandboxJson<SurveyCalonRow[]>(SB_KEY.surveyCalon, []);
  }, [localDemoMode, sandboxReady, sandboxRev, cloudSurveyRows]);

  const financeRows = useMemo(() => {
    if (!localDemoMode) return cloudFinanceRows;
    if (!sandboxReady) return [] as FinanceRow[];
    return readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
  }, [localDemoMode, sandboxReady, sandboxRev, cloudFinanceRows]);

  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [profileRole, setProfileRole] = useState("staff");
  /** Owner: agregasi &amp; tabel pemasukan/pengeluaran/P&amp;L mengikuti bulan kalender. Data operasional (penghuni/kamar/survey) hanya lokasi/unit. */
  const [ownerPnlMonth, setOwnerPnlMonth] = useState(defaultPnlCalendarYm);
  const [ownerPlSectionOpen, setOwnerPlSectionOpen] = useState(true);
  /** Owner: konten blok dashboard hanya ditampilkan setelah salah satu kartu Menu dipilih. */
  const [ownerMenuPanel, setOwnerMenuPanel] = useState<OwnerDashboardMenuId | null>(null);
  const [aksesLokasiIds, setAksesLokasiIds] = useState<string[]>([]);
  const [aksesBlokIds, setAksesBlokIds] = useState<string[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [cloudLokasi, setCloudLokasi] = useState<{ id: string; nama: string }[]>([]);
  const [cloudBlok, setCloudBlok] = useState<{ id: string; lokasiId: string; nama: string }[]>([]);
  const [cloudDataError, setCloudDataError] = useState("");
  const masterRowCountsRef = useRef({ lokasi: 0, blok: 0 });
  const warnedEmptyOperationalRef = useRef(false);
  const ownerPnlMonthBootstrappedRef = useRef(false);

  useEffect(() => {
    warnedEmptyOperationalRef.current = false;
  }, [cloudSyncTick]);

  useEffect(() => {
    ownerPnlMonthBootstrappedRef.current = false;
  }, [sessionUserId, localDemoMode]);

  useEffect(() => {
    if (localDemoMode) {
      const demo = readDemoProfileSession();
      setSessionUserId(demo?.id ?? null);
      setProfileRole(normalizeUserProfileRole(demo?.role));
      setAksesLokasiIds(demo?.aksesLokasi ?? []);
      setAksesBlokIds(demo?.aksesBlok ?? []);
      if (!ownerPnlMonthBootstrappedRef.current) {
        ownerPnlMonthBootstrappedRef.current = true;
        setOwnerPnlMonth(resolveDefaultOwnerPnlMonth({ email: demo?.email }));
      }
      setProfileLoaded(true);
      return;
    }
    let cancelled = false;
    const loadProfile = async () => {
      if (!sessionHydrated) return;
      const user = await getSupabaseUserSafe();
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
      const { data: profileRows, error: profileErr } = await supabase
        .from("user_profiles")
        .select("role, akses_lokasi, akses_blok, username")
        .eq("id", user.id);
      if (cancelled) return;
      if (profileErr) {
        toast(`Gagal memuat role/akses profil (${profileErr.message}).`, "error");
        setProfileRole("staff");
        setAksesLokasiIds([]);
        setAksesBlokIds([]);
        setProfileLoaded(true);
        return;
      }
      const rec = profileRows?.[0] as Record<string, unknown> | undefined;
      if (!rec) {
        toast(
          "Akun Anda tidak punya baris di tabel user_profiles — data operasional tidak bisa tampil. Super Admin dapat membuat profil di Master atau lewat onboarding SQL.",
          "error",
        );
        setProfileRole("staff");
        setAksesLokasiIds([]);
        setAksesBlokIds([]);
        setProfileLoaded(true);
        return;
      }
      setProfileRole(normalizeUserProfileRole(rec.role));
      const al = rec.akses_lokasi;
      const ab = rec.akses_blok;
      setAksesLokasiIds(Array.isArray(al) ? al.map((x) => String(x)) : []);
      setAksesBlokIds(Array.isArray(ab) ? ab.map((x) => String(x)) : []);
      if (!ownerPnlMonthBootstrappedRef.current) {
        ownerPnlMonthBootstrappedRef.current = true;
        setOwnerPnlMonth(
          resolveDefaultOwnerPnlMonth({
            username: rec.username != null ? String(rec.username) : null,
            email: user.email,
          })
        );
      }
      setProfileLoaded(true);
    };
    void loadProfile();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);

  /** Sementara profile dimuat + session ada: perlakukan seperti scoped penuh agar tidak memakai filter staff + akses kosong (kartu kosong). Staff bisa melihat semua lokasi sangat singkat (~1 request). */
  const globalLokasiBlokScope = useMemo(() => {
    if (localDemoMode && !sessionUserId) return true;
    if (!localDemoMode && sessionUserId && !profileLoaded) return true;
    return canSelectAllLokasiDanBlok(profileRole);
  }, [localDemoMode, sessionUserId, profileRole, profileLoaded]);

  useEffect(() => {
    if (localDemoMode) {
      setCloudLokasi([]);
      setCloudBlok([]);
      return;
    }
    let cancelled = false;
    const loadMaster = async () => {
      if (!sessionHydrated) return;
      const session = await getSupabaseSessionSafe();
      if (!session?.user) {
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
      masterRowCountsRef.current = {
        lokasi: (lokRes.data ?? []).length,
        blok: (blokRes.data ?? []).length,
      };
      const masterErr = lokRes.error?.message ?? blokRes.error?.message ?? "";
      if (masterErr) {
        toast(`Master lokasi/blok gagal dimuat (${masterErr}). Periksa RLS atau login.`, "error");
      }
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
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);

  useEffect(() => {
    if (localDemoMode) {
      setCloudKamarRows([]);
      setCloudPenghuniRows([]);
      setCloudSurveyRows([]);
      setCloudFinanceRows([]);
      return;
    }
    let cancelled = false;
    const mapFinance = (row: Record<string, unknown>): FinanceRow => {
      const kat = String(row.kategori ?? "").toLowerCase() === "pengeluaran" ? "Pengeluaran" : "Pemasukan";
      return {
      id: String(row.id ?? ""),
      noNota: String(row.no_nota ?? ""),
      kategori: kat,
      pos: String(row.pos ?? ""),
      pengeluaranScope: kat === "Pengeluaran" ? normalizePengeluaranScope(row.pengeluaran_scope) : null,
      tanggal: String(row.tanggal ?? ""),
      namaPenghuni: String(row.nama_penghuni ?? ""),
      lokasiKos: String(row.lokasi_kos ?? ""),
      unitBlok: String(row.unit_blok ?? ""),
      nominal: String(row.nominal ?? ""),
      keterangan: String(row.keterangan ?? ""),
      pelaporanBulan: pelaporanBulanIsoFromDbRecord(row),
      paymentSplitGroupId: row.payment_split_group_id ? String(row.payment_split_group_id) : undefined,
      updatedAt: String(row.updated_at ?? ""),
    };
    };
    const mapKamar = (row: Record<string, unknown>): KamarRow => {
      const statusRaw = String(row.status ?? "Available");
      const status: KamarRow["status"] =
        statusRaw === "Occupied" || statusRaw === "Maintenance" ? statusRaw : "Available";
      return {
        id: String(row.id ?? ""),
        lokasiKos: String(row.lokasi_kos ?? ""),
        unitBlok: String(row.unit_blok ?? ""),
        noKamar: String(row.no_kamar ?? ""),
        status,
        keterangan: String(row.keterangan ?? ""),
        namaPenghuni: String(row.nama_penghuni ?? "-"),
        tglCheckOut: String(row.tgl_check_out ?? "-"),
      };
    };
    const mapPenghuni = (row: Record<string, unknown>): PenghuniRow => ({
      id: String(row.id ?? ""),
      namaLengkap: String(row.nama_lengkap ?? ""),
      lokasiKos: String(row.lokasi_kos ?? ""),
      unitBlok: String(row.unit_blok ?? ""),
      noKamar: String(row.no_kamar ?? ""),
      periodeSewa: String(row.periode_sewa_bulan ?? ""),
      tglCheckIn: String(row.tgl_check_in ?? ""),
      tglCheckOut: String(row.tgl_check_out ?? ""),
      hargaBulanan: String(row.harga_bulanan ?? ""),
      bookingFee: String(row.booking_fee ?? ""),
      noWa: String(row.no_wa ?? ""),
      status: (() => {
        const s = String(row.status ?? "").trim().toLowerCase();
        if (s === "stay") return "Stay" as const;
        if (s === "history") return "History" as const;
        return "Booking" as const;
      })(),
      keterangan: String(row.keterangan ?? ""),
      createdAt: row.created_at ? String(row.created_at) : null,
    });
    const mapSurvey = (row: Record<string, unknown>): SurveyCalonRow => ({
      id: String(row.id ?? ""),
      namaLengkap: String(row.nama_lengkap ?? ""),
      lokasiKos: String(row.lokasi_kos ?? ""),
      unitBlok: String(row.unit_blok ?? ""),
      periodeSewa: String(row.periode_sewa_bulan ?? "12"),
      rencanaCheckIn: String(row.tgl_check_in ?? ""),
      negosiasiHarga: String(row.harga_bulanan ?? ""),
      noWa: String(row.no_wa ?? ""),
      keterangan: String(row.keterangan ?? ""),
      createdAt: row.created_at ? String(row.created_at) : undefined,
    });
    const loadCloudRows = async () => {
      if (!sessionHydrated) return;
      const session = await getSupabaseSessionSafe();
      if (!session?.user) {
        setCloudDataError("Tidak ada sesi aktif. Silakan login ulang.");
        return;
      }
      const [kamarRes, penghuniRes, financeRes] = await Promise.all([
        supabase.from("kamar").select("*"),
        supabase.from("penghuni").select("*"),
        supabase.from("finance").select("*"),
      ]);
      if (cancelled) return;
      const errParts = [
        kamarRes.error?.message ? `kamar: ${kamarRes.error.message}` : "",
        penghuniRes.error?.message ? `penghuni: ${penghuniRes.error.message}` : "",
        financeRes.error?.message ? `finance: ${financeRes.error.message}` : "",
      ].filter(Boolean);
      if (errParts.length) {
        const msg = errParts.join(" · ");
        setCloudDataError(msg);
        toast(`Data cloud bermasalah. ${msg}. Jalankan lagi SQL strict_production_rls atau tombol HARD REFRESH.`, "error");
      } else {
        setCloudDataError("");
      }
      const nk = (kamarRes.data ?? []).length;
      const np = (penghuniRes.data ?? []).length;
      const nf = (financeRes.data ?? []).length;
      const anyOperational = nk + np + nf > 0;
      if (anyOperational) {
        warnedEmptyOperationalRef.current = false;
      } else if (!cancelled && errParts.length === 0 && session?.user) {
        const mc = masterRowCountsRef.current;
        if ((mc.lokasi > 0 || mc.blok > 0) && !warnedEmptyOperationalRef.current) {
          warnedEmptyOperationalRef.current = true;
          toast(
            "Kamar, penghuni, dan finance kosong padahal master lokasi/blok ada — biasanya RLS PostgreSQL atau array akses_lokasi/akses_blok di user_profiles. Super Admin: jalankan lagi bagian helper function di strict_production_rls.sql (has_global_operational_access), atau buka Master → Edit user → simpan lagi untuk menyegarkan akses.",
            "error",
          );
        }
      }
      const allPenghuni = (penghuniRes.data ?? []) as Array<Record<string, unknown>>;
      setCloudKamarRows((kamarRes.data ?? []).map((r) => mapKamar(r as Record<string, unknown>)));
      setCloudPenghuniRows(
        allPenghuni
          .filter((r) => String(r.status ?? "").toLowerCase() !== "survey")
          .map((r) => mapPenghuni(r))
      );
      setCloudSurveyRows(
        allPenghuni
          .filter((r) => String(r.status ?? "").toLowerCase() === "survey")
          .map((r) => mapSurvey(r))
      );
      setCloudFinanceRows((financeRes.data ?? []).map((r) => mapFinance(r as Record<string, unknown>)));
    };
    void loadCloudRows();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);

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
  const showOwnerRingkasan = !isOwnerRole || ownerMenuPanel === "ringkasan";
  const showOwnerPenghuniSection = !isOwnerRole || ownerMenuPanel === "penghuni";
  const showOwnerPlBlock = !isOwnerRole || ownerMenuPanel === "pl";
  const showOwnerFinanceDetail = !isOwnerRole || ownerMenuPanel === "finance";

  /** Untuk owner: filter bulan P&amp;L kalender; peran lain: sama dengan filter lokasi/unit saja. */
  const financeRowsForOwnerPnl = useMemo(() => {
    if (!isOwnerRole) return financeRowsScoped;
    return financeRowsScoped.filter((f) => financeRowCalendarYm(f) === ownerPnlMonth);
  }, [isOwnerRole, financeRowsScoped, ownerPnlMonth]);
  /** Owner: sembunyikan P&amp;L manajemen (pemasukan non-sewa kamar + pengeluaran scope manajemen). */
  const financeRowsForOwnerPlDisplay = useMemo(() => {
    if (!isOwnerRole) return financeRowsForOwnerPnl;
    return financeRowsForOwnerPnl.filter((f) => !isManajemenPlFinanceUiRow(f));
  }, [isOwnerRole, financeRowsForOwnerPnl]);
  const ownerNoDataForMonth = isOwnerRole && financeRowsForOwnerPlDisplay.length === 0;

  useEffect(() => {
    if (!localDemoMode || !isOwnerRole) return;
    if (ownerMenuPanel === null) return;
    const key = `${ownerPnlMonth}|${selectedLokasi}|${selectedUnit}`;
    if (ownerNoDataForMonth && ownerPnlToastKeyRef.current !== key) {
      ownerPnlToastKeyRef.current = key;
      toast(
        `Tidak ada transaksi kos untuk P&L bulan ${ownerPnlMonth} pada filter ini. Opsional: sesuaikan bulan P&L.`,
        "info",
      );
    }
    if (!ownerNoDataForMonth) {
      ownerPnlToastKeyRef.current = "";
    }
  }, [localDemoMode, isOwnerRole, ownerMenuPanel, ownerNoDataForMonth, ownerPnlMonth, selectedLokasi, selectedUnit, toast]);

  useEffect(() => {
    if (!isOwnerRole || ownerMenuPanel !== "pl") return;
    setOwnerPlSectionOpen(true);
  }, [isOwnerRole, ownerMenuPanel]);

  const scopedRoleNeedsBlokForRls = useMemo(() => {
    if (localDemoMode || !profileLoaded) return false;
    const r = profileRole.trim().toLowerCase();
    if (r !== "owner" && r !== "staff") return false;
    return !canSelectAllLokasiDanBlok(profileRole) && aksesBlokIds.length === 0;
  }, [
    localDemoMode,
    profileLoaded,
    profileRole,
    aksesBlokIds.length,
  ]);

  /** Akun lokasi/blok terbatas: fetch sukses tapi tidak ada satu pun baris (biasanya RLS atau teks lokasi≠master). */
  const scopedOperationalFetchEmptyHint = useMemo(() => {
    if (localDemoMode || !profileLoaded || !sessionUserId || cloudDataError.trim()) return false;
    if (globalLokasiBlokScope) return false;
    if (aksesLokasiIds.length === 0 || aksesBlokIds.length === 0) return false;
    const sum =
      cloudKamarRows.length +
      cloudPenghuniRows.length +
      cloudSurveyRows.length +
      cloudFinanceRows.length;
    return sum === 0;
  }, [
    localDemoMode,
    profileLoaded,
    sessionUserId,
    cloudDataError,
    globalLokasiBlokScope,
    aksesLokasiIds.length,
    aksesBlokIds.length,
    cloudKamarRows.length,
    cloudPenghuniRows.length,
    cloudSurveyRows.length,
    cloudFinanceRows.length,
  ]);

  const penghuniForTable = useMemo(() => {
    let rows = penghuniRows.filter((r) => r.status !== "History");
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
    return rows;
  }, [penghuniRows, selectedLokasi, selectedUnit]);

  const kamarRowsFiltered = useMemo(() => {
    let rows = kamarRowsSynced;
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((k) => k.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter((k) => String(k.unitBlok ?? "").trim() === selectedUnit);
    }
    return rows;
  }, [kamarRowsSynced, selectedLokasi, selectedUnit]);

  /** Inventaris kamar (tanpa sync status) — basis hitung okupansi historis Owner. */
  const kamarInventoryFiltered = useMemo(() => {
    let rows = kamarRows;
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((k) => k.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter((k) => String(k.unitBlok ?? "").trim() === selectedUnit);
    }
    return rows;
  }, [kamarRows, selectedLokasi, selectedUnit]);

  const surveyDashboardRows = useMemo(() => {
    let rows = [...surveyCalonRows];
    if (lokasiFilterActive(selectedLokasi)) {
      rows = rows.filter((r) => r.lokasiKos === selectedLokasi);
    }
    if (unitFilterActive(selectedUnit)) {
      rows = rows.filter((r) => r.unitBlok === selectedUnit);
    }
    const sortKey = (d: string) => (d && String(d).trim() ? String(d) : "9999-12-31");
    return rows.sort((a, b) => sortKey(a.rencanaCheckIn).localeCompare(sortKey(b.rencanaCheckIn)));
  }, [surveyCalonRows, selectedLokasi, selectedUnit]);

  const dashboardKamarStats = useMemo(() => {
    if (isOwnerRole) {
      return computeKamarOccupancyStats(
        kamarInventoryFiltered,
        penghuniRows.map((p) => ({
          status: p.status,
          lokasiKos: p.lokasiKos,
          unitBlok: p.unitBlok,
          noKamar: p.noKamar,
          tglCheckIn: p.tglCheckIn,
          tglCheckOut: p.tglCheckOut,
        })),
        ownerPnlMonth
      );
    }
    return computeKamarOccupancyStats(kamarRowsFiltered, [], null);
  }, [isOwnerRole, kamarInventoryFiltered, kamarRowsFiltered, penghuniRows, ownerPnlMonth]);

  const maintenanceKamarDetail = useMemo(() => {
    return kamarRowsFiltered
      .filter((k) => k.status === "Maintenance")
      .map((k) => {
        const lokasi = String(k.lokasiKos ?? "").trim();
        const unit = String(k.unitBlok ?? "").trim();
        const no = String(k.noKamar ?? "").trim();
        const label = [lokasi, unit, no ? `Kamar ${no}` : ""].filter(Boolean).join(" · ") || "—";
        const keterangan = String(k.keterangan ?? "").trim();
        return { id: k.id, label, keterangan };
      })
      .sort((a, b) => a.label.localeCompare(b.label, "id"));
  }, [kamarRowsFiltered]);

  const financeRowsForDashboardPl = isOwnerRole ? financeRowsForOwnerPlDisplay : financeRowsScoped;

  const dashboardPlBreakdown = useMemo(() => {
    return computeLaporanFinanceBreakdown(financeUiRowsToReportRows(financeRowsForDashboardPl));
  }, [financeRowsForDashboardPl]);

  const dashboardRevenue = useMemo(() => {
    const plBaseRows = isOwnerRole ? financeRowsForOwnerPlDisplay : financeRowsForOwnerPnl;
    const pemasukanRows = plBaseRows.filter((f) => f.kategori === "Pemasukan");
    const revenueRows = isOwnerRole
      ? pemasukanRows.filter((f) => !isExcludedFromOwnerDashboardRevenue(f.pos))
      : pemasukanRows;
    const revenue = revenueRows.reduce(
      (sum, f) => sum + (Number(String(f.nominal).replace(/\D/g, "")) || 0),
      0
    );
    return {
      revenue,
      count: revenueRows.length,
      display: revenue > 0 ? `Rp ${revenue.toLocaleString("id-ID")}` : "Rp 0",
      note: isOwnerRole
        ? ownerNoDataForMonth
          ? `P&L ${ownerPnlMonth} — tidak ada data pada filter ini`
          : "Gross Revenue Bulanan"
        : `${revenueRows.length} transaksi pemasukan · P&L mengikuti filter lokasi/unit`,
    };
  }, [financeRowsForOwnerPnl, financeRowsForOwnerPlDisplay, isOwnerRole, ownerNoDataForMonth, ownerPnlMonth]);

  /** Checkout hari ini + H-1 … H-7 (mengikuti filter lokasi/unit) — untuk panel & notifikasi in-app. */
  const checkoutNoticeEntries = useMemo(() => {
    return penghuniForTable
      .map((r) => ({ row: r, days: calendarDaysUntilCheckout(r.tglCheckOut) }))
      .filter((x) => x.days !== null && x.days >= 0 && x.days <= 7)
      .sort((a, b) => (a.days ?? 99) - (b.days ?? 99));
  }, [penghuniForTable]);

  const checkoutNoticeCount = checkoutNoticeEntries.length;

  useEffect(() => {
    if (localDemoMode && !sandboxReady) return;
    if (checkoutNoticeCount === 0) return;
    if (isOwnerRole && ownerMenuPanel !== "penghuni") return;
    const now = Date.now();
    if (now - checkoutToastLastFiredRef.current < 750) return;
    checkoutToastLastFiredRef.current = now;
    toast(
      checkoutNoticeCount === 1
        ? "Ada 1 penghuni dalam jendela checkout (hari ini s/d 7 hari ke depan). Lihat panel peringatan di bawah."
        : `Ada ${checkoutNoticeCount} penghuni dalam jendela checkout (hari ini s/d 7 hari ke depan). Lihat panel peringatan di bawah.`,
      "info"
    );
  }, [localDemoMode, sandboxReady, checkoutNoticeCount, toast, isOwnerRole, ownerMenuPanel]);

  const displayPenghuni = useMemo(() => {
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
  }, [penghuniForTable, penghuniListFilter]);

  const displayPengeluaran = useMemo(() => {
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
      .filter((f) => !isOwnerRole || normalizePengeluaranScope(f.pengeluaranScope) !== "manajemen")
      .map((f) => ({
        id: f.id,
        kategori: f.pos || f.keterangan || "Pengeluaran",
        lingkup: normalizePengeluaranScope(f.pengeluaranScope) === "manajemen" ? "Manajemen" : "Kos",
        tanggal: f.tanggal,
        nominal:
          f.nominal !== "" && !Number.isNaN(Number(f.nominal))
            ? `Rp ${Number(f.nominal).toLocaleString("id-ID")}`
            : "Rp 0",
        status: "Paid Out",
      }));
  }, [financeRows, selectedLokasi, selectedUnit, isOwnerRole, ownerPnlMonth]);

  const displayPemasukan = useMemo(() => {
    const base = isOwnerRole ? financeRowsForOwnerPlDisplay : financeRowsForOwnerPnl;
    return base
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
  }, [financeRowsForOwnerPnl, financeRowsForOwnerPlDisplay, isOwnerRole]);

  const totalPengeluaranNominal = useMemo(
    () => displayPengeluaran.reduce((s, r) => s + Number(String(r.nominal).replace(/[^\d]/g, "") || 0), 0),
    [displayPengeluaran]
  );
  const totalPemasukanNominal = useMemo(
    () => displayPemasukan.reduce((s, r) => s + Number(String(r.nominal).replace(/[^\d]/g, "") || 0), 0),
    [displayPemasukan]
  );

  return (
    <div className="min-w-0 max-w-[100vw] space-y-4 overflow-x-clip sm:space-y-6">
      <section className="rounded-2xl border border-[#d8defc]/70 bg-gradient-to-r from-[#f6f8ff] via-[#eef2ff] to-[#f3f1ff] p-4 shadow-[0_22px_70px_-35px_rgba(63,79,157,0.45)] dark:border-[#4f5b99] dark:from-[#1a2144] dark:via-[#1b1f3d] dark:to-[#1f2344] sm:rounded-[2rem] sm:p-6">
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5 2xl:flex-row 2xl:flex-wrap 2xl:items-start 2xl:justify-between 2xl:gap-x-8">
          <div className="min-w-0 w-full 2xl:min-w-[min(100%,22rem)] 2xl:max-w-[40rem] 2xl:flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#9b7a4f] dark:text-[#d8bc94] sm:text-xs sm:tracking-[0.3em]">
              Dashboard
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-[#2a2017] dark:text-[#f7e9d4] sm:text-2xl md:text-3xl">
              {isOwnerRole ? "INFORMASI LENGKAP KOS ANDA" : "Ringkasan Operasional Second Room"}
            </h1>
            <p className="mt-2 text-[13px] leading-relaxed text-[#725a3d] dark:text-[#c0a783] sm:text-sm">
              {isOwnerRole ? (
                <>
                  Pilih menu yang tersedia untuk mengetahui data dashboard. Seluruh data menu mengikuti Filter Bulan
                  yang ada di aplikasi.
                </>
              ) : localDemoMode ? (
                "Angka dan tabel di bawah menampilkan data operasional saat ini."
              ) : (
                "Data dashboard ditampilkan dari Supabase."
              )}
            </p>
          </div>

          <div className="flex w-full min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-x-3 sm:gap-y-3 2xl:w-auto 2xl:max-w-full 2xl:shrink-0 2xl:items-end 2xl:justify-end">
            <span className="inline-flex min-h-[2.75rem] w-fit items-center rounded-full border border-[#c5a67b]/60 bg-[#f4e6d0] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#725531] dark:border-[#5d4832] dark:bg-[#35281a] dark:text-[#e5c8a2] sm:min-h-0 sm:text-xs sm:tracking-[0.15em]">
              Role: {profileRole || "—"}
            </span>
            <select
              value={selectedLokasi}
              onChange={(event) => {
                setSelectedLokasi(event.target.value);
                setSelectedUnit(UNIT_SEMUA);
              }}
              className="touch-manipulation min-h-[2.75rem] w-full min-w-0 rounded-full border border-[#d5bea0] bg-white px-4 py-2 text-base text-[#5f472d] outline-none ring-[#b89468] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4f3d2b] dark:bg-[#2f2419] dark:text-[#dec49f] sm:flex-1 sm:basis-[11rem] sm:min-w-[11rem] sm:text-sm"
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
              className="touch-manipulation min-h-[2.75rem] w-full min-w-0 rounded-full border border-[#d5bea0] bg-white px-4 py-2 text-base text-[#5f472d] outline-none ring-[#b89468] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#4f3d2b] dark:bg-[#2f2419] dark:text-[#dec49f] sm:flex-1 sm:basis-[11rem] sm:min-w-[11rem] sm:text-sm"
            >
              <option value={UNIT_SEMUA}>{UNIT_SEMUA}</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
            {isOwnerRole ? (
              <div className="flex w-full min-w-0 flex-col gap-2 sm:flex-[1_1_16rem] sm:justify-end xl:flex-[2_1_20rem]">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8c6d47] dark:text-[#c9a77e]">
                  Bulan P&amp;L (keuangan)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className="btn-tactile btn-tactile-soft touch-manipulation inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#c4a574] bg-white text-base font-semibold text-[#5c4328] shadow-sm transition hover:bg-[#faf3e8] active:scale-95 dark:border-[#6b5238] dark:bg-[#2f2419] dark:text-[#dec49f] dark:hover:bg-[#3d2e20] sm:h-9 sm:w-9"
                    aria-label="Bulan sebelumnya"
                    onClick={() => setOwnerPnlMonth((m) => addCalendarMonthsYm(m, -1))}
                  >
                    ‹
                  </button>
                  <input
                    type="month"
                    value={ownerPnlMonth}
                    onChange={(e) => setOwnerPnlMonth(e.target.value || defaultPnlCalendarYm())}
                    className="touch-manipulation min-h-[2.75rem] min-w-0 flex-1 rounded-full border border-[#b89468] bg-white px-3 py-2 text-base font-medium text-[#4a3824] outline-none ring-[#b89468] focus:ring-2 dark:border-[#6b5238] dark:bg-[#2f2419] dark:text-[#dec49f] sm:min-w-[9.5rem] sm:flex-none sm:text-sm"
                  />
                  <button
                    type="button"
                    className="btn-tactile btn-tactile-soft touch-manipulation inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[#c4a574] bg-white text-base font-semibold text-[#5c4328] shadow-sm transition hover:bg-[#faf3e8] active:scale-95 dark:border-[#6b5238] dark:bg-[#2f2419] dark:text-[#dec49f] dark:hover:bg-[#3d2e20] sm:h-9 sm:w-9"
                    aria-label="Bulan berikutnya"
                    onClick={() => setOwnerPnlMonth((m) => addCalendarMonthsYm(m, 1))}
                  >
                    ›
                  </button>
                  <button
                    type="button"
                    onClick={() => setOwnerPnlMonth(defaultPnlCalendarYm())}
                    className="touch-manipulation min-h-[2.75rem] rounded-full border border-[#7c9fff]/80 bg-gradient-to-r from-[#e8edff] to-[#f2e8ff] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#3d4a8f] shadow-sm transition hover:brightness-105 active:scale-[0.98] dark:border-[#5c6ba3] dark:from-[#252b48] dark:to-[#2a2450] dark:text-[#c8d4ff] sm:min-h-0 sm:px-3"
                  >
                    Bulan ini
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        {scopedRoleNeedsBlokForRls ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-900 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-100">
            <span className="font-semibold">Akses blok belum dipilih untuk akun Anda.</span> Di PostgreSQL, baris penghuni
            dan kamar hanya terbaca jika <strong>minimal satu blok</strong> ada di kolom{' '}
            <code className="rounded bg-red-100/70 px-0.5 text-[0.65rem] dark:bg-red-900/50">akses_blok</code>.
            Minta Super Admin buka{' '}
            <strong className="font-semibold">Master → Management User</strong>, Edit user Anda, centang blok yang diizinkan,
            simpan lagi.
          </p>
        ) : null}
        {isOwnerRole && ownerNoDataForMonth ? (
          <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
            Tidak ada transaksi <strong className="font-semibold">kos</strong> untuk P&amp;L bulan{' '}
            <strong className="font-semibold">{ownerPnlMonth}</strong> pada filter lokasi/unit. Ubah pemilih bulan
            P&amp;L untuk melihat periode lain. Okupansi juga mengikuti bulan P&amp;L yang dipilih.
          </p>
        ) : null}
        {!localDemoMode && cloudDataError ? (
          <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-900 dark:border-red-900 dark:bg-red-950/45 dark:text-red-100">
            <span className="font-semibold">Gagal memuat beberapa data dari Supabase.</span> {cloudDataError}
            {cloudDataError.includes("stack depth") ? (
              <>
                {" "}
                — ini biasanya rekursi RLS. Super Admin jalankan sekali{' '}
                <code className="rounded bg-red-100/80 px-1 text-[0.65rem] dark:bg-red-900/50">
                  supabase/fix_rls_stack_depth_recursion.sql
                </code>{' '}
                di SQL Editor Supabase (
                <code className="text-[0.65rem]">SET row_security = off</code> pada{' '}
                <code className="text-[0.65rem]">current_user_role</code> &amp;{' '}
                <code className="text-[0.65rem]">has_scope_access</code>), refresh halaman / HARD REFRESH.
              </>
            ) : (
              <>
                {" "}
                — tekan <strong>HARD REFRESH</strong> di header atau jalankan pembaruan fungsi helper RLS dari repo (
                <code className="rounded bg-red-100/80 px-1 dark:bg-red-900/50">strict_production_rls.sql</code> atau{' '}
                <code className="rounded bg-red-100/80 px-1 dark:bg-red-900/50">fix_rls_stack_depth_recursion.sql</code>
                ).
              </>
            )}
          </p>
        ) : null}
        {!localDemoMode && scopedOperationalFetchEmptyHint && !scopedRoleNeedsBlokForRls ? (
          <div className="mt-4 space-y-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-3 text-xs leading-relaxed text-sky-950 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-100">
            <p className="font-semibold">
              Tidak ada data operasional yang dikembalikan Supabase untuk akun ini (
              <span className="tabular-nums">
                akses lokasi: {aksesLokasiIds.length}, blok: {aksesBlokIds.length}
              </span>
              ). Mengganti bulan P&amp;L tidak mempengaruhi hal ini — sumbernya di server (
              <abbr title="Row Level Security" className="no-underline">
                RLS
              </abbr>
              ), bukan filter bulan di dashboard.
            </p>
            <ol className="list-inside list-decimal space-y-1.5 pt-1 text-[11px]">
              <li>
                Super Admin: jalankan skrip{' '}
                <code className="rounded bg-sky-100/90 px-1 text-[0.65rem] dark:bg-sky-900/55">
                  supabase/fix_has_scope_access_join.sql
                </code>{' '}
                di SQL Editor Supabase (memperbaiki fungsi <code className="text-[0.65rem]">has_scope_access</code> dengan
                relasi blok→lokasi yang benar), lalu coba lagi.
              </li>
              <li>
                Pastikan isian <strong>lokasi</strong> dan <strong>blok/unit</strong> pada halaman{' '}
                <strong>Kamar</strong> dan <strong>Penghuni</strong> sama persis dengan nama di{' '}
                <strong>Master → Lokasi &amp; Blok</strong> (huruf besar/kecil diabaikan oleh kebijakan, spasi tidak).
              </li>
              <li>
                Untuk akun akses blok, baris Penghuni/Kamar tidak boleh membiarkan{' '}
                <code className="text-[0.65rem]">lokasi_kos</code> atau{' '}
                <code className="text-[0.65rem]">unit_blok</code> kosong — kosong sama sekali bisa ditolak RLS.
              </li>
              <li>
                Minta Super Admin membuka{' '}
                <strong className="font-semibold">Master → Edit user Anda → Simpan</strong> lagi setelah pengaturan blok,
                lalu Anda <strong className="font-semibold">logout / login ulang</strong>.
              </li>
            </ol>
          </div>
        ) : null}
        {isOwnerRole ? (
          <div className="mt-4 border-t border-[#c9d4ff]/40 pt-4 dark:border-[#4f5b99]/50 sm:mt-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#6d5a8a] dark:text-[#a8b0d4] sm:mb-3">
              Menu
            </p>
            <div className="grid grid-cols-1 gap-2.5 min-[440px]:grid-cols-2 xl:grid-cols-4 xl:gap-3">
              {OWNER_DASHBOARD_MENU.map(
                ({
                  id,
                  title,
                  description,
                  Icon,
                  cardIdle,
                  cardSelected,
                  iconIdle,
                  iconSelected,
                  focusRing,
                  descClass,
                }) => {
                  const selected = ownerMenuPanel === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOwnerMenuPanel((cur) => (cur === id ? null : id))}
                      className={`touch-manipulation flex min-h-[5.75rem] flex-col gap-2 rounded-[1.1rem] border p-3.5 text-left outline-none transition-[transform,box-shadow,filter] duration-300 hover:-translate-y-0.5 hover:brightness-[1.02] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f6f8ff] active:translate-y-0 active:scale-[0.99] motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-0 sm:rounded-[1.25rem] sm:p-4 sm:hover:-translate-y-1 dark:hover:brightness-110 dark:focus-visible:ring-offset-[#12152a] ${focusRing} ${
                        selected ? cardSelected : cardIdle
                      }`}
                      aria-pressed={selected}
                    >
                      <span
                        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-[box-shadow,background-color,border-color,color] duration-300 sm:h-10 sm:w-10 ${
                          selected ? iconSelected : iconIdle
                        }`}
                      >
                        <Icon size={20} strokeWidth={1.85} className="shrink-0" aria-hidden />
                      </span>
                      <span className="text-[13px] font-semibold leading-snug text-[#2a2017] dark:text-[#f4e8d6] sm:text-sm">
                        {title}
                      </span>
                      <span className={`text-[11px] leading-snug sm:leading-snug ${descClass}`}>{description}</span>
                    </button>
                  );
                }
              )}
            </div>
          </div>
        ) : null}
      </section>

      {isOwnerRole && ownerMenuPanel === null ? (
        <section
          className="rounded-xl border border-dashed border-[#c5a67b]/50 bg-[#fffdf9]/60 px-4 py-8 text-center dark:border-[#5d4832] dark:bg-[#1e1812]/40 sm:rounded-[1.5rem] sm:px-5 sm:py-10"
          aria-live="polite"
        >
          <p className="text-[13px] font-medium leading-relaxed text-[#5c4328] dark:text-[#e8d4bc] sm:text-sm">
            Pilih salah satu menu di atas untuk menampilkan data dashboard.
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#7d6042] dark:text-[#bfa27f] sm:text-xs">
            Ketuk kartu yang sama lagi untuk menutup dan kembali ke tampilan bersih.
          </p>
        </section>
      ) : null}

      {showOwnerRingkasan ? (
      <div
        id="dashboard-owner-overview"
        className={`min-w-0 scroll-mt-[4.75rem] sm:scroll-mt-24 ${isOwnerRole ? "rounded-xl border border-amber-200/50 bg-gradient-to-br from-[#fffbf5] via-transparent to-[#f3f7ff]/80 p-1 dark:border-[#4a3928]/60 dark:from-[#221a14]/40 dark:to-[#1a1f38]/60 sm:rounded-[1.85rem]" : ""}`}
      >
      <section className="grid min-w-0 grid-cols-1 gap-3 p-0.5 sm:grid-cols-2 sm:gap-4 sm:p-1 md:grid-cols-3 xl:grid-cols-5">
        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.7rem] sm:p-5 ${
            isOwnerRole
              ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(0)}`
              : "border-[#d6ddff] bg-[#f7f8ff] dark:border-[#4f5b99] dark:bg-[#1a2144]"
          }`}
        >
          <div className="flex items-center gap-2">
            <BedDouble size={16} className={iconTone.brand} />
            <p className="text-xs uppercase tracking-[0.2em] text-[#8c6b43] dark:text-[#d8bb92]">
              Okupansi
            </p>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-[#2d2217] dark:text-[#f5e8d4] sm:text-3xl">
            {dashboardKamarStats.total > 0 ? `${dashboardKamarStats.pct}%` : "0%"}
          </p>
          {isOwnerRole && dashboardKamarStats.total > 0 ? (
            <div className="mt-3 overflow-hidden rounded-full bg-[#e8dcc9] dark:bg-[#33261b]" role="progressbar" aria-valuenow={dashboardKamarStats.pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Okupansi ${dashboardKamarStats.pct}%`}>
              <div
                className="h-2.5 rounded-full bg-gradient-to-r from-[#c49a6c] via-[#6d32ff]/80 to-[#4d6dff] transition-[width] duration-500 ease-out motion-reduce:transition-none"
                style={{ width: `${Math.min(100, Math.max(0, dashboardKamarStats.pct))}%` }}
              />
            </div>
          ) : null}
          <p className="mt-2 text-xs text-[#816344] dark:text-[#bfa27f]">
            {dashboardKamarStats.total > 0
              ? `${dashboardKamarStats.terisi} dari ${dashboardKamarStats.total} kamar terisi${
                  isOwnerRole ? ` · bulan ${ownerPnlMonth}` : ""
                }`
              : "Belum ada data kamar pada filter ini."}
          </p>
        </article>

        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.7rem] sm:p-5 ${
            isOwnerRole
              ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(1)}`
              : "border-[#d6ddff] bg-white/90 dark:border-[#4f5b99] dark:bg-[#1a2144]/95"
          }`}
        >
          <div className="flex items-center gap-2">
            <BadgeDollarSign size={16} className={iconTone.info} />
            <p className="text-xs uppercase tracking-[0.2em] text-[#8d704a] dark:text-[#cbab7c]">
              {isOwnerRole ? "Revenue owner" : "Total pemasukan"}
            </p>
            {isOwnerRole ? <TrendingUp size={14} className="ml-auto shrink-0 text-emerald-600/80 dark:text-emerald-400/90" aria-hidden /> : null}
          </div>
          <p className="mt-3 text-xl font-semibold tabular-nums leading-tight tracking-tight text-[#2e2318] dark:text-[#f7e9d5] sm:text-2xl">
            {dashboardRevenue.display}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#7d6042] dark:text-[#b79875] sm:text-xs">{dashboardRevenue.note}</p>
        </article>

        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.7rem] sm:p-5 ${
            isOwnerRole
              ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(2)}`
              : "border-[#d6ddff] bg-white/90 dark:border-[#4f5b99] dark:bg-[#1a2144]/95"
          }`}
        >
          <div className="flex items-center gap-2">
            <Building2 size={16} className={iconTone.brand} />
            <p className="text-xs uppercase tracking-[0.2em] text-[#8d704a] dark:text-[#cbab7c]">
              Kamar terisi
            </p>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-[#2e2318] dark:text-[#f7e9d5] sm:text-3xl">
            {dashboardKamarStats.terisi}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#7d6042] dark:text-[#b79875] sm:text-xs">
            {isOwnerRole
              ? `Hunian aktif pada bulan ${ownerPnlMonth} · filter lokasi/unit`
              : "Status Occupied · mengikuti filter lokasi/unit"}
          </p>
        </article>

        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.7rem] sm:p-5 ${
            isOwnerRole
              ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(3)}`
              : "border-[#d6ddff] bg-white/90 dark:border-[#4f5b99] dark:bg-[#1a2144]/95"
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className={iconTone.success} />
            <p className="text-xs uppercase tracking-[0.2em] text-[#8d704a] dark:text-[#cbab7c]">
              Kamar kosong
            </p>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-[#2e2318] dark:text-[#f7e9d5] sm:text-3xl">
            {dashboardKamarStats.kosong}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-[#7d6042] dark:text-[#b79875] sm:text-xs">
            {isOwnerRole
              ? `Tidak terisi pada bulan ${ownerPnlMonth} · siap sewa`
              : "Status Available · siap sewa"}
          </p>
        </article>

        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.7rem] sm:p-5 ${
            isOwnerRole
              ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(4)}`
              : "border-[#d6ddff] bg-white/90 dark:border-[#4f5b99] dark:bg-[#1a2144]/95"
          }`}
        >
          <div className="flex items-center gap-2">
            <Wrench size={16} className={iconTone.danger} />
            <p className="text-xs uppercase tracking-[0.2em] text-[#8d704a] dark:text-[#cbab7c]">
              Maintenance
            </p>
          </div>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-[#2e2318] dark:text-[#f7e9d5] sm:text-3xl">
            {dashboardKamarStats.maintenance}
          </p>
          <div className="mt-3 border-t border-rose-200/60 pt-3 dark:border-rose-900/35">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9a4a42] dark:text-[#e8b4b4]">
              Keterangan kamar maintenance
            </p>
            {maintenanceKamarDetail.length === 0 ? (
              <p className="mt-2 text-[11px] leading-relaxed text-[#7d6042] dark:text-[#bfa27f] sm:text-xs">
                Tidak ada kamar berstatus Maintenance pada filter ini.
              </p>
            ) : (
              <ul className="mt-2 max-h-28 space-y-2 overflow-y-auto text-[11px] leading-snug sm:max-h-32 sm:text-xs">
                {maintenanceKamarDetail.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-lg border border-rose-200/55 bg-white/75 px-2.5 py-2 dark:border-rose-900/40 dark:bg-[#1a2144]/80"
                  >
                    <p className="font-semibold text-[#2d2217] dark:text-[#f6e9d5]">{item.label}</p>
                    <p className="mt-0.5 text-[#7d6042] dark:text-[#bfa27f]">
                      {item.keterangan || "— Belum ada keterangan di data kamar."}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </article>
      </section>
      </div>
      ) : null}

      {showOwnerPlBlock ? (
      <div id="dashboard-owner-finance" className="min-w-0 scroll-mt-[4.75rem] sm:scroll-mt-24">
      <section
        className={`min-w-0 rounded-xl border p-3 sm:rounded-[1.5rem] sm:p-4 ${
          isOwnerRole
            ? `${ownerSectionArticleTheme(1)} ${OWNER_INTERACTIVE_MOTION}`
            : "border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white/95 transition-shadow dark:border-emerald-900/35 dark:from-emerald-950/30 dark:to-[#1a2144]/90"
        }`}
      >
        {isOwnerRole ? (
          <button
            type="button"
            onClick={() => setOwnerPlSectionOpen((o) => !o)}
            className="touch-manipulation flex min-h-[3rem] w-full items-start justify-between gap-3 rounded-lg py-1 text-left outline-none ring-emerald-500/50 focus-visible:ring-2 sm:min-h-0 sm:rounded-xl sm:py-0"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-900 dark:text-emerald-200/90 sm:text-xs sm:tracking-[0.18em]">
                Ringkasan P&amp;L bulan {ownerPnlMonth}
              </p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#5d7349] dark:text-[#b8cfa8] sm:text-[11px] sm:leading-snug">
                Ketuk untuk membuka atau menutup detail. Ringkasan laba rugi kost mengikuti filter lokasi/unit dan bulan P&amp;L
                di atas.
              </p>
            </div>
            <ChevronDown
              size={22}
              className={`mt-0.5 shrink-0 text-emerald-800 transition-transform duration-300 dark:text-emerald-200 ${ownerPlSectionOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-900 dark:text-emerald-200/90">
              Ringkasan P&amp;L (filter lokasi/unit)
            </p>
            <p className="mt-1 text-[11px] leading-snug text-[#5d7349] dark:text-[#b8cfa8]">
              P&amp;L kos memakai pemasukan sewa kamar dikurangi pengeluaran kos; P&amp;L manajemen memakai pemasukan di
              luar sewa dikurangi pengeluaran manajemen — sama seperti halaman Laporan.
            </p>
          </>
        )}
        {(!isOwnerRole || ownerPlSectionOpen) ? (
          <div
            className={`mt-3 grid grid-cols-1 gap-2.5 sm:gap-3 ${isOwnerRole ? "sm:grid-cols-3" : "sm:grid-cols-2 lg:grid-cols-4"}`}
          >
            {/* Kiri → kanan: masuk, keluar (tengah), hasil P&amp;L */}
            <div
              className={`min-w-0 break-words rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 ${
                isOwnerRole
                  ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(0)}`
                  : "border-emerald-200/85 bg-gradient-to-br from-emerald-50/95 to-white/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] dark:border-emerald-800/45 dark:from-emerald-950/30 dark:to-[#1b2240]/95"
              }`}
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-900/90 dark:text-emerald-200/85 sm:text-[10px] sm:tracking-[0.14em]">
                {isOwnerRole ? "Pemasukan kos (sewa kamar)" : "Total pemasukan (laporan)"}
              </p>
              <p className="mt-1 text-[13px] font-semibold tabular-nums leading-tight tracking-tight text-emerald-950 dark:text-emerald-50 sm:text-sm">
                Rp{" "}
                {(isOwnerRole
                  ? dashboardPlBreakdown.pemasukanKosTotal
                  : dashboardPlBreakdown.pemasukanTotal
                ).toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-[9px] leading-snug text-emerald-900/75 dark:text-emerald-200/75 sm:text-[10px]">
                {isOwnerRole ? (
                  <>Hanya pemasukan sewa kamar (P&amp;L kos) · bulan {ownerPnlMonth}</>
                ) : (
                  <>Sewa + margin (seluruh POS pemasukan pada filter)</>
                )}
              </p>
            </div>
            <div
              className={`min-w-0 break-words rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 ${
                isOwnerRole
                  ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(1)}`
                  : "border-rose-200/85 bg-gradient-to-br from-rose-50/95 to-white/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.7)] dark:border-rose-800/50 dark:from-rose-950/35 dark:to-[#1b2240]/95"
              }`}
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-rose-800/90 dark:text-rose-200/85 sm:text-[10px] sm:tracking-[0.14em]">
                {isOwnerRole ? "Pengeluaran kos" : "Gabungan pengeluaran"}
              </p>
              <p className="mt-1 text-[13px] font-semibold tabular-nums leading-tight tracking-tight text-rose-950 dark:text-rose-50 sm:text-sm">
                Rp{" "}
                {(isOwnerRole
                  ? dashboardPlBreakdown.pengeluaranKosTotal
                  : dashboardPlBreakdown.pengeluaranTotal
                ).toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-[9px] leading-snug text-rose-800/80 dark:text-rose-200/75 sm:text-[10px]">
                {isOwnerRole ? (
                  <>Pengeluaran kos (termasuk IPL &amp; Manajemen Fee) · bulan {ownerPnlMonth}</>
                ) : (
                  <>
                    Kos Rp {dashboardPlBreakdown.pengeluaranKosTotal.toLocaleString("id-ID")} · Manaj. Rp{" "}
                    {dashboardPlBreakdown.pengeluaranManajemenTotal.toLocaleString("id-ID")}
                  </>
                )}
              </p>
            </div>
            <div
              className={`min-w-0 break-words rounded-2xl border px-3 py-2.5 sm:px-4 sm:py-3 ${
                isOwnerRole
                  ? `${OWNER_INTERACTIVE_MOTION} ${ownerMetricCardTheme(2)}`
                  : "border-violet-200/85 bg-gradient-to-br from-violet-50/95 to-white/90 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.75)] dark:border-violet-800/50 dark:from-violet-950/35 dark:to-[#1b2240]/95"
              }`}
            >
              <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-violet-900/85 dark:text-violet-200/90 sm:text-[10px] sm:tracking-[0.14em]">
                P&amp;L kos
              </p>
              <p className="mt-1 text-lg font-semibold tabular-nums leading-tight text-violet-950 dark:text-violet-50 sm:text-xl">
                Rp {dashboardPlBreakdown.plKosNominal.toLocaleString("id-ID")}
              </p>
              <p className="mt-1 text-[9px] leading-snug text-violet-900/75 dark:text-violet-200/80 sm:text-[10px]">
                Masuk kos Rp {dashboardPlBreakdown.pemasukanKosTotal.toLocaleString("id-ID")} − keluar kos Rp{" "}
                {dashboardPlBreakdown.pengeluaranKosTotal.toLocaleString("id-ID")}
              </p>
            </div>
            {!isOwnerRole ? (
              <div className="min-w-0 break-words rounded-2xl border border-teal-200/70 bg-white/90 px-3 py-2.5 dark:border-teal-900/45 dark:bg-[#1b2240]/95 sm:px-4 sm:py-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[#4d6d66] dark:text-[#9ec4bc] sm:text-[10px] sm:tracking-[0.14em]">
                  P&amp;L manajemen
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums leading-tight text-teal-900 dark:text-teal-100 sm:text-xl">
                  Rp {dashboardPlBreakdown.plManajemenNominal.toLocaleString("id-ID")}
                </p>
                <p className="mt-1 text-[9px] leading-snug text-[#4d6d66] dark:text-[#9ec4bc] sm:text-[10px]">
                  Masuk manajemen Rp {dashboardPlBreakdown.pemasukanManajemenTotal.toLocaleString("id-ID")} − keluar
                  manajemen Rp {dashboardPlBreakdown.pengeluaranManajemenTotal.toLocaleString("id-ID")}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-3 rounded-xl border border-emerald-200/60 bg-emerald-50/50 px-3 py-2 text-[11px] text-emerald-900/90 dark:border-emerald-800/50 dark:bg-emerald-950/25 dark:text-emerald-100/90">
            Ringkasan angka disembunyikan. Ketuk judul &quot;Ringkasan P&amp;L&quot; di atas untuk menampilkan kembali.
          </p>
        )}
      </section>
      </div>
      ) : null}

      {showOwnerPenghuniSection ? (
      <section
        className={`rounded-xl border p-3 sm:rounded-[1.5rem] sm:p-4 ${
          isOwnerRole
            ? `${OWNER_INTERACTIVE_MOTION} ${ownerListCardTheme(2)}`
            : "border-amber-200/80 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/25"
        }`}
      >
        <div className="flex flex-col gap-2 min-[380px]:flex-row min-[380px]:flex-wrap min-[380px]:items-center">
          <div className="flex flex-wrap items-center gap-2">
            <ClipboardList size={16} className={`shrink-0 ${iconTone.warning}`} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8f6a2d] dark:text-[#dcb97a] sm:text-xs sm:tracking-[0.18em]">
              List Survey Calon penghuni
            </p>
            <span className="rounded-full border border-amber-300/80 bg-white/90 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 sm:text-sm">
              {surveyDashboardRows.length}
            </span>
          </div>
          <span className="text-[11px] leading-snug text-[#7d6042] dark:text-[#bfa27f] min-[380px]:ml-auto sm:text-xs">
            sesuai filter · detail di tabel bawah
          </span>
        </div>
      </section>
      ) : null}

      {!isOwnerRole || showOwnerPenghuniSection || showOwnerFinanceDetail ? (
      <section className="space-y-4 sm:space-y-5 md:space-y-6">
        {showOwnerPenghuniSection ? (
        <article
          id="dashboard-owner-operational"
          className={`min-w-0 scroll-mt-[4.75rem] rounded-2xl border p-4 sm:scroll-mt-24 sm:rounded-[1.8rem] sm:p-5 ${
            isOwnerRole
              ? ownerSectionArticleTheme(0)
              : "border-[#d6ddff] bg-white/90 dark:border-[#4f5b99] dark:bg-[#1a2144]/95"
          }`}
        >
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <SectionTitleWithIcon
              icon={BedDouble}
              title="Data Penghuni Kos"
              className="text-[#2d2217] dark:text-[#f6e9d5]"
              iconClassName={iconTone.brand}
            />
            <select
              value={penghuniListFilter}
              onChange={(event) => setPenghuniListFilter(event.target.value as PenghuniListFilter)}
              className="touch-manipulation min-h-[2.75rem] w-full max-w-none rounded-full border border-[#dac3a5] bg-[#fdf9f2] px-4 py-2 text-base font-semibold uppercase tracking-[0.08em] text-[#6e5336] outline-none ring-[#bb986e] focus:ring-2 dark:border-[#56422e] dark:bg-[#2a2016] dark:text-[#d9bc95] sm:w-auto sm:max-w-[min(100%,22rem)] sm:text-xs sm:tracking-[0.12em]"
              aria-label="Filter daftar penghuni"
            >
              {PENGHUNI_LIST_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {checkoutNoticeEntries.length > 0 ? (
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
                {checkoutNoticeEntries.map(({ row, days }, index) => (
                  <li
                    key={row.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                      isOwnerRole
                        ? `${OWNER_INTERACTIVE_MOTION} ${ownerListCardTheme(index)}`
                        : "border-[#eadcc9] bg-white/90 dark:border-[#3d2f22] dark:bg-[#2a2016]/90"
                    }`}
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

          <div className="space-y-3 md:hidden">
            {displayPenghuni.map((row, index) => (
              <div
                key={row.id}
                className={`rounded-xl border p-3 ${
                  isOwnerRole
                    ? `${OWNER_INTERACTIVE_MOTION} ${ownerListCardTheme(index)}`
                    : "border-[#ecdcc6]/90 bg-gradient-to-b from-white/95 to-[#fffdf9]/90 shadow-sm dark:border-[#3f3023] dark:from-[#1a2144]/95 dark:to-[#151a36]/95"
                }`}
              >
                <div className="flex items-start justify-between gap-2 border-b border-[#ecdcc6]/60 pb-2.5 dark:border-[#3a467f]/55">
                  <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[#2d2217] dark:text-[#f6e9d5]">
                    {row.nama}
                  </p>
                  <span className="shrink-0">
                    <StatusBadge status={row.status} />
                  </span>
                </div>
                <dl className="mt-2.5 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      Unit
                    </dt>
                    <dd className="min-w-0 text-right font-medium text-[#2d2217] dark:text-[#e8dcc8]">{row.unit}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      Check in
                    </dt>
                    <dd className="tabular-nums text-[#2d2217] dark:text-[#f6e9d5]">{row.checkIn}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      {penghuniListFilter === "booking" ? "Booking fee" : "Check out"}
                    </dt>
                    <dd className="min-w-0 text-right tabular-nums text-[#2d2217] dark:text-[#f6e9d5]">
                      {penghuniListFilter === "booking" ? row.bookingFeeFormatted : row.checkOut}
                    </dd>
                  </div>
                  {penghuniListFilter !== "booking" ? (
                    <div className="flex items-center justify-between gap-3">
                      <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                        Sisa hari
                      </dt>
                      <dd className="shrink-0">
                        <span
                          className={`inline-block rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${sisaHariBadgeClass(row.daysUntilCheckout)}`}
                        >
                          {sisaHariLabel(row.daysUntilCheckout)}
                        </span>
                      </dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 pt-0.5">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      Tagihan
                    </dt>
                    <dd className="font-semibold text-[#2d2217] dark:text-[#f6e9d5]">{row.tagihan}</dd>
                  </div>
                </dl>
              </div>
            ))}
            {displayPenghuni.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[#dbc6a8]/90 bg-[#fdf9f2]/55 px-3 py-4 text-center text-xs leading-relaxed text-[#7d6042] dark:border-[#56422e] dark:bg-[#2a2016]/35 dark:text-[#bfa27f]">
                {isOwnerRole
                  ? "Belum ada penghuni atau tidak cocok filter lokasi/unit Anda (cek juga akses blok di Master)."
                  : penghuniListFilter === "checkoutLewat"
                    ? "Tidak ada penghuni dengan tanggal check-out sudah lewat untuk filter ini."
                    : penghuniListFilter === "hampir7"
                      ? "Tidak ada penghuni dengan checkout dalam 1–7 hari (H-1 s/d H-7) untuk filter ini."
                      : penghuniListFilter === "telatBayar"
                        ? "Tidak ada penghuni dengan tanggal check-out yang sudah lewat untuk filter ini."
                        : penghuniListFilter === "booking"
                          ? "Tidak ada penghuni dengan status Booking untuk filter ini."
                          : "Belum ada penghuni atau tidak cocok filter lokasi/unit."}
              </p>
            ) : null}
          </div>
          <div className="hidden md:block md:overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-[#ecdcc6] text-xs uppercase tracking-[0.18em] text-[#8f724c] dark:border-[#3f3023] dark:text-[#cba97d]">
                  <th className="whitespace-nowrap px-3 py-3">Nama</th>
                  <th className="whitespace-nowrap px-3 py-3">Unit</th>
                  <th className="whitespace-nowrap px-3 py-3">Status Kamar</th>
                  <th className="whitespace-nowrap px-3 py-3">Check In</th>
                  <th className="whitespace-nowrap px-3 py-3">
                    {penghuniListFilter === "booking" ? "Booking Fee" : "Check Out"}
                  </th>
                  {penghuniListFilter !== "booking" ? (
                    <th className="whitespace-nowrap px-3 py-3">SISA HARI</th>
                  ) : null}
                  <th className="whitespace-nowrap px-3 py-3">Tagihan</th>
                </tr>
              </thead>
              <tbody>
                {displayPenghuni.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#e3e9ff] last:border-none dark:border-[#3a467f] ${isOwnerRole ? ownerTableRowTheme(index) : "dark:bg-transparent"}`}
                  >
                    <td className="px-3 py-3">{row.nama}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.unit}</td>
                    <td className="px-3 py-3">
                      <StatusBadge status={row.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{row.checkIn}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">
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
                    <td className="whitespace-nowrap px-3 py-3">{row.tagihan}</td>
                  </tr>
                ))}
                {displayPenghuni.length === 0 ? (
                  <tr>
                    <td
                      className="px-3 py-3 text-sm leading-relaxed text-[#7d6042]"
                      colSpan={penghuniListFilter === "booking" ? 6 : 7}
                    >
                      {isOwnerRole
                        ? "Belum ada penghuni atau tidak cocok filter lokasi/unit Anda (cek juga akses blok di Master)."
                        : penghuniListFilter === "checkoutLewat"
                          ? "Tidak ada penghuni dengan tanggal check-out sudah lewat untuk filter ini."
                          : penghuniListFilter === "hampir7"
                            ? "Tidak ada penghuni dengan checkout dalam 1–7 hari (H-1 s/d H-7) untuk filter ini."
                            : penghuniListFilter === "telatBayar"
                              ? "Tidak ada penghuni dengan tanggal check-out yang sudah lewat untuk filter ini."
                              : penghuniListFilter === "booking"
                                ? "Tidak ada penghuni dengan status Booking untuk filter ini."
                                : "Belum ada penghuni atau tidak cocok filter lokasi/unit."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="rounded-full border border-[#dbc6a8] bg-[#f6ecde] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[#7a5c3a] dark:border-[#4b3928] dark:bg-[#2b2016] dark:text-[#d2b58f] sm:tracking-[0.16em]">
              Total: {displayPenghuni.length}
            </span>
          </div>
        </article>
        ) : null}

        {showOwnerPenghuniSection ? (
        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.8rem] sm:p-5 ${
            isOwnerRole
              ? ownerSectionArticleTheme(1)
              : "border-violet-200/80 bg-gradient-to-br from-[#f3f1ff]/90 to-white/95 dark:border-[#4f5b99] dark:from-[#1f2344] dark:to-[#1a2144]/95"
          }`}
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <SectionTitleWithIcon
              icon={ClipboardList}
              title="List Survey Calon penghuni"
              className="text-[#2d2217] dark:text-[#f6e9d5]"
              iconClassName={iconTone.warning}
            />
          </div>
          <p className="mb-3 text-[11px] leading-relaxed text-[#7d6042] dark:text-[#bfa27f] sm:text-xs">
            Data dari form Survey Baru di halaman Penghuni; urut berdasarkan rencana check-in; mengikuti filter lokasi/unit di atas.
          </p>
          <div className="space-y-3 md:hidden">
            {surveyDashboardRows.map((row, index) => (
              <div
                key={row.id}
                className={`rounded-xl border p-3 ${
                  isOwnerRole
                    ? `${OWNER_INTERACTIVE_MOTION} ${ownerListCardTheme(index)}`
                    : "border-amber-200/80 bg-gradient-to-b from-amber-50/90 to-white/95 shadow-sm dark:border-amber-800/35 dark:from-[#2a2215]/95 dark:to-[#1f2344]/95"
                }`}
              >
                <p className="text-sm font-semibold leading-snug text-[#2d2217] dark:text-[#f6e9d5]">{row.namaLengkap}</p>
                <dl className="mt-2.5 space-y-2 border-t border-amber-200/50 pt-2.5 text-xs dark:border-amber-800/35">
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f6a2d] dark:text-[#dcb97a]">
                      Unit
                    </dt>
                    <dd className="text-right font-medium text-[#2d2217] dark:text-[#e8dcc8]">{row.unitBlok}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f6a2d] dark:text-[#dcb97a]">
                      Rencana check-in
                    </dt>
                    <dd className="tabular-nums text-[#2d2217] dark:text-[#f6e9d5]">{row.rencanaCheckIn || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f6a2d] dark:text-[#dcb97a]">
                      Negosiasi
                    </dt>
                    <dd className="text-right font-medium tabular-nums text-[#2d2217] dark:text-[#f6e9d5]">
                      {row.negosiasiHarga ? `Rp ${row.negosiasiHarga}` : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f6a2d] dark:text-[#dcb97a]">
                      Keterangan
                    </dt>
                    <dd className="min-w-0 max-w-[65%] break-words text-right font-medium text-[#2d2217] dark:text-[#f6e9d5]">
                      {row.keterangan?.trim() || "—"}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
            {surveyDashboardRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-amber-300/80 bg-amber-50/40 px-3 py-4 text-center text-xs leading-relaxed text-[#7d6042] dark:border-amber-800/50 dark:bg-amber-950/25 dark:text-[#dcb97a]">
                {isOwnerRole
                  ? "Belum ada survey atau tidak cocok filter lokasi/unit Anda."
                  : "Belum ada survey atau tidak cocok filter lokasi/unit."}
              </p>
            ) : null}
          </div>
          <div className="hidden md:block md:overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-amber-200/90 text-xs uppercase tracking-[0.18em] text-[#8f6a2d] dark:border-[#4a3a22] dark:text-[#dcb97a]">
                  <th className="whitespace-nowrap px-3 py-3">Nama</th>
                  <th className="whitespace-nowrap px-3 py-3">Unit</th>
                  <th className="whitespace-nowrap px-3 py-3">Rencana check-in</th>
                  <th className="whitespace-nowrap px-3 py-3">Negosiasi</th>
                  <th className="whitespace-nowrap px-3 py-3">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {surveyDashboardRows.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#e3e9ff] last:border-none dark:border-[#3a467f] ${isOwnerRole ? ownerTableRowTheme(index) : "dark:bg-transparent"}`}
                  >
                    <td className="px-3 py-3">{row.namaLengkap}</td>
                    <td className="whitespace-nowrap px-3 py-3">{row.unitBlok}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{row.rencanaCheckIn || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">
                      {row.negosiasiHarga ? `Rp ${row.negosiasiHarga}` : "—"}
                    </td>
                    <td className="max-w-[16rem] break-words px-3 py-3">{row.keterangan?.trim() || "—"}</td>
                  </tr>
                ))}
                {surveyDashboardRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm text-[#7d6042]" colSpan={5}>
                      {isOwnerRole
                        ? "Belum ada survey atau tidak cocok filter lokasi/unit Anda."
                        : "Belum ada survey atau tidak cocok filter lokasi/unit."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="rounded-full border border-amber-300/80 bg-amber-100/80 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
              {`Total: ${surveyDashboardRows.length}`}
            </span>
          </div>
        </article>
        ) : null}

        {showOwnerFinanceDetail ? (
        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.8rem] sm:p-5 ${
            isOwnerRole
              ? ownerSectionArticleTheme(2)
              : "border-[#d6ddff] bg-white/90 dark:border-[#4f5b99] dark:bg-[#1a2144]/95"
          }`}
        >
          <SectionTitleWithIcon
            icon={AlertTriangle}
            title="Tabel Pengeluaran"
            className="mb-3 text-[#2d2217] dark:text-[#f6e9d5] sm:mb-4"
            iconClassName={iconTone.warning}
          />
          <div className="space-y-3 md:hidden">
            {displayPengeluaran.map((row, index) => (
              <div
                key={row.id}
                className={`rounded-xl border p-3 ${OWNER_INTERACTIVE_MOTION} ${isOwnerRole ? ownerListCardTheme(index) : "border-rose-200/75 bg-gradient-to-b from-white/95 to-rose-50/30 shadow-sm dark:border-rose-900/35 dark:from-[#1a2144]/98 dark:to-[#281820]/95"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[#2d2217] dark:text-[#f6e9d5]">
                    {row.kategori}
                  </p>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-rose-300/90 bg-white/80 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-rose-800 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-200">
                    {row.status}
                  </span>
                </div>
                <dl className="mt-2.5 space-y-2 border-t border-black/5 pt-2.5 text-xs dark:border-white/10">
                  {!isOwnerRole ? (
                    <div className="flex justify-between gap-3">
                      <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                        Lingkup P&amp;L
                      </dt>
                      <dd className="text-right font-medium text-[#6e5336] dark:text-[#bfa27f]">{row.lingkup}</dd>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      Tanggal
                    </dt>
                    <dd className="tabular-nums text-[#2d2217] dark:text-[#f6e9d5]">{row.tanggal}</dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-0.5">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      Nominal
                    </dt>
                    <dd className="text-right text-sm font-semibold tabular-nums text-rose-900 dark:text-rose-100">
                      {row.nominal}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
            {displayPengeluaran.length === 0 ? (
              <p className="rounded-xl border border-dashed border-rose-200/90 bg-rose-50/40 px-3 py-4 text-center text-xs leading-relaxed text-[#7d6042] dark:border-rose-900/45 dark:bg-rose-950/25 dark:text-[#eab4b4]">
                {isOwnerRole
                  ? `Tidak ada pengeluaran untuk P&L ${ownerPnlMonth} pada filter ini.`
                  : "Belum ada pengeluaran atau tidak cocok filter."}
              </p>
            ) : null}
          </div>
          <div className="hidden md:block md:overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-[#ecdcc6] text-xs uppercase tracking-[0.18em] text-[#8f724c] dark:border-[#3f3023] dark:text-[#cba97d]">
                  <th className="whitespace-nowrap px-3 py-3">Kategori</th>
                  {!isOwnerRole ? (
                    <th className="whitespace-nowrap px-3 py-3">Lingkup P&amp;L</th>
                  ) : null}
                  <th className="whitespace-nowrap px-3 py-3">Tanggal</th>
                  <th className="whitespace-nowrap px-3 py-3">Nominal</th>
                  <th className="whitespace-nowrap px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayPengeluaran.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#e3e9ff]/80 transition-colors duration-150 last:border-none dark:border-[#3a467f]/80 ${isOwnerRole ? ownerTableRowTheme(index) : "dark:bg-transparent"}`}
                  >
                    <td className="max-w-[14rem] px-3 py-3 font-medium">{row.kategori}</td>
                    {!isOwnerRole ? (
                      <td className="whitespace-nowrap px-3 py-3 text-[#6e5336] dark:text-[#bfa27f]">{row.lingkup}</td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{row.tanggal}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums font-semibold text-rose-900 dark:text-rose-100">
                      {row.nominal}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-full border border-rose-300/90 bg-white/70 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-800 dark:border-rose-700 dark:bg-rose-950/45 dark:text-rose-200">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {displayPengeluaran.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm leading-relaxed text-[#7d6042]" colSpan={isOwnerRole ? 4 : 5}>
                      {isOwnerRole
                        ? `Tidak ada pengeluaran untuk P&L ${ownerPnlMonth} pada filter ini.`
                        : "Belum ada pengeluaran atau tidak cocok filter."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="inline-flex min-h-[2.5rem] w-full items-center justify-center rounded-full border border-rose-300 bg-gradient-to-r from-rose-50 to-orange-50/80 px-4 py-2 text-center text-[11px] font-bold uppercase leading-snug tracking-[0.12em] text-rose-900 shadow-sm dark:border-rose-700 dark:from-rose-950/40 dark:to-orange-950/25 dark:text-rose-100 sm:min-h-0 sm:w-auto sm:py-1.5 sm:text-xs sm:tracking-[0.14em]">
              Total pengeluaran: Rp {totalPengeluaranNominal.toLocaleString("id-ID")}
            </span>
          </div>
        </article>
        ) : null}

        {showOwnerFinanceDetail ? (
        <article
          className={`min-w-0 rounded-2xl border p-4 sm:rounded-[1.8rem] sm:p-5 ${
            isOwnerRole
              ? ownerSectionArticleTheme(3)
              : "border-[#d6ddff] bg-white/90 dark:border-[#4f5b99] dark:bg-[#1a2144]/95"
          }`}
        >
          <SectionTitleWithIcon
            icon={BadgeDollarSign}
            title="Tabel Pemasukan"
            className="mb-3 text-[#2d2217] dark:text-[#f6e9d5] sm:mb-4"
            iconClassName={iconTone.success}
          />
          <div className="space-y-3 md:hidden">
            {displayPemasukan.map((row, index) => (
              <div
                key={row.id}
                className={`rounded-xl border p-3 ${
                  isOwnerRole
                    ? `${OWNER_INTERACTIVE_MOTION} ${ownerListCardTheme(index)}`
                    : "border-emerald-200/80 bg-gradient-to-b from-white/95 to-emerald-50/35 shadow-sm dark:border-emerald-900/35 dark:from-[#1a2144]/98 dark:to-[#14261c]/95"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-[#2d2217] dark:text-[#f6e9d5]">
                    {row.sumber}
                  </p>
                  <span className="inline-flex shrink-0 items-center rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {row.status}
                  </span>
                </div>
                <dl className="mt-2.5 space-y-2 border-t border-emerald-200/50 pt-2.5 text-xs dark:border-emerald-900/35">
                  <div className="flex justify-between gap-3">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      Tanggal
                    </dt>
                    <dd className="tabular-nums text-[#2d2217] dark:text-[#f6e9d5]">{row.tanggal}</dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-0.5">
                    <dt className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724c] dark:text-[#cba97d]">
                      Nominal
                    </dt>
                    <dd className="text-right text-sm font-semibold tabular-nums text-emerald-900 dark:text-emerald-100">
                      {row.nominal}
                    </dd>
                  </div>
                </dl>
              </div>
            ))}
            {displayPemasukan.length === 0 ? (
              <p className="rounded-xl border border-dashed border-emerald-200/90 bg-emerald-50/40 px-3 py-4 text-center text-xs leading-relaxed text-[#7d6042] dark:border-emerald-900/45 dark:bg-emerald-950/25 dark:text-[#a8d4bc]">
                {isOwnerRole
                  ? `Tidak ada pemasukan kos (Sewa kamar) untuk P&L ${ownerPnlMonth} pada filter ini.`
                  : "Belum ada pemasukan atau tidak cocok filter."}
              </p>
            ) : null}
          </div>
          <div className="hidden md:block md:overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left text-sm lg:min-w-0">
              <thead>
                <tr className="border-b border-[#ecdcc6] text-xs uppercase tracking-[0.18em] text-[#8f724c] dark:border-[#3f3023] dark:text-[#cba97d]">
                  <th className="whitespace-nowrap px-3 py-3">Sumber</th>
                  <th className="whitespace-nowrap px-3 py-3">Tanggal</th>
                  <th className="whitespace-nowrap px-3 py-3">Nominal</th>
                  <th className="whitespace-nowrap px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {displayPemasukan.map((row, index) => (
                  <tr
                    key={row.id}
                    className={`border-b border-[#e3e9ff] last:border-none dark:border-[#3a467f] ${isOwnerRole ? ownerTableRowTheme(index) : "dark:bg-transparent"}`}
                  >
                    <td className="max-w-[16rem] px-3 py-3">{row.sumber}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums">{row.tanggal}</td>
                    <td className="whitespace-nowrap px-3 py-3 tabular-nums font-medium">{row.nominal}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {displayPemasukan.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-sm leading-relaxed text-[#7d6042]" colSpan={4}>
                      {isOwnerRole
                        ? `Tidak ada pemasukan kos (Sewa kamar) untuk P&L ${ownerPnlMonth} pada filter ini.`
                        : "Belum ada pemasukan atau tidak cocok filter."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-stretch sm:justify-end">
            <span className="inline-flex min-h-[2.5rem] w-full items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-[11px] font-bold uppercase leading-snug tracking-[0.1em] text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100 sm:min-h-0 sm:w-auto sm:py-1 sm:text-xs sm:tracking-[0.14em]">
              Total pemasukan: Rp {totalPemasukanNominal.toLocaleString("id-ID")}
            </span>
          </div>
        </article>
        ) : null}
      </section>
      ) : null}
    </div>
  );
}
