"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/libsupabaseClient";
import {
  AlertTriangle,
  BedDouble,
  Bookmark,
  Building2,
  CalendarPlus,
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  ChevronDown,
  CreditCard,
  HandCoins,
  History,
  Landmark,
  LayoutList,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  Printer,
  Save,
  Search,
  Ticket,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import BrandLoader from "@/components/ui/brand-loader";
import RefreshToolbarButton from "@/components/ui/refresh-toolbar-button";
import StatusBadge from "@/components/ui/status-badge";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY, newSandboxId } from "@/lib/sandbox-storage";
import {
  FINANCE_POS_BOOKING_FEE,
  FINANCE_POS_DEPOSIT_KAMAR,
  FINANCE_POS_SEWA_KAMAR,
  canPromoteBookingToStay,
  remainingSewaAfterBookingFee,
  sanitizePenghuniPaymentFlags,
} from "@/lib/penghuni-finance-payment-sync";
import { buildDemoLokasiList, buildDemoUnitList } from "@/lib/demo-form-options";
import {
  isPlaceholderNoKamar,
  penghuniCountsAsOccupyingKamar,
  syncKamarRowsWithPenghuniList,
} from "@/lib/kamar-penghuni-sync";
import { BOOKING_UPLOADS_BUCKET } from "@/lib/bookingkos";
import { normalizeUserProfileRole } from "@/lib/user-profile-role";
import { useSupabaseSessionHydrated } from "@/components/supabase-session-ready";
import { useCloudDataResyncTick } from "@/components/cloud-resync-hook";
import {
  escapeIlikeExact,
  financeNotaTakenMessage,
  findFinanceRowWithDuplicateNota,
  findLastUsedSrNota,
  formatSrNotaFromDigits,
  isValidSrNotaDigits,
  normalizeNotaKey,
  sanitizeSrNotaDigits,
  srNotaDigitsInvalidMessage,
  suggestNextSrNotaDigits,
  suggestNextSrNotaDigitsFromLast,
  SR_NOTA_MAX_DIGITS,
} from "@/lib/finance-nota-validation";
import { buildSewaSplitCalendarMonthStarts, splitNominalRupiahEqualParts } from "@/lib/finance-sewa-split";
import type { KamarRow } from "@/components/kamar-page-client";
import type { FinanceRow } from "@/components/finance-page-client";

type PenghuniStatus = "Booking" | "Stay" | "History";
type PenghuniStatusListFilter = "semua" | PenghuniStatus;

const PENGHUNI_STATUS_FILTER_OPTIONS: Array<{
  value: PenghuniStatusListFilter;
  label: string;
  icon: LucideIcon;
}> = [
  { value: "semua", label: "Semua", icon: LayoutList },
  { value: "Booking", label: "Booking", icon: Bookmark },
  { value: "Stay", label: "Stay", icon: BedDouble },
  { value: "History", label: "History", icon: History },
];

function mapPenghuniStatusFromDb(raw: unknown): PenghuniStatus {
  const s = String(raw ?? "Booking").trim().toLowerCase();
  if (s === "stay") return "Stay";
  if (s === "history") return "History";
  return "Booking";
}

function splitPenghuniByStatus(rows: PenghuniRow[]): { active: PenghuniRow[]; history: PenghuniRow[] } {
  const active: PenghuniRow[] = [];
  const history: PenghuniRow[] = [];
  for (const r of rows) {
    if (r.status === "History") history.push(r);
    else active.push(r);
  }
  return { active, history };
}

export type PenghuniRow = {
  id: string;
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  periodeSewa: string;
  tglCheckIn: string;
  tglCheckOut: string;
  /** Awal siklus sewa aktif (dipakai untuk hitung payment sewa terkini). */
  sewaCycleStart?: string;
  /** Akhir siklus sewa aktif. */
  sewaCycleEnd?: string;
  hargaBulanan: string;
  bookingFee: string;
  /** Nominal deposit kamar (terpisah dari booking fee / DP sewa). */
  depositKamar: string;
  noWa: string;
  email?: string;
  status: PenghuniStatus;
  keterangan: string;
  /** Tercatat lunas lewat flow payment sewa kamar di profil. */
  sewaKamarPaid?: boolean;
  /** No. nota fisik yang dipakai saat mencatat payment sewa (sinkron dengan Finance). */
  sewaKamarNota?: string;
  /** Booking fee / DP sewa sudah lunas. */
  bookingFeePaid?: boolean;
  bookingFeeNota?: string;
  depositKamarPaid?: boolean;
  depositKamarNota?: string;
  /** Path Storage bucket booking-uploads (foto KTP/identitas). */
  fotoIdentitasPath?: string;
  /** Path Storage bucket booking-uploads (bukti transfer). */
  buktiTransferPath?: string;
  /** Asal data, mis. public_form. */
  bookingSource?: string;
  createdAt?: string | null;
};

export type SurveyCalonRow = {
  id: string;
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
  periodeSewa: string;
  rencanaCheckIn: string;
  negosiasiHarga: string;
  noWa: string;
  keterangan: string;
  createdAt?: string;
};

type PenghuniForm = Omit<PenghuniRow, "id" | "createdAt">;
type SurveyCalonForm = Omit<SurveyCalonRow, "id" | "createdAt">;

function formatRupiahInput(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return "";
  return Number(digitsOnly).toLocaleString("id-ID");
}

function parseRupiahToNumber(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

function formatRupiahRingkasan(raw: string): string {
  const n = parseRupiahToNumber(raw || "");
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function formatRpNumber(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

/** `iso` = YYYY-MM-DD; menambahkan `months` kalender (setMonth). */
function addCalendarMonthsToIsoDate(iso: string, months: number): string {
  const t = String(iso ?? "").trim();
  if (!t || months <= 0) return "";
  const [ys, ms, ds] = t.split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  if (!y || !m || !d) return "";
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return "";
  date.setMonth(date.getMonth() + months);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function penghuniHasOutstandingPayments(p: PenghuniRow): boolean {
  if (p.status !== "Booking" && p.status !== "Stay") return false;
  const harga = parseRupiahToNumber(p.hargaBulanan);
  const periode = Math.max(0, Math.floor(Number(p.periodeSewa) || 0));
  const bookingFee = parseRupiahToNumber(p.bookingFee);
  const deposit = parseRupiahToNumber(p.depositKamar);
  const sewaRemaining = remainingSewaAfterBookingFee({
    hargaBulanan: harga,
    periodeBulan: periode,
    bookingFee,
    bookingFeePaid: p.bookingFeePaid,
  });
  const sewaDue = sewaRemaining > 0 && !p.sewaKamarPaid;
  const bookingDue = p.status === "Booking" && bookingFee > 0 && !p.bookingFeePaid;
  const depDue = deposit > 0 && !p.depositKamarPaid;
  return sewaDue || bookingDue || depDue;
}

function isPenghuniSewaOverdue(p: PenghuniRow): boolean {
  if (p.status !== "Stay") return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  /** Setelah extend stay, `periodeSewa` = bulan siklus aktif; jangan pakai `tglCheckIn` pertama + periode (salah). */
  const cycleEndStr = getActiveSewaCycleEnd(p);
  if (cycleEndStr) {
    const end = new Date(`${cycleEndStr}T00:00:00`);
    if (!Number.isNaN(end.getTime())) {
      return end.getTime() < today.getTime();
    }
  }
  const cycleStart = getActiveSewaCycleStart(p);
  const bulan = Math.max(0, Math.floor(Number(p.periodeSewa) || 0));
  if (!cycleStart || bulan <= 0) return false;
  const projectedEnd = addCalendarMonthsToIsoDate(cycleStart, bulan);
  if (!projectedEnd) return false;
  const projected = new Date(`${projectedEnd}T00:00:00`);
  if (Number.isNaN(projected.getTime())) return false;
  return projected.getTime() < today.getTime();
}

function getActiveSewaCycleStart(p: PenghuniRow): string {
  return String(p.sewaCycleStart ?? "").trim() || String(p.tglCheckIn ?? "").trim();
}

function getActiveSewaCycleEnd(p: PenghuniRow): string {
  return String(p.sewaCycleEnd ?? "").trim() || String(p.tglCheckOut ?? "").trim();
}

function toWhatsAppDeepLink(noWa: string, msg: string): string | null {
  const raw = String(noWa ?? "").replace(/\s+/g, "");
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return null;
  const normalized = digits.startsWith("0") ? `62${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
}

function mapKamarDbToUi(row: Record<string, unknown>): KamarRow {
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
}

const initialForm: PenghuniForm = {
  namaLengkap: "",
  lokasiKos: "",
  unitBlok: "",
  noKamar: "",
  periodeSewa: "12",
  tglCheckIn: "",
  tglCheckOut: "",
  hargaBulanan: "",
  bookingFee: "",
  depositKamar: "",
  noWa: "",
  status: "Booking",
  keterangan: "",
};

const initialSurveyForm: SurveyCalonForm = {
  namaLengkap: "",
  lokasiKos: "",
  unitBlok: "",
  periodeSewa: "12",
  rencanaCheckIn: "",
  negosiasiHarga: "",
  noWa: "",
  keterangan: "",
};

function sortDateKey(value: string) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function mapDbRowToSurvey(row: Record<string, unknown>): SurveyCalonRow {
  return {
    id: String(row.id ?? ""),
    namaLengkap: String(row.nama_lengkap ?? ""),
    lokasiKos: String(row.lokasi_kos ?? ""),
    unitBlok: String(row.unit_blok ?? ""),
    periodeSewa: String(row.periode_sewa_bulan ?? "12"),
    rencanaCheckIn: String(row.tgl_check_in ?? ""),
    negosiasiHarga: formatRupiahInput(String(row.harga_bulanan ?? "")),
    noWa: String(row.no_wa ?? ""),
    keterangan: String(row.keterangan ?? ""),
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

export default function PenghuniPageClient({
  initialData,
  initialKamarRows = [],
}: {
  initialData: PenghuniRow[];
  initialKamarRows?: KamarRow[];
}) {
  const sessionHydrated = useSupabaseSessionHydrated();
  const cloudSyncTick = useCloudDataResyncTick();
  const { localDemoMode } = useSandboxMode();
  const { toast, confirm } = useAppFeedback();
  const [sandboxRev, setSandboxRev] = useState(0);
  const [sandboxReady, setSandboxReady] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setSandboxReady(true);
  }, []);

  useEffect(() => {
    const fn = () => setSandboxRev((n) => n + 1);
    if (typeof window === "undefined") return;
    window.addEventListener("secondroom-sandbox-updated", fn as EventListener);
    return () => window.removeEventListener("secondroom-sandbox-updated", fn as EventListener);
  }, []);

  const [form, setForm] = useState<PenghuniForm>(() => ({
    ...initialForm,
    noKamar: "",
  }));
  const initialPenghuniSplit = useMemo(() => splitPenghuniByStatus(initialData), [initialData]);
  const [data, setData] = useState<PenghuniRow[]>(() => initialPenghuniSplit.active);
  const [historyData, setHistoryData] = useState<PenghuniRow[]>(() => initialPenghuniSplit.history);
  const [cloudKamarRows, setCloudKamarRows] = useState<KamarRow[]>(initialKamarRows);
  const [cloudLokasiOptions, setCloudLokasiOptions] = useState<string[]>([]);
  const [cloudBlokMasterRows, setCloudBlokMasterRows] = useState<Array<{ lokasiId: string; namaBlok: string }>>([]);
  const [cloudLokasiIdByName, setCloudLokasiIdByName] = useState<Record<string, string>>({});
  const [surveyCalon, setSurveyCalon] = useState<SurveyCalonRow[]>([]);
  const [surveyForm, setSurveyForm] = useState<SurveyCalonForm>({ ...initialSurveyForm });
  const [surveyEditingId, setSurveyEditingId] = useState<string | null>(null);
  const [showPenghuniForm, setShowPenghuniForm] = useState(false);
  const [penghuniProfileRow, setPenghuniProfileRow] = useState<PenghuniRow | null>(null);
  const [profileFotoIdentitasUrl, setProfileFotoIdentitasUrl] = useState<string | null>(null);
  const [profileBuktiTransferUrl, setProfileBuktiTransferUrl] = useState<string | null>(null);
  const [profileDocsLoading, setProfileDocsLoading] = useState(false);
  const [showSewaPaymentPanel, setShowSewaPaymentPanel] = useState(false);
  const [sewaPaymentNominal, setSewaPaymentNominal] = useState("");
  /** Hanya angka setelah prefiks tetap SR (no. nota sewa = SR + angka). */
  const [sewaPaymentNotaDigits, setSewaPaymentNotaDigits] = useState("");
  /** Tanggal pembayaran sewa (YYYY-MM-DD), default hari ini. */
  const [sewaPaymentTanggal, setSewaPaymentTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [showExtendStayPanel, setShowExtendStayPanel] = useState(false);
  const [extendStayPeriodeBulan, setExtendStayPeriodeBulan] = useState("1");
  const [extendStayCheckOut, setExtendStayCheckOut] = useState("");
  const [extendStayNominalBulanan, setExtendStayNominalBulanan] = useState("");
  const [isSubmittingExtendStay, setIsSubmittingExtendStay] = useState(false);
  const [showDepositPaymentPanel, setShowDepositPaymentPanel] = useState(false);
  /** Panel deposit dipakai untuk booking fee (DP) atau deposit kamar. */
  const [depositPaymentKind, setDepositPaymentKind] = useState<"booking_fee" | "deposit">("deposit");
  const [depositPaymentNominal, setDepositPaymentNominal] = useState("");
  /** Hanya angka setelah prefiks tetap SR (no. nota deposit = SR + angka). */
  const [depositPaymentNotaDigits, setDepositPaymentNotaDigits] = useState("");
  /** Tanggal pembayaran booking fee / deposit (YYYY-MM-DD), default hari ini. */
  const [depositPaymentTanggal, setDepositPaymentTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  /** Nota SR dengan nilai numerik tertinggi di tabel finance (untuk label di profil/panel payment). */
  const [lastUsedSrNota, setLastUsedSrNota] = useState<string | null>(null);
  /** Duplikat no nota vs tabel finance (Supabase), untuk panel payment penghuni. */
  const [remotePaymentNotaConflictMessage, setRemotePaymentNotaConflictMessage] = useState("");
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyInfo, setSurveyInfo] = useState("");
  const [surveyError, setSurveyError] = useState("");
  const [viewerRole, setViewerRole] = useState("staff");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [selectedLokasiFilter, setSelectedLokasiFilter] = useState("Semua Lokasi");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("Semua Blok/Unit");
  const [penghuniStatusFilter, setPenghuniStatusFilter] = useState<PenghuniStatusListFilter>("semua");
  const [penghuniListSearch, setPenghuniListSearch] = useState("");
  /** Tooltip keterangan baris tabel (fixed supaya tidak terpotong overflow). */
  const [hoverKeterangan, setHoverKeterangan] = useState<{
    id: string;
    text: string;
    x: number;
    y: number;
  } | null>(null);
  const canManageSurvey = viewerRole === "super_admin" || viewerRole === "manager";
  const canEditPenghuni = viewerRole === "super_admin" || viewerRole === "supervisor";
  const canDeletePenghuni = viewerRole === "super_admin";

  const kamarSandboxRows = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as KamarRow[];
    return readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const rowsForDemoMerge = useMemo(
    () =>
      [...data, ...surveyCalon] as Array<{
        lokasiKos: string;
        unitBlok: string;
      }>,
    [data, surveyCalon]
  );

  const getCloudUnitOptionsByLokasi = (lokasiName: string): string[] => {
    const lokasiId = cloudLokasiIdByName[lokasiName] ?? "";
    if (!lokasiId) return [];
    return Array.from(
      new Set(
        cloudBlokMasterRows
          .filter((row) => row.lokasiId === lokasiId)
          .map((row) => row.namaBlok)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b, "id"));
  };

  const lokasiFormOptions = useMemo(() => {
    if (!localDemoMode) return cloudLokasiOptions;
    return buildDemoLokasiList(sandboxReady, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge, cloudLokasiOptions]);

  const unitFormOptions = useMemo(() => {
    if (!localDemoMode) return getCloudUnitOptionsByLokasi(form.lokasiKos);
    return buildDemoUnitList(sandboxReady, form.lokasiKos, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge, form.lokasiKos, cloudLokasiIdByName, cloudBlokMasterRows]);

  const surveyLokasiOptions = useMemo(() => {
    if (!localDemoMode) return cloudLokasiOptions;
    return buildDemoLokasiList(sandboxReady, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge, cloudLokasiOptions]);

  const surveyUnitOptions = useMemo(() => {
    if (!localDemoMode) return getCloudUnitOptionsByLokasi(surveyForm.lokasiKos);
    return buildDemoUnitList(sandboxReady, surveyForm.lokasiKos, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge, surveyForm.lokasiKos, cloudLokasiIdByName, cloudBlokMasterRows]);

  useEffect(() => {
    if (localDemoMode) return;
    if (!lokasiFormOptions.length) return;
    if (!lokasiFormOptions.includes(form.lokasiKos)) {
      const first = lokasiFormOptions[0] ?? "";
      const units = getCloudUnitOptionsByLokasi(first);
      setForm((prev) => ({ ...prev, lokasiKos: first, unitBlok: units[0] ?? "" }));
      return;
    }
    const units = getCloudUnitOptionsByLokasi(form.lokasiKos);
    if (units.length > 0 && !units.includes(form.unitBlok)) {
      setForm((prev) => ({ ...prev, unitBlok: units[0] ?? "" }));
    }
  }, [localDemoMode, form.lokasiKos, form.unitBlok, lokasiFormOptions, cloudLokasiIdByName, cloudBlokMasterRows]);

  useEffect(() => {
    if (!localDemoMode || !sandboxReady) return;
    if (!lokasiFormOptions.length) return;
    if (!lokasiFormOptions.includes(form.lokasiKos)) {
      const first = lokasiFormOptions[0] ?? "";
      const units = buildDemoUnitList(true, first, kamarSandboxRows, rowsForDemoMerge);
      setForm((prev) => ({
        ...prev,
        lokasiKos: first,
        unitBlok: units[0] ?? "",
      }));
      return;
    }
    const units = buildDemoUnitList(true, form.lokasiKos, kamarSandboxRows, rowsForDemoMerge);
    if (units.length && !units.includes(form.unitBlok)) {
      setForm((prev) => ({ ...prev, unitBlok: units[0] ?? "" }));
    }
  }, [localDemoMode, sandboxReady, lokasiFormOptions, form.lokasiKos, form.unitBlok, kamarSandboxRows, rowsForDemoMerge]);

  const isBlueAccent = form.status === "Booking" || form.status === "Stay";

  /** Booking: sisa = (harga×periode − DP jika lunas) + deposit belum lunas. Stay: sewa siklus + deposit. */
  const pembayaranRingkasanDisplay = useMemo(() => {
    const h = parseRupiahToNumber(form.hargaBulanan);
    const bookingFee = parseRupiahToNumber(form.bookingFee);
    const deposit = parseRupiahToNumber(form.depositKamar);
    const bulan = Math.max(0, Math.floor(Number(form.periodeSewa) || 0));

    if (form.status === "Stay") {
      const hasH = Boolean(form.hargaBulanan.replace(/\D/g, ""));
      const hasD = Boolean(form.depositKamar.replace(/\D/g, ""));
      if (!hasH && !hasD && bulan === 0) return "—";
      const total = h * bulan + deposit;
      const formatted = Math.abs(total).toLocaleString("id-ID");
      return total < 0 ? `Rp -${formatted}` : `Rp ${formatted}`;
    }

    const hasAny =
      Boolean(form.hargaBulanan.replace(/\D/g, "")) ||
      Boolean(form.bookingFee.replace(/\D/g, "")) ||
      Boolean(form.depositKamar.replace(/\D/g, ""));
    if (!hasAny && bulan === 0) return "—";
    const sisaSewa = Math.max(0, h * bulan - bookingFee);
    const total = sisaSewa + deposit;
    const formatted = Math.abs(total).toLocaleString("id-ID");
    return total < 0 ? `Rp -${formatted}` : `Rp ${formatted}`;
  }, [form.status, form.hargaBulanan, form.bookingFee, form.depositKamar, form.periodeSewa]);

  const profilePanelDerived = useMemo(() => {
    if (!penghuniProfileRow) return null;
    const r = penghuniProfileRow;
    const h = parseRupiahToNumber(r.hargaBulanan);
    const bulan = Math.max(0, Math.floor(Number(r.periodeSewa) || 0));
    const sewaTotal = h * bulan;
    const bookingFeeNum = parseRupiahToNumber(r.bookingFee);
    const depositNum = parseRupiahToNumber(r.depositKamar);
    const sisaSewaTarget = Math.max(0, sewaTotal - bookingFeeNum);
    const sisaSewaUnpaid = r.sewaKamarPaid ? 0 : sisaSewaTarget;
    const sisaKeStay = sisaSewaUnpaid + (r.depositKamarPaid ? 0 : depositNum);
    const sisaFormatted =
      r.status === "Booking"
        ? `${sisaKeStay < 0 ? "−" : ""}Rp ${Math.abs(sisaKeStay).toLocaleString("id-ID")}`
        : null;
    return {
      depositLabel: "Deposit kamar",
      depositFormatted: formatRupiahRingkasan(r.depositKamar),
      bookingFeeFormatted: formatRupiahRingkasan(r.bookingFee),
      sewaFormatted: `Rp ${sewaTotal.toLocaleString("id-ID")}`,
      sisaSewaFormatted: `Rp ${sisaSewaTarget.toLocaleString("id-ID")}`,
      hargaBulanFormatted: formatRupiahRingkasan(r.hargaBulanan),
      periodeBulan: bulan,
      sisaPembayaranBookingFormatted: sisaFormatted,
      sisaSewa: sisaSewaTarget,
      depositNum,
    };
  }, [penghuniProfileRow]);

  /** Referensi sisa sewa (setelah DP booking fee jika sudah lunas) vs nominal input. */
  const sewaPaymentDerived = useMemo(() => {
    if (!penghuniProfileRow) return null;
    const r = penghuniProfileRow;
    const h = parseRupiahToNumber(r.hargaBulanan);
    const bulan = Math.max(0, Math.floor(Number(r.periodeSewa) || 0));
    const referensiProfil = remainingSewaAfterBookingFee({
      hargaBulanan: h,
      periodeBulan: bulan,
      bookingFee: parseRupiahToNumber(r.bookingFee),
      bookingFeePaid: r.bookingFeePaid,
    });
    const nominalInput = parseRupiahToNumber(sewaPaymentNominal);
    const selisih = nominalInput - referensiProfil;
    return { referensiProfil, nominalInput, selisih };
  }, [penghuniProfileRow, sewaPaymentNominal]);

  const depositPaymentDerived = useMemo(() => {
    if (!penghuniProfileRow) return null;
    const referensiProfil =
      depositPaymentKind === "booking_fee"
        ? parseRupiahToNumber(penghuniProfileRow.bookingFee)
        : parseRupiahToNumber(penghuniProfileRow.depositKamar);
    const nominalInput = parseRupiahToNumber(depositPaymentNominal);
    const selisih = nominalInput - referensiProfil;
    return { referensiProfil, nominalInput, selisih };
  }, [penghuniProfileRow, depositPaymentNominal, depositPaymentKind]);

  useEffect(() => {
    let cancelled = false;
    const identitasPath = String(penghuniProfileRow?.fotoIdentitasPath ?? "").trim();
    const transferPath = String(penghuniProfileRow?.buktiTransferPath ?? "").trim();

    if (!penghuniProfileRow || (!identitasPath && !transferPath) || localDemoMode) {
      setProfileFotoIdentitasUrl(null);
      setProfileBuktiTransferUrl(null);
      setProfileDocsLoading(false);
      return;
    }

    setProfileDocsLoading(true);
    setProfileFotoIdentitasUrl(null);
    setProfileBuktiTransferUrl(null);

    void (async () => {
      try {
        const signOne = async (path: string) => {
          const { data, error } = await supabase.storage
            .from(BOOKING_UPLOADS_BUCKET)
            .createSignedUrl(path, 60 * 10);
          if (error || !data?.signedUrl) return null;
          return data.signedUrl;
        };
        const [idUrl, tfUrl] = await Promise.all([
          identitasPath ? signOne(identitasPath) : Promise.resolve(null),
          transferPath ? signOne(transferPath) : Promise.resolve(null),
        ]);
        if (cancelled) return;
        setProfileFotoIdentitasUrl(idUrl);
        setProfileBuktiTransferUrl(tfUrl);
      } finally {
        if (!cancelled) setProfileDocsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    localDemoMode,
    penghuniProfileRow,
    penghuniProfileRow?.fotoIdentitasPath,
    penghuniProfileRow?.buktiTransferPath,
  ]);

  const financeRowsForNotaCheck = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as FinanceRow[];
    return readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const sewaNotaFull = useMemo(
    () => formatSrNotaFromDigits(sewaPaymentNotaDigits),
    [sewaPaymentNotaDigits]
  );

  const depositNotaFull = useMemo(
    () => formatSrNotaFromDigits(depositPaymentNotaDigits),
    [depositPaymentNotaDigits]
  );

  useEffect(() => {
    const shouldLoad = penghuniProfileRow || showSewaPaymentPanel || showDepositPaymentPanel;
    if (!shouldLoad) {
      setLastUsedSrNota(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      if (localDemoMode) {
        const fin = readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
        if (!cancelled) setLastUsedSrNota(findLastUsedSrNota(fin));
        return;
      }
      const { data, error } = await supabase.from("finance").select("no_nota");
      if (cancelled) return;
      if (error) {
        setLastUsedSrNota(null);
        return;
      }
      setLastUsedSrNota(
        findLastUsedSrNota((data ?? []).map((r) => ({ no_nota: r.no_nota })))
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [
    penghuniProfileRow,
    showSewaPaymentPanel,
    showDepositPaymentPanel,
    localDemoMode,
    sandboxRev,
    cloudSyncTick,
  ]);

  const activePaymentNotaTrimmed = useMemo(() => {
    if (showSewaPaymentPanel) return sewaNotaFull;
    if (showDepositPaymentPanel) return depositNotaFull;
    return "";
  }, [showSewaPaymentPanel, showDepositPaymentPanel, sewaNotaFull, depositNotaFull]);

  const localPaymentNotaConflictMessage = useMemo(() => {
    if (!showSewaPaymentPanel && !showDepositPaymentPanel) return "";
    const trimmed = activePaymentNotaTrimmed;
    if (!normalizeNotaKey(trimmed)) return "";
    if (findFinanceRowWithDuplicateNota(financeRowsForNotaCheck, trimmed, null)) {
      return financeNotaTakenMessage(trimmed);
    }
    return "";
  }, [
    showSewaPaymentPanel,
    showDepositPaymentPanel,
    activePaymentNotaTrimmed,
    financeRowsForNotaCheck,
  ]);

  useEffect(() => {
    if (localDemoMode || (!showSewaPaymentPanel && !showDepositPaymentPanel)) {
      setRemotePaymentNotaConflictMessage("");
      return;
    }
    if (localPaymentNotaConflictMessage) {
      setRemotePaymentNotaConflictMessage("");
      return;
    }
    const trimmed = activePaymentNotaTrimmed;
    if (!normalizeNotaKey(trimmed)) {
      setRemotePaymentNotaConflictMessage("");
      return;
    }
    setRemotePaymentNotaConflictMessage("");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase
          .from("finance")
          .select("id")
          .ilike("no_nota", escapeIlikeExact(trimmed))
          .limit(1);
        if (cancelled) return;
        if (error) {
          setRemotePaymentNotaConflictMessage("");
          return;
        }
        if (data?.length) {
          setRemotePaymentNotaConflictMessage(financeNotaTakenMessage(trimmed));
        } else {
          setRemotePaymentNotaConflictMessage("");
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    activePaymentNotaTrimmed,
    localDemoMode,
    showSewaPaymentPanel,
    showDepositPaymentPanel,
    localPaymentNotaConflictMessage,
  ]);

  const paymentNotaConflictMessage =
    localPaymentNotaConflictMessage || remotePaymentNotaConflictMessage;

  const unpaidPenghuniPaymentCount = useMemo(() => {
    return data.filter((p) => penghuniHasOutstandingPayments(p)).length;
  }, [data]);
  const overduePenghuniCount = useMemo(() => data.filter((p) => isPenghuniSewaOverdue(p)).length, [data]);

  const formAccent = useMemo(
    () =>
      isBlueAccent
        ? "border-blue-300 shadow-[0_20px_50px_-35px_rgba(29,78,216,0.7)]"
        : "border-[#d9c2a4] shadow-[0_20px_50px_-35px_rgba(55,37,22,0.45)]",
    [isBlueAccent]
  );
  const lokasiFilterOptions = useMemo(() => {
    const fromPen = data.map((r) => r.lokasiKos).filter(Boolean);
    const fromSur = surveyCalon.map((r) => r.lokasiKos).filter(Boolean);
    return Array.from(new Set([...fromPen, ...fromSur])).sort((a, b) => a.localeCompare(b));
  }, [data, surveyCalon]);
  const unitFilterOptions = useMemo(() => {
    const sourceRows =
      selectedLokasiFilter === "Semua Lokasi"
        ? [...data, ...surveyCalon]
        : [...data, ...surveyCalon].filter((row) => row.lokasiKos === selectedLokasiFilter);
    return Array.from(new Set(sourceRows.map((row) => row.unitBlok).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [data, surveyCalon, selectedLokasiFilter]);
  const filteredData = useMemo(() => {
    return data.filter((row) => {
      const lokasiMatch =
        selectedLokasiFilter === "Semua Lokasi" || row.lokasiKos === selectedLokasiFilter;
      const unitMatch = selectedUnitFilter === "Semua Blok/Unit" || row.unitBlok === selectedUnitFilter;
      return lokasiMatch && unitMatch;
    });
  }, [data, selectedLokasiFilter, selectedUnitFilter]);

  const filteredPenghuniForList = useMemo(() => {
    return filteredData.filter((row) => {
      if (row.status !== "Booking" && row.status !== "Stay") return false;
      if (penghuniStatusFilter === "semua") return true;
      if (penghuniStatusFilter === "History") return false;
      return row.status === penghuniStatusFilter;
    });
  }, [filteredData, penghuniStatusFilter]);

  const filteredPenghuniBySearch = useMemo(() => {
    const q = penghuniListSearch.trim().toLowerCase();
    if (!q) return filteredPenghuniForList;
    return filteredPenghuniForList.filter((row) => {
      const nama = (row.namaLengkap ?? "").toLowerCase();
      const checkIn = (row.tglCheckIn ?? "").toLowerCase();
      return nama.includes(q) || checkIn.includes(q);
    });
  }, [filteredPenghuniForList, penghuniListSearch]);

  const sortedByCheckOut = useMemo(() => {
    const copy = [...filteredPenghuniBySearch];
    copy.sort((a, b) => sortDateKey(a.tglCheckOut) - sortDateKey(b.tglCheckOut));
    return copy;
  }, [filteredPenghuniBySearch]);

  const filteredHistoryData = useMemo(() => {
    return historyData.filter((row) => {
      const lokasiMatch =
        selectedLokasiFilter === "Semua Lokasi" || row.lokasiKos === selectedLokasiFilter;
      const unitMatch = selectedUnitFilter === "Semua Blok/Unit" || row.unitBlok === selectedUnitFilter;
      return lokasiMatch && unitMatch;
    });
  }, [historyData, selectedLokasiFilter, selectedUnitFilter]);

  const filteredHistoryBySearch = useMemo(() => {
    const q = penghuniListSearch.trim().toLowerCase();
    if (!q) return filteredHistoryData;
    return filteredHistoryData.filter((row) => {
      const nama = (row.namaLengkap ?? "").toLowerCase();
      const checkIn = (row.tglCheckIn ?? "").toLowerCase();
      return nama.includes(q) || checkIn.includes(q);
    });
  }, [filteredHistoryData, penghuniListSearch]);

  const sortedHistoryByCheckOut = useMemo(() => {
    const copy = [...filteredHistoryBySearch];
    copy.sort((a, b) => sortDateKey(b.tglCheckOut) - sortDateKey(a.tglCheckOut));
    return copy;
  }, [filteredHistoryBySearch]);

  const penghuniStatusFilterCounts = useMemo(() => {
    const booking = filteredData.filter((r) => r.status === "Booking").length;
    const stay = filteredData.filter((r) => r.status === "Stay").length;
    const history = filteredHistoryData.length;
    return {
      semua: booking + stay,
      Booking: booking,
      Stay: stay,
      History: history,
    } as Record<PenghuniStatusListFilter, number>;
  }, [filteredData, filteredHistoryData]);

  const displayedPenghuniRows = useMemo(
    () => (penghuniStatusFilter === "History" ? sortedHistoryByCheckOut : sortedByCheckOut),
    [penghuniStatusFilter, sortedHistoryByCheckOut, sortedByCheckOut]
  );

  const filteredSurveyRows = useMemo(() => {
    return surveyCalon.filter((row) => {
      const lokasiMatch =
        selectedLokasiFilter === "Semua Lokasi" || row.lokasiKos === selectedLokasiFilter;
      const unitMatch = selectedUnitFilter === "Semua Blok/Unit" || row.unitBlok === selectedUnitFilter;
      return lokasiMatch && unitMatch;
    });
  }, [surveyCalon, selectedLokasiFilter, selectedUnitFilter]);

  const sortedSurveyRows = useMemo(() => {
    const copy = [...filteredSurveyRows];
    copy.sort((a, b) => sortDateKey(a.rencanaCheckIn) - sortDateKey(b.rencanaCheckIn));
    return copy;
  }, [filteredSurveyRows]);

  const availableRoomNumbers = useMemo(() => {
    const source = localDemoMode ? kamarSandboxRows : cloudKamarRows;
    /** Sumber kebenaran okupansi: data penghuni Booking/Stay, bukan hanya kamar.status di DB. */
    const occupiedKeys = new Set(
      data
        .filter((p) => p.id !== editingId)
        .filter((p) =>
          penghuniCountsAsOccupyingKamar({
            status: p.status,
            lokasiKos: p.lokasiKos,
            unitBlok: p.unitBlok,
            noKamar: p.noKamar,
            sewaKamarPaid: p.sewaKamarPaid,
            namaLengkap: p.namaLengkap,
            tglCheckOut: p.tglCheckOut,
          })
        )
        .map((p) => `${p.lokasiKos.trim()}|${p.unitBlok.trim()}|${p.noKamar.trim()}`)
    );

    const nums = source
      .filter((r) => {
        if (r.lokasiKos !== form.lokasiKos || r.unitBlok !== form.unitBlok) return false;
        if (r.status === "Maintenance") return false;
        const key = `${r.lokasiKos.trim()}|${r.unitBlok.trim()}|${r.noKamar.trim()}`;
        if (occupiedKeys.has(key)) return false;
        /** Jika DB Occupied tapi tidak ada penghuni yang match (stale), tetap izinkan. */
        return true;
      })
      .map((r) => r.noKamar)
      .filter((nk) => Boolean(nk) && !isPlaceholderNoKamar(nk));

    const merged = new Set(nums);
    if (editingId && (form.status === "Booking" || form.status === "Stay")) {
      const ed = data.find((p) => p.id === editingId);
      const cur = ed?.noKamar;
      if (
        cur &&
        !isPlaceholderNoKamar(cur) &&
        ed?.lokasiKos === form.lokasiKos &&
        ed?.unitBlok === form.unitBlok
      ) {
        merged.add(cur);
      }
    }
    return Array.from(merged).sort((a, b) => a.localeCompare(b, "id", { numeric: true }));
  }, [
    localDemoMode,
    kamarSandboxRows,
    cloudKamarRows,
    form.lokasiKos,
    form.unitBlok,
    form.status,
    editingId,
    data,
    sandboxRev,
  ]);

  useEffect(() => {
    if (availableRoomNumbers.length === 0) {
      if (form.noKamar !== "" && !isPlaceholderNoKamar(form.noKamar)) {
        setForm((prev) => ({ ...prev, noKamar: "" }));
      }
      return;
    }
    if (isPlaceholderNoKamar(form.noKamar) || !availableRoomNumbers.includes(form.noKamar)) {
      setForm((prev) => ({ ...prev, noKamar: availableRoomNumbers[0] ?? "" }));
    }
  }, [availableRoomNumbers, form.status, form.noKamar]);

  useEffect(() => {
    if (!localDemoMode) return;
    if (!sandboxReady) return;
    const rawPen = readSandboxJson<Array<PenghuniRow & { status?: string }>>(SB_KEY.penghuni, initialData);
    const legacy = rawPen.filter((p) => String(p.status) === "Survey");
    let nextPen = rawPen.filter((p) => String(p.status) !== "Survey").map((r) => ({
      ...(r as PenghuniRow),
      bookingFee: (r as PenghuniRow).bookingFee ?? "",
      depositKamar: (r as PenghuniRow).depositKamar ?? "",
      sewaKamarPaid: Boolean((r as PenghuniRow).sewaKamarPaid),
      sewaKamarNota: String((r as PenghuniRow).sewaKamarNota ?? ""),
      bookingFeePaid: Boolean((r as PenghuniRow).bookingFeePaid),
      bookingFeeNota: String((r as PenghuniRow).bookingFeeNota ?? ""),
      depositKamarPaid: Boolean((r as PenghuniRow).depositKamarPaid),
      depositKamarNota: String((r as PenghuniRow).depositKamarNota ?? ""),
    })) as PenghuniRow[];
    const normalizedPen = nextPen.map((p) => sanitizePenghuniPaymentFlags(p));
    const paymentDrift = nextPen.some((p, i) => {
      const n = normalizedPen[i];
      if (!n) return false;
      return (
        Boolean(p.sewaKamarPaid) !== Boolean(n.sewaKamarPaid) ||
        String(p.sewaKamarNota ?? "") !== String(n.sewaKamarNota ?? "") ||
        Boolean(p.bookingFeePaid) !== Boolean(n.bookingFeePaid) ||
        String(p.bookingFeeNota ?? "") !== String(n.bookingFeeNota ?? "") ||
        Boolean(p.depositKamarPaid) !== Boolean(n.depositKamarPaid) ||
        String(p.depositKamarNota ?? "") !== String(n.depositKamarNota ?? "")
      );
    });
    let nextSurvey = readSandboxJson<SurveyCalonRow[]>(SB_KEY.surveyCalon, []);
    if (legacy.length) {
      const migrated: SurveyCalonRow[] = legacy.map((p) => ({
        id: p.id,
        namaLengkap: p.namaLengkap,
        lokasiKos: p.lokasiKos,
        unitBlok: p.unitBlok,
        periodeSewa: p.periodeSewa,
        rencanaCheckIn: p.tglCheckIn || "",
        negosiasiHarga: formatRupiahInput(p.hargaBulanan || "") || "",
        noWa: p.noWa,
        keterangan: p.keterangan,
        createdAt: p.createdAt ?? undefined,
      }));
      const ids = new Set(migrated.map((m) => m.id));
      nextSurvey = [...migrated, ...nextSurvey.filter((s) => !ids.has(s.id))];
      writeSandboxJson(SB_KEY.penghuni, normalizedPen);
      writeSandboxJson(SB_KEY.surveyCalon, nextSurvey);
    } else if (paymentDrift) {
      writeSandboxJson(SB_KEY.penghuni, normalizedPen);
    }
    nextPen = normalizedPen;
    const split = splitPenghuniByStatus(nextPen.length ? nextPen : initialData);
    setData(split.active);
    setHistoryData(split.history);
    setSurveyCalon(nextSurvey);
  }, [localDemoMode, initialData, sandboxRev, sandboxReady]);

  const persistPenghuniSandbox = (active: PenghuniRow[], history: PenghuniRow[]) => {
    writeSandboxJson(SB_KEY.penghuni, [...active, ...history]);
  };

  const mapDbRowToUi = (row: Record<string, unknown>): PenghuniRow => {
    const status = mapPenghuniStatusFromDb(row.status);

    const mapped: PenghuniRow = {
      id: String(row.id ?? ""),
      namaLengkap: String(row.nama_lengkap ?? ""),
      lokasiKos: String(row.lokasi_kos ?? ""),
      unitBlok: String(row.unit_blok ?? ""),
      noKamar: String(row.no_kamar ?? ""),
      periodeSewa: String(row.periode_sewa_bulan ?? ""),
      tglCheckIn: String(row.tgl_check_in ?? ""),
      tglCheckOut: String(row.tgl_check_out ?? ""),
      sewaCycleStart: String(row.sewa_cycle_start ?? ""),
      sewaCycleEnd: String(row.sewa_cycle_end ?? ""),
      hargaBulanan: String(row.harga_bulanan ?? ""),
      bookingFee: String(row.booking_fee ?? ""),
      depositKamar: String(row.deposit_kamar ?? ""),
      noWa: String(row.no_wa ?? ""),
      email: String(row.email ?? ""),
      status,
      keterangan: String(row.keterangan ?? ""),
      sewaKamarPaid: Boolean(row.sewa_kamar_paid),
      sewaKamarNota: String(row.sewa_kamar_nota ?? ""),
      bookingFeePaid: Boolean(row.booking_fee_paid),
      bookingFeeNota: String(row.booking_fee_nota ?? ""),
      depositKamarPaid: Boolean(row.deposit_kamar_paid),
      depositKamarNota: String(row.deposit_kamar_nota ?? ""),
      fotoIdentitasPath: String(row.foto_identitas_path ?? ""),
      buktiTransferPath: String(row.bukti_transfer_path ?? ""),
      bookingSource: String(row.booking_source ?? ""),
      createdAt: row.created_at ? String(row.created_at) : null,
    };
    return sanitizePenghuniPaymentFlags(mapped);
  };

  const loadPenghuni = async (): Promise<boolean> => {
    setIsLoading(true);
    if (localDemoMode) {
      const raw = readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, initialData);
      const mapped = raw.map((r) => ({
        ...r,
        bookingFee: r.bookingFee ?? "",
        depositKamar: r.depositKamar ?? "",
        sewaKamarPaid: Boolean(r.sewaKamarPaid),
        sewaKamarNota: String(r.sewaKamarNota ?? ""),
        bookingFeePaid: Boolean(r.bookingFeePaid),
        bookingFeeNota: String(r.bookingFeeNota ?? ""),
        depositKamarPaid: Boolean(r.depositKamarPaid),
        depositKamarNota: String(r.depositKamarNota ?? ""),
      }));
      const normalized = mapped.map((r) => sanitizePenghuniPaymentFlags(r));
      const drift = mapped.some((p, i) => {
        const n = normalized[i];
        return (
          Boolean(p.sewaKamarPaid) !== Boolean(n.sewaKamarPaid) ||
          String(p.sewaKamarNota ?? "") !== String(n.sewaKamarNota ?? "") ||
          Boolean(p.bookingFeePaid) !== Boolean(n.bookingFeePaid) ||
          String(p.bookingFeeNota ?? "") !== String(n.bookingFeeNota ?? "") ||
          Boolean(p.depositKamarPaid) !== Boolean(n.depositKamarPaid) ||
          String(p.depositKamarNota ?? "") !== String(n.depositKamarNota ?? "")
        );
      });
      if (drift) {
        persistPenghuniSandbox(
          normalized.filter((p) => p.status !== "History"),
          normalized.filter((p) => p.status === "History")
        );
      }
      const split = splitPenghuniByStatus(normalized);
      setData(split.active);
      setHistoryData(split.history);
      setSurveyCalon(readSandboxJson<SurveyCalonRow[]>(SB_KEY.surveyCalon, []));
      setErrorMessage("");
      setIsLoading(false);
      return true;
    }
    const { data: fetchedData, error } = await supabase
      .from("penghuni")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return false;
    }

    setErrorMessage("");
    const rows = [...(fetchedData ?? [])] as Record<string, unknown>[];
    for (const r of rows) {
      const id = String(r.id ?? "");
      if (Boolean(r.sewa_kamar_paid) && !String(r.sewa_kamar_nota ?? "").trim()) {
        const { error: upErr } = await supabase
          .from("penghuni")
          .update({ sewa_kamar_paid: false, sewa_kamar_nota: null })
          .eq("id", id);
        if (!upErr) {
          r.sewa_kamar_paid = false;
          r.sewa_kamar_nota = null;
        }
      }
      if (Boolean(r.deposit_kamar_paid) && !String(r.deposit_kamar_nota ?? "").trim()) {
        const { error: upErr } = await supabase
          .from("penghuni")
          .update({ deposit_kamar_paid: false, deposit_kamar_nota: null })
          .eq("id", id);
        if (!upErr) {
          r.deposit_kamar_paid = false;
          r.deposit_kamar_nota = null;
        }
      }
      if (Boolean(r.booking_fee_paid) && !String(r.booking_fee_nota ?? "").trim()) {
        const { error: upErr } = await supabase
          .from("penghuni")
          .update({ booking_fee_paid: false, booking_fee_nota: null })
          .eq("id", id);
        if (!upErr) {
          r.booking_fee_paid = false;
          r.booking_fee_nota = null;
        }
      }
    }
    const surveyRows = rows.filter((row) => String(row.status ?? "").toLowerCase() === "survey");
    const penghuniRows = rows.filter((row) => String(row.status ?? "").toLowerCase() !== "survey");
    setSurveyCalon(surveyRows.map((row) => mapDbRowToSurvey(row)));
    const split = splitPenghuniByStatus(penghuniRows.map((row) => mapDbRowToUi(row)));
    setData(split.active);
    setHistoryData(split.history);

    const [{ data: kamarData, error: kamarError }, { data: lokasiData }, { data: blokData }] =
      await Promise.all([
        supabase.from("kamar").select("*").order("no_kamar", { ascending: true }),
        supabase.from("master_lokasi").select("id, nama_lokasi"),
        supabase.from("master_blok").select("lokasi_id, nama_blok"),
      ]);

    if (kamarError) {
      setErrorMessage(kamarError.message);
      setIsLoading(false);
      return false;
    }
    setCloudKamarRows((kamarData ?? []).map((row) => mapKamarDbToUi(row as Record<string, unknown>)));
    const lokasiNames = (lokasiData ?? [])
      .map((row) => String((row as Record<string, unknown>).nama_lokasi ?? "").trim())
      .filter(Boolean);
    const lokasiMap: Record<string, string> = {};
    (lokasiData ?? []).forEach((row) => {
      const rec = row as Record<string, unknown>;
      const id = String(rec.id ?? "");
      const nama = String(rec.nama_lokasi ?? "").trim();
      if (id && nama) lokasiMap[nama] = id;
    });
    setCloudLokasiIdByName(lokasiMap);
    setCloudLokasiOptions(Array.from(new Set(lokasiNames)).sort((a, b) => a.localeCompare(b, "id")));
    setCloudBlokMasterRows(
      (blokData ?? []).map((row) => {
        const rec = row as Record<string, unknown>;
        return {
          lokasiId: String(rec.lokasi_id ?? ""),
          namaBlok: String(rec.nama_blok ?? "").trim(),
        };
      })
    );
    setIsLoading(false);
    return true;
  };

  const loadPenghuniRef = useRef(loadPenghuni);
  loadPenghuniRef.current = loadPenghuni;

  useEffect(() => {
    if (localDemoMode || !sessionHydrated) return;
    void loadPenghuniRef.current();
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);

  useEffect(() => {
    if (localDemoMode) {
      setViewerRole("staff");
      return;
    }
    if (!sessionHydrated) return;
    let cancelled = false;
    const loadViewerRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from("user_profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setViewerRole(normalizeUserProfileRole((data as Record<string, unknown> | null)?.role));
    };
    void loadViewerRole();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);

  useEffect(() => {
    const fn = () => {
      void loadPenghuniRef.current();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("secondroom-penghuni-reload", fn as EventListener);
    return () => window.removeEventListener("secondroom-penghuni-reload", fn as EventListener);
  }, []);

  /** Sinkronkan modal profil jika daftar penghuni berubah (mis. hapus transaksi di Finance). */
  useEffect(() => {
    setPenghuniProfileRow((prev) => {
      if (!prev) return prev;
      const fresh = data.find((p) => p.id === prev.id) ?? historyData.find((p) => p.id === prev.id);
      if (!fresh) return prev;
      if (
        fresh.sewaKamarPaid === prev.sewaKamarPaid &&
        String(fresh.sewaKamarNota ?? "") === String(prev.sewaKamarNota ?? "") &&
        fresh.bookingFeePaid === prev.bookingFeePaid &&
        String(fresh.bookingFeeNota ?? "") === String(prev.bookingFeeNota ?? "") &&
        fresh.depositKamarPaid === prev.depositKamarPaid &&
        String(fresh.depositKamarNota ?? "") === String(prev.depositKamarNota ?? "") &&
        String(fresh.depositKamar ?? "") === String(prev.depositKamar ?? "") &&
        String(fresh.bookingFee ?? "") === String(prev.bookingFee ?? "") &&
        fresh.status === prev.status
      ) {
        return prev;
      }
      return fresh;
    });
  }, [data, historyData]);

  const handleRefreshPenghuni = async () => {
    const ok = await loadPenghuni();
    setSandboxRev((n) => n + 1);
    if (ok) {
      toast("Daftar penghuni dan survey berhasil dimuat ulang.", "info");
    } else {
      toast("Muat ulang selesai dengan error. Periksa pesan di halaman.", "error");
    }
  };

  const reconcileCloudKamarWithPenghuni = async () => {
    const { data: pens } = await supabase.from("penghuni").select("*");
    const { data: kms } = await supabase.from("kamar").select("*");
    const penUi = (pens ?? []).map((row) => mapDbRowToUi(row as Record<string, unknown>));
    const kmUi = (kms ?? []).map((row) => mapKamarDbToUi(row as Record<string, unknown>));
    const desired = syncKamarRowsWithPenghuniList(kmUi, penUi);
    for (let i = 0; i < desired.length; i++) {
      const d = desired[i];
      const k = kmUi[i];
      if (!k || k.id !== d.id) continue;
      if (
        k.status === d.status &&
        k.namaPenghuni === d.namaPenghuni &&
        k.tglCheckOut === d.tglCheckOut
      ) {
        continue;
      }
      const tglOut =
        d.tglCheckOut && d.tglCheckOut !== "-" ? d.tglCheckOut : null;
      await supabase
        .from("kamar")
        .update({
          status: d.status,
          nama_penghuni: d.namaPenghuni,
          tgl_check_out: tglOut,
        })
        .eq("id", d.id);
    }
    setCloudKamarRows(desired);
  };

  const resetForm = () => {
    const loc = lokasiFormOptions[0] ?? "";
    const units = localDemoMode
      ? buildDemoUnitList(sandboxReady, loc, kamarSandboxRows, rowsForDemoMerge)
      : getCloudUnitOptionsByLokasi(loc);
    setForm({
      ...initialForm,
      lokasiKos: loc,
      unitBlok: units[0] ?? "",
      noKamar: "",
    });
    setEditingId(null);
  };

  /** Stay: check-out = check-in + N bulan kalender (sama logika payment sewa). */
  useEffect(() => {
    if (form.status !== "Stay") return;
    const bulan = Math.max(0, Math.floor(Number(form.periodeSewa) || 0));
    const ci = String(form.tglCheckIn ?? "").trim();
    if (!ci || bulan <= 0) {
      setForm((prev) => {
        if (prev.status !== "Stay") return prev;
        if (!prev.tglCheckOut) return prev;
        return { ...prev, tglCheckOut: "" };
      });
      return;
    }
    const co = addCalendarMonthsToIsoDate(ci, bulan);
    if (!co) return;
    setForm((prev) => {
      if (prev.status !== "Stay") return prev;
      if (prev.tglCheckOut === co) return prev;
      return { ...prev, tglCheckOut: co };
    });
  }, [form.status, form.tglCheckIn, form.periodeSewa]);

  const projectedBookingCheckOut = useMemo(() => {
    if (form.status !== "Booking") return "";
    const bulan = Math.max(0, Math.floor(Number(form.periodeSewa) || 0));
    const ci = String(form.tglCheckIn ?? "").trim();
    if (!ci || bulan <= 0) return "";
    return addCalendarMonthsToIsoDate(ci, bulan) || "";
  }, [form.status, form.tglCheckIn, form.periodeSewa]);

  const handleInputChange = (field: keyof PenghuniForm, value: string) => {
    if (field === "lokasiKos") {
      setForm((prev) => {
        const units = localDemoMode
          ? buildDemoUnitList(sandboxReady, value, kamarSandboxRows, rowsForDemoMerge)
          : getCloudUnitOptionsByLokasi(value);
        return {
          ...prev,
          lokasiKos: value,
          unitBlok: units.includes(prev.unitBlok) ? prev.unitBlok : units[0] ?? "",
        };
      });
      return;
    }
    if (field === "status") {
      const nextStatus = value as PenghuniStatus;
      setForm((prev) => ({
        ...prev,
        status: nextStatus,
        tglCheckOut: nextStatus === "Booking" ? "" : prev.tglCheckOut,
        noKamar:
          prev.noKamar && availableRoomNumbers.includes(prev.noKamar)
            ? prev.noKamar
            : availableRoomNumbers[0] ?? "",
      }));
      return;
    }

    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setInfoMessage("");
    setErrorMessage("");

    if (!form.noKamar) {
      const msg =
        "Tidak ada kamar available. Tambahkan kamar available di halaman Kamar.";
      setErrorMessage(msg);
      toast(msg, "error");
      setIsSubmitting(false);
      return;
    }

    const existingPenghuniRow = editingId ? data.find((r) => r.id === editingId) : null;

    const payload = {
      nama_lengkap: form.namaLengkap,
      lokasi_kos: form.lokasiKos,
      unit_blok: form.unitBlok,
      no_kamar: form.noKamar,
      periode_sewa_bulan: Number(form.periodeSewa),
      tgl_check_in: form.tglCheckIn,
      tgl_check_out: form.status === "Booking" ? null : form.tglCheckOut || null,
      sewa_cycle_start: form.status === "Stay" ? form.tglCheckIn || null : null,
      sewa_cycle_end: form.status === "Stay" ? form.tglCheckOut || null : null,
      harga_bulanan: parseRupiahToNumber(form.hargaBulanan),
      booking_fee: parseRupiahToNumber(form.bookingFee),
      deposit_kamar: parseRupiahToNumber(form.depositKamar),
      no_wa: form.noWa,
      status: form.status,
      keterangan: form.keterangan,
      sewa_kamar_paid: existingPenghuniRow?.sewaKamarPaid ?? false,
      sewa_kamar_nota: existingPenghuniRow?.sewaKamarNota?.trim() || null,
      booking_fee_paid: existingPenghuniRow?.bookingFeePaid ?? false,
      booking_fee_nota: existingPenghuniRow?.bookingFeeNota?.trim() || null,
      deposit_kamar_paid: existingPenghuniRow?.depositKamarPaid ?? false,
      deposit_kamar_nota: existingPenghuniRow?.depositKamarNota?.trim() || null,
    };

    if (localDemoMode) {
      const base: PenghuniRow = {
        id: editingId ?? newSandboxId(),
        namaLengkap: form.namaLengkap,
        lokasiKos: form.lokasiKos,
        unitBlok: form.unitBlok,
        noKamar: form.noKamar,
        periodeSewa: form.periodeSewa,
        tglCheckIn: form.tglCheckIn,
        tglCheckOut: form.status === "Booking" ? "" : form.tglCheckOut,
        sewaCycleStart: form.status === "Stay" ? form.tglCheckIn : "",
        sewaCycleEnd: form.status === "Stay" ? form.tglCheckOut : "",
        hargaBulanan: String(parseRupiahToNumber(form.hargaBulanan)),
        bookingFee: String(parseRupiahToNumber(form.bookingFee)),
        depositKamar: String(parseRupiahToNumber(form.depositKamar)),
        noWa: form.noWa,
        status: form.status,
        keterangan: form.keterangan,
        sewaKamarPaid: existingPenghuniRow?.sewaKamarPaid ?? false,
        sewaKamarNota: existingPenghuniRow?.sewaKamarNota ?? "",
        bookingFeePaid: existingPenghuniRow?.bookingFeePaid ?? false,
        bookingFeeNota: existingPenghuniRow?.bookingFeeNota ?? "",
        depositKamarPaid: existingPenghuniRow?.depositKamarPaid ?? false,
        depositKamarNota: existingPenghuniRow?.depositKamarNota ?? "",
        createdAt: new Date().toISOString(),
      };
      const next = editingId
        ? data.map((row) => (row.id === editingId ? { ...base, id: editingId } : row))
        : [base, ...data];
      setData(next);
      persistPenghuniSandbox(next, historyData);
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, next));
      toast(editingId ? "Data penghuni berhasil diperbarui." : "Data penghuni berhasil disimpan.", "success");
      resetForm();
      setShowPenghuniForm(false);
      setIsSubmitting(false);
      return;
    }

    if (editingId) {
      const { error } = await supabase
        .from("penghuni")
        .update(payload)
        .eq("id", editingId);

      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        setIsSubmitting(false);
        return;
      }

      toast("Data penghuni berhasil diperbarui.", "success");
      setShowPenghuniForm(false);
    } else {
      const { error } = await supabase.from("penghuni").insert(payload);

      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        setIsSubmitting(false);
        return;
      }

      toast("Data penghuni berhasil disimpan.", "success");
      setShowPenghuniForm(false);
    }

    await loadPenghuni();
    await reconcileCloudKamarWithPenghuni();
    resetForm();
    setIsSubmitting(false);
  };

  const handleEdit = (row: PenghuniRow) => {
    setShowSurveyForm(false);
    setPenghuniProfileRow(null);
    setShowSewaPaymentPanel(false);
    setShowDepositPaymentPanel(false);
    setShowPenghuniForm(true);
    setEditingId(row.id);
    setForm({
      namaLengkap: row.namaLengkap,
      lokasiKos: row.lokasiKos || lokasiFormOptions[0] || "",
      unitBlok: (() => {
        const loc = row.lokasiKos || lokasiFormOptions[0] || "";
        const units = localDemoMode
          ? buildDemoUnitList(sandboxReady, loc, kamarSandboxRows, rowsForDemoMerge)
          : getCloudUnitOptionsByLokasi(loc);
        return row.unitBlok && units.includes(row.unitBlok) ? row.unitBlok : units[0] ?? "";
      })(),
      noKamar: !isPlaceholderNoKamar(row.noKamar)
        ? row.noKamar
        : availableRoomNumbers[0] || "",
      periodeSewa: row.periodeSewa || "1",
      tglCheckIn: row.tglCheckIn || "",
      tglCheckOut: row.tglCheckOut || "",
      hargaBulanan: formatRupiahInput(row.hargaBulanan || ""),
      bookingFee: formatRupiahInput(row.bookingFee || ""),
      depositKamar: formatRupiahInput(row.depositKamar || ""),
      noWa: row.noWa || "",
      status: row.status,
      keterangan: row.keterangan || "",
    });
    setInfoMessage("Mode edit aktif.");
    setErrorMessage("");
  };

  const handleDelete = async (id: string): Promise<boolean> => {
    setInfoMessage("");
    setErrorMessage("");

    if (localDemoMode) {
      const nextActive = data.filter((row) => row.id !== id);
      const nextHistory = historyData.filter((row) => row.id !== id);
      setData(nextActive);
      setHistoryData(nextHistory);
      persistPenghuniSandbox(nextActive, nextHistory);
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, nextActive));
      if (editingId === id) resetForm();
      return true;
    }

    const { error } = await supabase.from("penghuni").delete().eq("id", id);
    if (error) {
      setErrorMessage(error.message);
      toast(error.message, "error", "center");
      return false;
    }

    if (editingId === id) {
      resetForm();
    }

    await loadPenghuni();
    await reconcileCloudKamarWithPenghuni();
    return true;
  };

  const resetSurveyForm = () => {
    const loc = surveyLokasiOptions[0] ?? "";
    const units = localDemoMode
      ? buildDemoUnitList(sandboxReady, loc, kamarSandboxRows, rowsForDemoMerge)
      : getCloudUnitOptionsByLokasi(loc);
    setSurveyForm({
      ...initialSurveyForm,
      lokasiKos: loc,
      unitBlok: units[0] ?? "",
    });
    setSurveyEditingId(null);
    setSurveyInfo("");
    setSurveyError("");
  };

  useEffect(() => {
    if (!localDemoMode || !sandboxReady) return;
    if (!surveyLokasiOptions.length) return;
    if (!surveyLokasiOptions.includes(surveyForm.lokasiKos)) {
      const first = surveyLokasiOptions[0] ?? "";
      const units = buildDemoUnitList(true, first, kamarSandboxRows, rowsForDemoMerge);
      setSurveyForm((prev) => ({
        ...prev,
        lokasiKos: first,
        unitBlok: units[0] ?? "",
      }));
    }
  }, [localDemoMode, sandboxReady, surveyLokasiOptions, surveyForm.lokasiKos, kamarSandboxRows, rowsForDemoMerge]);

  const handleSurveyFieldChange = (field: keyof SurveyCalonForm, value: string) => {
    if (field === "lokasiKos") {
      setSurveyForm((prev) => {
        const units = localDemoMode
          ? buildDemoUnitList(sandboxReady, value, kamarSandboxRows, rowsForDemoMerge)
          : getCloudUnitOptionsByLokasi(value);
        return {
          ...prev,
          lokasiKos: value,
          unitBlok: units.includes(prev.unitBlok) ? prev.unitBlok : units[0] ?? "",
        };
      });
      return;
    }
    if (field === "negosiasiHarga") {
      setSurveyForm((prev) => ({ ...prev, negosiasiHarga: formatRupiahInput(value) }));
      return;
    }
    setSurveyForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSurveySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSurveySubmitting(true);
    setSurveyError("");
    setSurveyInfo("");

    if (!localDemoMode) {
      const payload = {
        nama_lengkap: surveyForm.namaLengkap,
        lokasi_kos: surveyForm.lokasiKos,
        unit_blok: surveyForm.unitBlok,
        no_kamar: "-",
        periode_sewa_bulan: Math.max(1, Math.floor(Number(surveyForm.periodeSewa) || 1)),
        tgl_check_in: surveyForm.rencanaCheckIn || null,
        tgl_check_out: null,
        harga_bulanan: parseRupiahToNumber(surveyForm.negosiasiHarga),
        booking_fee: 0,
        no_wa: surveyForm.noWa,
        status: "Survey",
        keterangan: surveyForm.keterangan,
      };
      const result = surveyEditingId
        ? await supabase.from("penghuni").update(payload).eq("id", surveyEditingId)
        : await supabase.from("penghuni").insert(payload);
      if (result.error) {
        setSurveyError(result.error.message);
        toast(result.error.message, "error");
        setSurveySubmitting(false);
        return;
      }
      await loadPenghuni();
      resetSurveyForm();
      setShowSurveyForm(false);
      toast(surveyEditingId ? "Data survey berhasil diperbarui." : "Data survey berhasil disimpan.", "success");
      setSurveySubmitting(false);
      return;
    }

    const prevCreated = surveyEditingId
      ? surveyCalon.find((r) => r.id === surveyEditingId)?.createdAt
      : undefined;
    const base: SurveyCalonRow = {
      id: surveyEditingId ?? newSandboxId(),
      ...surveyForm,
      createdAt: prevCreated ?? new Date().toISOString(),
    };
    const wasEditingSurvey = !!surveyEditingId;
    const next = surveyEditingId
      ? surveyCalon.map((r) => (r.id === surveyEditingId ? { ...base, id: surveyEditingId } : r))
      : [base, ...surveyCalon];
    setSurveyCalon(next);
    writeSandboxJson(SB_KEY.surveyCalon, next);
    resetSurveyForm();
    toast(
      wasEditingSurvey ? "Data survey berhasil diperbarui." : "Data survey berhasil disimpan.",
      "success"
    );
    setShowSurveyForm(false);
    setSurveySubmitting(false);
  };

  const handleSurveyEdit = (row: SurveyCalonRow) => {
    setShowPenghuniForm(false);
    setSurveyEditingId(row.id);
    setSurveyForm({
      namaLengkap: row.namaLengkap,
      lokasiKos: row.lokasiKos,
      unitBlok: row.unitBlok,
      periodeSewa: row.periodeSewa || "12",
      rencanaCheckIn: row.rencanaCheckIn || "",
      negosiasiHarga: formatRupiahInput(row.negosiasiHarga || "") || "",
      noWa: row.noWa || "",
      keterangan: row.keterangan || "",
    });
    setShowSurveyForm(true);
    setSurveyError("");
    setSurveyInfo("Mode edit survey aktif.");
  };

  const handleSurveyDelete = async (id: string): Promise<boolean> => {
    if (!localDemoMode) {
      const { error } = await supabase.from("penghuni").delete().eq("id", id).eq("status", "Survey");
      if (error) {
        setSurveyError(error.message);
        toast(error.message, "error", "center");
        return false;
      }
      await loadPenghuni();
      return true;
    }
    const next = surveyCalon.filter((r) => r.id !== id);
    setSurveyCalon(next);
    writeSandboxJson(SB_KEY.surveyCalon, next);
    if (surveyEditingId === id) {
      resetSurveyForm();
      setShowSurveyForm(false);
    }
    return true;
  };

  const deletePenghuniWithConfirm = async (row: PenghuniRow) => {
    if (!canDeletePenghuni) {
      toast("Role Anda tidak diizinkan menghapus data penghuni.", "error");
      return;
    }
    const ok = await confirm({
      title: "Hapus data penghuni?",
      message: `Anda akan menghapus "${row.namaLengkap}" (${row.lokasiKos} · ${row.unitBlok} / ${row.noKamar}). Tindakan ini tidak dapat dibatalkan di mode cloud.`,
      confirmLabel: "Ya",
      cancelLabel: "Tidak",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info", "center");
      return;
    }
    const deleted = await handleDelete(row.id);
    if (deleted) {
      toast("Data penghuni berhasil dihapus.", "success", "center");
    }
  };

  const deleteSurveyWithConfirm = async (row: SurveyCalonRow) => {
    const ok = await confirm({
      title: "Hapus calon survey?",
      message: `Anda akan menghapus "${row.namaLengkap}" dari daftar survey.`,
      confirmLabel: "Ya",
      cancelLabel: "Tidak",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info", "center");
      return;
    }
    const deleted = await handleSurveyDelete(row.id);
    if (deleted) {
      toast("Data survey berhasil dihapus.", "success", "center");
    }
  };

  const openSettlementPanel = (row: PenghuniRow) => {
    setPenghuniProfileRow(row);
    setShowPenghuniForm(false);
    setShowSewaPaymentPanel(false);
    setShowExtendStayPanel(false);
    setShowDepositPaymentPanel(false);
  };

  const openExtendStayPanel = () => {
    const row = penghuniProfileRow;
    if (!row || row.status !== "Stay") return;
    const baseDate = getActiveSewaCycleEnd(row) || getActiveSewaCycleStart(row);
    const initialPeriode = "1";
    const nextCheckOut = addCalendarMonthsToIsoDate(baseDate, 1) || row.tglCheckOut || "";
    setExtendStayPeriodeBulan(initialPeriode);
    setExtendStayCheckOut(nextCheckOut);
    setExtendStayNominalBulanan(formatRupiahInput(row.hargaBulanan || ""));
    setShowSewaPaymentPanel(false);
    setShowDepositPaymentPanel(false);
    setShowExtendStayPanel(true);
  };

  useEffect(() => {
    if (!showExtendStayPanel || !penghuniProfileRow) return;
    const baseDate = getActiveSewaCycleEnd(penghuniProfileRow) || getActiveSewaCycleStart(penghuniProfileRow);
    const tambahBulan = Math.max(0, Math.floor(Number(extendStayPeriodeBulan) || 0));
    if (!baseDate || tambahBulan <= 0) {
      setExtendStayCheckOut("");
      return;
    }
    const nextCheckOut = addCalendarMonthsToIsoDate(baseDate, tambahBulan);
    setExtendStayCheckOut(nextCheckOut || "");
  }, [showExtendStayPanel, penghuniProfileRow, extendStayPeriodeBulan]);

  const handleSubmitExtendStay = async () => {
    const row = penghuniProfileRow;
    if (!row || row.status !== "Stay") return;
    const nextCycleStart = getActiveSewaCycleEnd(row) || getActiveSewaCycleStart(row);
    if (!nextCycleStart) {
      toast("Tanggal akhir siklus sebelumnya tidak valid untuk extend stay.", "error");
      return;
    }
    const tambahBulan = Math.max(0, Math.floor(Number(extendStayPeriodeBulan) || 0));
    if (tambahBulan <= 0) {
      toast("Periode sewa tambahan harus lebih dari 0 bulan.", "error");
      return;
    }
    if (!extendStayCheckOut) {
      toast("Tanggal check-out baru tidak valid.", "error");
      return;
    }
    const nominalBulanan = parseRupiahToNumber(extendStayNominalBulanan);
    if (nominalBulanan <= 0) {
      toast("Nominal bulanan harus lebih dari 0.", "error");
      return;
    }
    const periodeBaru = tambahBulan;
    const ok = await confirm({
      title: "Konfirmasi extend stay?",
      message: `${row.namaLengkap} akan di-extend ${tambahBulan} bulan. Check-out baru: ${extendStayCheckOut}. Payment sewa kamar akan diaktifkan kembali.`,
      confirmLabel: "Ya, extend",
      cancelLabel: "Batal",
    });
    if (!ok) return;
    setIsSubmittingExtendStay(true);
    if (localDemoMode) {
      const updated = data.map((p) =>
        p.id === row.id
          ? {
              ...p,
              periodeSewa: String(periodeBaru),
              tglCheckOut: extendStayCheckOut,
              sewaCycleStart: nextCycleStart,
              sewaCycleEnd: extendStayCheckOut,
              hargaBulanan: String(nominalBulanan),
              sewaKamarPaid: false,
              sewaKamarNota: "",
            }
          : p
      );
      setData(updated);
      persistPenghuniSandbox(updated, historyData);
      setPenghuniProfileRow((prev) =>
        prev && prev.id === row.id
          ? {
              ...prev,
              periodeSewa: String(periodeBaru),
              tglCheckOut: extendStayCheckOut,
              sewaCycleStart: nextCycleStart,
              sewaCycleEnd: extendStayCheckOut,
              hargaBulanan: String(nominalBulanan),
              sewaKamarPaid: false,
              sewaKamarNota: "",
            }
          : prev
      );
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, updated));
      setShowExtendStayPanel(false);
      setIsSubmittingExtendStay(false);
      toast("Extend stay berhasil disimpan. Payment sewa kamar aktif kembali.", "success");
      return;
    }
    const { error } = await supabase
      .from("penghuni")
      .update({
        periode_sewa_bulan: periodeBaru,
        tgl_check_out: extendStayCheckOut,
        sewa_cycle_start: nextCycleStart,
        sewa_cycle_end: extendStayCheckOut,
        harga_bulanan: nominalBulanan,
        sewa_kamar_paid: false,
        sewa_kamar_nota: null,
      })
      .eq("id", row.id);
    if (!isMountedRef.current) return;
    if (error) {
      setIsSubmittingExtendStay(false);
      toast(error.message, "error");
      return;
    }
    await loadPenghuni();
    await reconcileCloudKamarWithPenghuni();
    if (!isMountedRef.current) return;
    setPenghuniProfileRow((prev) =>
      prev && prev.id === row.id
        ? {
            ...prev,
            periodeSewa: String(periodeBaru),
            tglCheckOut: extendStayCheckOut,
            sewaCycleStart: nextCycleStart,
            sewaCycleEnd: extendStayCheckOut,
            hargaBulanan: String(nominalBulanan),
            sewaKamarPaid: false,
            sewaKamarNota: "",
          }
        : prev
    );
    setShowExtendStayPanel(false);
    setIsSubmittingExtendStay(false);
    toast("Extend stay berhasil disimpan. Payment sewa kamar aktif kembali.", "success");
  };

  const handleCheckoutPenghuni = async () => {
    const row = penghuniProfileRow;
    if (!row || row.status !== "Stay") return;
    const checkoutDate = new Date().toISOString().slice(0, 10);
    const ok = await confirm({
      title: "Konfirmasi check out?",
      message: `${row.namaLengkap} akan check out dari kamar ${row.unitBlok} / ${row.noKamar}. Kamar menjadi Available dan data penghuni dipindah ke daftar history.`,
      confirmLabel: "Ya, check out",
      cancelLabel: "Batal",
    });
    if (!ok) return;

    const historyRow: PenghuniRow = {
      ...row,
      status: "History",
      tglCheckOut: checkoutDate,
      sewaCycleEnd: checkoutDate,
    };

    if (localDemoMode) {
      const nextActive = data.filter((p) => p.id !== row.id);
      const nextHistory = [historyRow, ...historyData.filter((h) => h.id !== row.id)];
      setData(nextActive);
      setHistoryData(nextHistory);
      persistPenghuniSandbox(nextActive, nextHistory);
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, nextActive));
      setPenghuniProfileRow(null);
      setShowSewaPaymentPanel(false);
      setShowExtendStayPanel(false);
      setShowDepositPaymentPanel(false);
      toast(`${row.namaLengkap} berhasil check out. Kamar tersedia kembali.`, "success");
      return;
    }

    const { error } = await supabase
      .from("penghuni")
      .update({
        status: "History",
        tgl_check_out: checkoutDate,
        sewa_cycle_end: checkoutDate,
      })
      .eq("id", row.id);
    if (!isMountedRef.current) return;
    if (error) {
      toast(error.message, "error");
      return;
    }
    await loadPenghuni();
    await reconcileCloudKamarWithPenghuni();
    if (!isMountedRef.current) return;
    setPenghuniProfileRow(null);
    setShowSewaPaymentPanel(false);
    setShowExtendStayPanel(false);
    setShowDepositPaymentPanel(false);
    toast(`${row.namaLengkap} berhasil check out. Kamar tersedia kembali.`, "success");
  };

  const handleSendSurveyWa = (row: SurveyCalonRow) => {
    const msg = `Halo ${row.namaLengkap}, kami dari Second Room ingin menindaklanjuti jadwal survey Anda (${row.rencanaCheckIn || "-"}) untuk unit ${row.unitBlok || "-"}.`;
    const url = toWhatsAppDeepLink(row.noWa, msg);
    if (!url) {
      toast("Nomor WA calon survey tidak valid.", "error");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handlePrintRegistrationCard = (row: PenghuniRow) => {
    if (typeof window === "undefined") return;
    const checkOutDisplay = row.status === "Booking" ? "—" : row.tglCheckOut || "—";
    const params = new URLSearchParams({
      namaLengkap: row.namaLengkap || "—",
      noWa: row.noWa || "—",
      lokasiKos: row.lokasiKos || "—",
      unitBlok: row.unitBlok || "—",
      noKamar: row.noKamar || "—",
      status: row.status || "—",
      tglCheckIn: row.tglCheckIn || "—",
      tglCheckOut: checkOutDisplay,
      periodeSewa: row.periodeSewa || "—",
      hargaBulanan: formatRupiahRingkasan(row.hargaBulanan || ""),
      bookingFee: formatRupiahRingkasan(row.bookingFee || ""),
      keterangan: row.keterangan || "—",
    });
    const nextTab = window.open(`/print/registration?${params.toString()}`, "_blank", "noopener,noreferrer");
    if (!nextTab) {
      toast("Popup diblokir browser. Izinkan popup untuk membuka formulir pendaftaran.", "error");
    }
  };

  const openSewaPaymentPanel = () => {
    if (!penghuniProfileRow) return;
    const h = parseRupiahToNumber(penghuniProfileRow.hargaBulanan);
    const bulan = Math.max(0, Math.floor(Number(penghuniProfileRow.periodeSewa) || 0));
    const bookingFeeNum = parseRupiahToNumber(penghuniProfileRow.bookingFee);
    if (penghuniProfileRow.status === "Booking") {
      if (!getActiveSewaCycleStart(penghuniProfileRow)) {
        toast("Isi rencana check-in terlebih dahulu (data penghuni).", "error");
        return;
      }
      if (bulan <= 0) {
        toast("Periode sewa harus lebih dari 0 bulan.", "error");
        return;
      }
      if (bookingFeeNum > 0 && !penghuniProfileRow.bookingFeePaid) {
        toast("Lunasi booking fee terlebih dahulu, baru bayar sisa sewa kamar.", "error");
        return;
      }
    }
    const sisaSewa = remainingSewaAfterBookingFee({
      hargaBulanan: h,
      periodeBulan: bulan,
      bookingFee: bookingFeeNum,
      bookingFeePaid: penghuniProfileRow.bookingFeePaid,
    });
    setSewaPaymentNominal(formatRupiahInput(String(sisaSewa)));
    const nextNotaDigits = localDemoMode
      ? suggestNextSrNotaDigits(readSandboxJson<FinanceRow[]>(SB_KEY.finance, []))
      : suggestNextSrNotaDigitsFromLast(lastUsedSrNota);
    setSewaPaymentNotaDigits(nextNotaDigits);
    setSewaPaymentTanggal(new Date().toISOString().slice(0, 10));
    setShowDepositPaymentPanel(false);
    setShowSewaPaymentPanel(true);
  };

  const openBookingFeePaymentPanel = () => {
    if (!penghuniProfileRow) return;
    setDepositPaymentKind("booking_fee");
    setDepositPaymentNominal(formatRupiahInput(penghuniProfileRow.bookingFee || ""));
    const nextNotaDigits = localDemoMode
      ? suggestNextSrNotaDigits(readSandboxJson<FinanceRow[]>(SB_KEY.finance, []))
      : suggestNextSrNotaDigitsFromLast(lastUsedSrNota);
    setDepositPaymentNotaDigits(nextNotaDigits);
    setDepositPaymentTanggal(new Date().toISOString().slice(0, 10));
    setShowSewaPaymentPanel(false);
    setShowDepositPaymentPanel(true);
  };

  const openDepositPaymentPanel = () => {
    if (!penghuniProfileRow) return;
    setDepositPaymentKind("deposit");
    setDepositPaymentNominal(formatRupiahInput(penghuniProfileRow.depositKamar || ""));
    const nextNotaDigits = localDemoMode
      ? suggestNextSrNotaDigits(readSandboxJson<FinanceRow[]>(SB_KEY.finance, []))
      : suggestNextSrNotaDigitsFromLast(lastUsedSrNota);
    setDepositPaymentNotaDigits(nextNotaDigits);
    setDepositPaymentTanggal(new Date().toISOString().slice(0, 10));
    setShowSewaPaymentPanel(false);
    setShowDepositPaymentPanel(true);
  };

  const verifyFinanceNotaFreeForPayment = async (notaTrimmed: string): Promise<string | null> => {
    if (localDemoMode) {
      const fin = readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
      return findFinanceRowWithDuplicateNota(fin, notaTrimmed, null)
        ? financeNotaTakenMessage(notaTrimmed)
        : null;
    }
    const { data, error } = await supabase
      .from("finance")
      .select("id")
      .ilike("no_nota", escapeIlikeExact(notaTrimmed))
      .limit(1);
    if (error) return error.message;
    if (data?.length) return financeNotaTakenMessage(notaTrimmed);
    return null;
  };

  const handleSewaPaymentSekarang = async () => {
    const row = penghuniProfileRow;
    if (!row) return;
    const digits = sanitizeSrNotaDigits(sewaPaymentNotaDigits);
    const noNota = formatSrNotaFromDigits(digits);
    if (!isValidSrNotaDigits(digits)) {
      toast(
        digits.length > SR_NOTA_MAX_DIGITS
          ? srNotaDigitsInvalidMessage()
          : "Isi nomor nota setelah SR (hanya angka).",
        "error"
      );
      return;
    }
    const notaTakenErr = await verifyFinanceNotaFreeForPayment(noNota);
    if (notaTakenErr) {
      toast(notaTakenErr, "error");
      return;
    }
    const nominalNum = parseRupiahToNumber(sewaPaymentNominal);
    if (!sewaPaymentNominal.trim() || nominalNum <= 0) {
      toast("Isi nominal Rupiah yang valid.", "error");
      return;
    }
    const der = sewaPaymentDerived;
    if (!der) return;
    const { referensiProfil, selisih } = der;
    if (nominalNum < referensiProfil) {
      toast(
        `Nominal input (${formatRpNumber(nominalNum)}) tidak boleh lebih kecil dari referensi profil (${formatRpNumber(referensiProfil)}).`,
        "error"
      );
      return;
    }
    const bulan = Math.max(0, Math.floor(Number(row.periodeSewa) || 0));
    if (bulan <= 0) {
      toast("Periode sewa (bulan) harus lebih dari 0.", "error");
      return;
    }
    const bookingFeeNum = parseRupiahToNumber(row.bookingFee);
    if (row.status === "Booking" && bookingFeeNum > 0 && !row.bookingFeePaid) {
      toast("Lunasi booking fee terlebih dahulu, baru bayar sisa sewa kamar.", "error");
      return;
    }
    const activeCycleStart = getActiveSewaCycleStart(row);
    if (!activeCycleStart) {
      toast("Tanggal mulai siklus sewa tidak valid.", "error");
      return;
    }

    const willPromote = canPromoteBookingToStay({
      sewaKamarPaid: true,
      depositKamar: parseRupiahToNumber(row.depositKamar),
      depositKamarPaid: row.depositKamarPaid,
    });
    let tglCheckOutBaru = "";
    if (row.status === "Booking" && willPromote) {
      tglCheckOutBaru = addCalendarMonthsToIsoDate(activeCycleStart, bulan);
      if (!tglCheckOutBaru) {
        toast("Tanggal check-out tidak bisa dihitung dari rencana check-in.", "error");
        return;
      }
    }

    const paymentDate = String(sewaPaymentTanggal ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      toast("Isi tanggal payment yang valid.", "error");
      return;
    }
    const monthStarts = buildSewaSplitCalendarMonthStarts(activeCycleStart, bulan, paymentDate);
    if (monthStarts.length !== bulan) {
      toast("Tidak dapat membuat alokasi bulan P&L. Periksa tanggal check-in penghuni.", "error");
      return;
    }
    const nominalParts = splitNominalRupiahEqualParts(nominalNum, bulan);

    const hitungText = `Perhitungan: ${formatRpNumber(nominalNum)} − ${formatRpNumber(referensiProfil)} = ${formatRpNumber(selisih)}.`;
    const statusNote =
      row.status === "Booking" && willPromote
        ? ` Status penghuni berubah menjadi Stay; tgl check-out otomatis ${tglCheckOutBaru} (rencana check-in + ${bulan} bulan).`
        : row.status === "Booking"
          ? " Status sewa kamar ditandai lunas. Status tetap Booking sampai deposit juga lunas (atau deposit = 0)."
          : " Status sewa kamar ditandai lunas.";
    const ok = await confirm({
      title: "Konfirmasi payment sewa kamar?",
      message: `${hitungText} Catat pembayaran (nota ${noNota}) untuk ${row.namaLengkap}? Di Finance akan dibuat ${bulan} transaksi pemasukan (nota sama), nominal per bulan mengikuti pembagian rata, bulan laporan mengikuti kalender mulai bulan check-in.${statusNote}`,
      confirmLabel: "Ya, konfirmasi",
      cancelLabel: "Batal",
    });
    if (!ok) {
      toast("Konfirmasi dibatalkan.", "info");
      return;
    }

    const stayPatch =
      row.status === "Booking" && willPromote
        ? {
            status: "Stay" as PenghuniStatus,
            tglCheckOut: tglCheckOutBaru,
            sewaCycleStart: activeCycleStart,
            sewaCycleEnd: tglCheckOutBaru,
          }
        : { sewaCycleStart: activeCycleStart };

    if (localDemoMode) {
      const paymentSplitGroupId =
        typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newSandboxId();
      const updatedPen = data.map((p) =>
        p.id === row.id
          ? {
              ...p,
              sewaKamarPaid: true,
              sewaKamarNota: noNota,
              ...stayPatch,
            }
          : p
      );
      setData(updatedPen);
      persistPenghuniSandbox(updatedPen, historyData);
      setPenghuniProfileRow({
        ...row,
        sewaKamarPaid: true,
        sewaKamarNota: noNota,
        ...stayPatch,
      });
      const fin = readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
      const newFinRows: FinanceRow[] = monthStarts.map((pel, idx) => {
        const niceMonth = new Date(`${pel}T12:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
        const partLabel = `${idx + 1}/${bulan}`;
        const keteranganFin = `Payment sewa kamar · ${row.unitBlok} / ${row.noKamar} · ${hitungText} · Bulan laporan: ${niceMonth} (${partLabel}) · Dibayar: ${paymentDate}`;
        return {
          id: newSandboxId(),
          noNota,
          kategori: "Pemasukan" as const,
          pos: FINANCE_POS_SEWA_KAMAR,
          tanggal: paymentDate,
          namaPenghuni: row.namaLengkap,
          lokasiKos: row.lokasiKos,
          unitBlok: row.unitBlok,
          nominal: String(nominalParts[idx] ?? 0),
          keterangan: keteranganFin,
          pelaporanBulan: pel,
          paymentSplitGroupId: paymentSplitGroupId,
        };
      });
      writeSandboxJson(SB_KEY.finance, [...newFinRows, ...fin]);
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, updatedPen));
    } else {
      const inserts = monthStarts.map((pel, idx) => {
        const niceMonth = new Date(`${pel}T12:00:00`).toLocaleDateString("id-ID", { month: "long", year: "numeric" });
        const partLabel = `${idx + 1}/${bulan}`;
        const keteranganFin = `Payment sewa kamar · ${row.unitBlok} / ${row.noKamar} · ${hitungText} · Bulan laporan: ${niceMonth} (${partLabel}) · Dibayar: ${paymentDate}`;
        return {
          no_nota: noNota,
          kategori: "Pemasukan" as const,
          pos: FINANCE_POS_SEWA_KAMAR,
          tanggal: paymentDate,
          nama_penghuni: row.namaLengkap,
          nominal: nominalParts[idx] ?? 0,
          keterangan: keteranganFin,
          lokasi_kos: row.lokasiKos,
          unit_blok: row.unitBlok,
          pelaporan_bulan: pel,
        };
      });
      const { error: finErr } = await supabase.from("finance").insert(inserts);
      if (finErr) {
        toast(finErr.message, "error");
        return;
      }
      const penUpdate: Record<string, unknown> = {
        sewa_kamar_paid: true,
        sewa_kamar_nota: noNota,
        sewa_cycle_start: activeCycleStart,
      };
      if (row.status === "Booking" && willPromote) {
        penUpdate.status = "Stay";
        penUpdate.tgl_check_out = tglCheckOutBaru;
        penUpdate.sewa_cycle_end = tglCheckOutBaru;
      } else {
        penUpdate.sewa_cycle_end = row.tglCheckOut || null;
      }
      const { error: penErr } = await supabase.from("penghuni").update(penUpdate).eq("id", row.id);
      if (penErr) {
        toast(penErr.message, "error");
        return;
      }
      await loadPenghuni();
      setPenghuniProfileRow((prev) =>
        prev && prev.id === row.id
          ? {
              ...prev,
              sewaKamarPaid: true,
              sewaKamarNota: noNota,
              ...stayPatch,
            }
          : prev
      );
    }

    setShowSewaPaymentPanel(false);
    toast(`${hitungText} Payment sewa kamar berhasil dicatat (${bulan} baris di Finance, nota ${noNota}).`, "success");
  };

  const handleDepositPaymentSekarang = async () => {
    const row = penghuniProfileRow;
    if (!row) return;
    const isBookingFee = depositPaymentKind === "booking_fee";
    const digits = sanitizeSrNotaDigits(depositPaymentNotaDigits);
    const noNota = formatSrNotaFromDigits(digits);
    if (!isValidSrNotaDigits(digits)) {
      toast(
        digits.length > SR_NOTA_MAX_DIGITS
          ? srNotaDigitsInvalidMessage()
          : "Isi nomor nota setelah SR (hanya angka).",
        "error"
      );
      return;
    }
    const notaTakenErr = await verifyFinanceNotaFreeForPayment(noNota);
    if (notaTakenErr) {
      toast(notaTakenErr, "error");
      return;
    }
    const nominalNum = parseRupiahToNumber(depositPaymentNominal);
    if (!depositPaymentNominal.trim() || nominalNum <= 0) {
      toast("Isi nominal Rupiah yang valid.", "error");
      return;
    }
    const der = depositPaymentDerived;
    if (!der) return;
    const { referensiProfil, selisih } = der;
    if (nominalNum < referensiProfil) {
      toast(
        `Nominal input (${formatRpNumber(nominalNum)}) tidak boleh lebih kecil dari referensi profil (${formatRpNumber(referensiProfil)}).`,
        "error"
      );
      return;
    }
    const paymentDate = String(depositPaymentTanggal ?? "").trim().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) {
      toast("Isi tanggal payment yang valid.", "error");
      return;
    }

    const willPromote =
      !isBookingFee &&
      row.status === "Booking" &&
      canPromoteBookingToStay({
        sewaKamarPaid: row.sewaKamarPaid,
        depositKamar: parseRupiahToNumber(row.depositKamar),
        depositKamarPaid: true,
      });
    const bulan = Math.max(0, Math.floor(Number(row.periodeSewa) || 0));
    const activeCycleStart = getActiveSewaCycleStart(row);
    let tglCheckOutBaru = "";
    if (willPromote) {
      if (!activeCycleStart || bulan <= 0) {
        toast("Rencana check-in dan periode sewa harus valid untuk mengubah status jadi Stay.", "error");
        return;
      }
      tglCheckOutBaru = addCalendarMonthsToIsoDate(activeCycleStart, bulan);
      if (!tglCheckOutBaru) {
        toast("Tanggal check-out tidak bisa dihitung dari rencana check-in.", "error");
        return;
      }
    }

    const hitungText = `Perhitungan: ${formatRpNumber(nominalNum)} − ${formatRpNumber(referensiProfil)} = ${formatRpNumber(selisih)}.`;
    const stayNote = willPromote
      ? ` Status penghuni berubah menjadi Stay; tgl check-out otomatis ${tglCheckOutBaru}.`
      : isBookingFee
        ? " Status penghuni tetap Booking."
        : "";
    const ok = await confirm({
      title: isBookingFee ? "Konfirmasi payment booking fee?" : "Konfirmasi payment deposit kamar?",
      message: `${hitungText} Catat pembayaran ${isBookingFee ? "booking fee" : "deposit"} (nota ${noNota}) untuk ${row.namaLengkap}? Tanggal payment: ${paymentDate}. Nominal di Finance mengikuti nilai input panel (${formatRpNumber(nominalNum)}). Status ${isBookingFee ? "booking fee" : "deposit"} ditandai lunas.${stayNote}`,
      confirmLabel: "Ya, konfirmasi",
      cancelLabel: "Batal",
    });
    if (!ok) {
      toast("Konfirmasi dibatalkan.", "info");
      return;
    }

    const tanggal = paymentDate;
    const keteranganFin = `Payment ${isBookingFee ? "booking fee" : "deposit kamar"} · ${row.unitBlok} / ${row.noKamar} · ${hitungText} · Dibayar: ${paymentDate}`;
    const financePos = isBookingFee ? FINANCE_POS_BOOKING_FEE : FINANCE_POS_DEPOSIT_KAMAR;
    const stayPatch = willPromote
      ? {
          status: "Stay" as PenghuniStatus,
          tglCheckOut: tglCheckOutBaru,
          sewaCycleStart: activeCycleStart!,
          sewaCycleEnd: tglCheckOutBaru,
        }
      : {};

    if (localDemoMode) {
      const updatedPen = data.map((p) =>
        p.id === row.id
          ? {
              ...p,
              ...(isBookingFee
                ? { bookingFeePaid: true, bookingFeeNota: noNota }
                : { depositKamarPaid: true, depositKamarNota: noNota }),
              ...stayPatch,
            }
          : p
      );
      setData(updatedPen);
      persistPenghuniSandbox(updatedPen, historyData);
      setPenghuniProfileRow({
        ...row,
        ...(isBookingFee
          ? { bookingFeePaid: true, bookingFeeNota: noNota }
          : { depositKamarPaid: true, depositKamarNota: noNota }),
        ...stayPatch,
      });
      const fin = readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
      const finRow: FinanceRow = {
        id: newSandboxId(),
        noNota,
        kategori: "Pemasukan",
        pos: financePos,
        tanggal,
        namaPenghuni: row.namaLengkap,
        lokasiKos: row.lokasiKos,
        unitBlok: row.unitBlok,
        nominal: String(nominalNum),
        keterangan: keteranganFin,
      };
      writeSandboxJson(SB_KEY.finance, [finRow, ...fin]);
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, updatedPen));
    } else {
      const { error: finErr } = await supabase.from("finance").insert({
        no_nota: noNota,
        kategori: "Pemasukan",
        pos: financePos,
        tanggal,
        nama_penghuni: row.namaLengkap,
        nominal: nominalNum,
        keterangan: keteranganFin,
        lokasi_kos: row.lokasiKos,
        unit_blok: row.unitBlok,
      });
      if (finErr) {
        toast(finErr.message, "error");
        return;
      }
      const penUpdate: Record<string, unknown> = isBookingFee
        ? { booking_fee_paid: true, booking_fee_nota: noNota }
        : { deposit_kamar_paid: true, deposit_kamar_nota: noNota };
      if (willPromote) {
        penUpdate.status = "Stay";
        penUpdate.tgl_check_out = tglCheckOutBaru;
        penUpdate.sewa_cycle_start = activeCycleStart;
        penUpdate.sewa_cycle_end = tglCheckOutBaru;
      }
      const { error: penErr } = await supabase.from("penghuni").update(penUpdate).eq("id", row.id);
      if (penErr) {
        toast(penErr.message, "error");
        return;
      }
      await loadPenghuni();
      setPenghuniProfileRow((prev) =>
        prev && prev.id === row.id
          ? {
              ...prev,
              ...(isBookingFee
                ? { bookingFeePaid: true, bookingFeeNota: noNota }
                : { depositKamarPaid: true, depositKamarNota: noNota }),
              ...stayPatch,
            }
          : prev
      );
    }

    setShowDepositPaymentPanel(false);
    toast(
      `${hitungText} Payment ${isBookingFee ? "booking fee" : "deposit kamar"} berhasil dicatat.`,
      "success"
    );
  };

  const closePenghuniModal = () => {
    resetForm();
    setShowPenghuniForm(false);
    setStatusMenuOpen(false);
    setPenghuniProfileRow(null);
    setShowSewaPaymentPanel(false);
    setShowExtendStayPanel(false);
    setShowDepositPaymentPanel(false);
  };

  const closeSurveyModal = () => {
    resetSurveyForm();
    setShowSurveyForm(false);
  };

  const togglePenghuniBaru = () => {
    if (showPenghuniForm) {
      closePenghuniModal();
      return;
    }
    setShowSurveyForm(false);
    setPenghuniProfileRow(null);
    setShowSewaPaymentPanel(false);
    setShowExtendStayPanel(false);
    setShowDepositPaymentPanel(false);
    resetForm();
    setShowPenghuniForm(true);
  };

  const toggleSurveyBaru = () => {
    if (showSurveyForm) {
      closeSurveyModal();
      return;
    }
    setShowPenghuniForm(false);
    setPenghuniProfileRow(null);
    setShowSewaPaymentPanel(false);
    setShowExtendStayPanel(false);
    setShowDepositPaymentPanel(false);
    resetSurveyForm();
    setShowSurveyForm(true);
  };

  return (
    <section className="space-y-6">
      <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-6 xl:grid-cols-2">
        <article className={`rounded-[2rem] border bg-white/85 p-6 dark:bg-[#1f1710]/95 ${formAccent}`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[#9d7e55] dark:text-[#cfb089]">
                <BedDouble size={14} className={iconTone.brand} /> Penghuni
              </p>
              <SectionTitleWithIcon
                icon={Users}
                title="Booking & Stay"
                iconClassName={iconTone.info}
                className="mt-2 text-xl text-[#2c2218] dark:text-[#f5e8d4]"
              />
              <p className="mt-1 text-xs text-[#7f6344] dark:text-[#b79a78]">
                Daftar diurutkan berdasarkan tanggal check-out. Form penghuni dibuka lewat popup.{" "}
                <span className="font-medium text-[#6b5238] dark:text-[#d4bc94]">Double klik baris</span> untuk profil
                penghuni kamar.
              </p>
              {unpaidPenghuniPaymentCount > 0 ? (
                <div
                  className="mt-3 flex gap-2 rounded-2xl border border-amber-300/90 bg-amber-50 px-3 py-2.5 text-xs text-amber-950 dark:border-amber-700/70 dark:bg-amber-950/40 dark:text-amber-50"
                  role="status"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
                  <p>
                    <span className="font-semibold">Pembayaran belum lengkap:</span> ada{" "}
                    <span className="font-bold">{unpaidPenghuniPaymentCount}</span> penghuni dengan sewa dan/atau deposit
                    yang belum ditandai lunas lewat tombol payment di profil.
                  </p>
                </div>
              ) : null}
              {overduePenghuniCount > 0 ? (
                <div
                  className="mt-3 flex gap-2 rounded-2xl border border-red-300/90 bg-red-50 px-3 py-2.5 text-xs text-red-900 dark:border-red-700/70 dark:bg-red-950/40 dark:text-red-100"
                  role="status"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700 dark:text-red-300" aria-hidden />
                  <p>
                    <span className="font-semibold">Telat bayar sewa:</span> ada{" "}
                    <span className="font-bold">{overduePenghuniCount}</span> penghuni melewati tanggal check-out.
                    Gunakan tombol <span className="font-semibold">Extend stay</span> di profil untuk perpanjangan.
                  </p>
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={togglePenghuniBaru}
                className={`btn-tactile btn-tactile-soft inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] shadow-sm transition-colors ${
                  showPenghuniForm
                    ? "border-[#4a3624] bg-[#5c4330] text-[#fff8eb] ring-2 ring-[#c09c70]/50 dark:border-[#c9a574] dark:bg-[#3d2d1f] dark:text-[#f0dcc4]"
                    : "border-[#a67c48] bg-[#c49a6a] text-white hover:border-[#3d2a18] hover:bg-[#3d2918] hover:text-[#fff8eb] dark:border-[#7a5c3a] dark:bg-[#5c452d] dark:text-[#f5e8d4] dark:hover:border-[#2a1810] dark:hover:bg-[#1f140e]"
                }`}
              >
                <UserPlus size={14} aria-hidden />
                Penghuni Baru
              </button>
              <RefreshToolbarButton onRefresh={handleRefreshPenghuni} disabled={isLoading} />
            </div>
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:items-end">
            <div className="flex min-w-0 flex-col">
              <label className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                <MapPin size={12} aria-hidden className="opacity-70" />
                Filter Lokasi
              </label>
              <select
                value={selectedLokasiFilter}
                onChange={(event) => {
                  setSelectedLokasiFilter(event.target.value);
                  setSelectedUnitFilter("Semua Blok/Unit");
                }}
                className="w-full min-h-[2.625rem] rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
              >
                <option>Semua Lokasi</option>
                {lokasiFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col">
              <label className="mb-1 flex items-center gap-1.5 text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                <Building2 size={12} aria-hidden className="opacity-70" />
                Filter Blok/Unit
              </label>
              <select
                value={selectedUnitFilter}
                onChange={(event) => setSelectedUnitFilter(event.target.value)}
                className="w-full min-h-[2.625rem] rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
              >
                <option>Semua Blok/Unit</option>
                {unitFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex min-w-0 flex-col sm:col-span-2 md:col-span-1">
              <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                Cari (nama / tgl check-in)
              </label>
              <div className="relative w-full">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[#8b6d48]/55 dark:text-[#b79a78]/70"
                  aria-hidden
                />
                <input
                  type="search"
                  value={penghuniListSearch}
                  onChange={(e) => setPenghuniListSearch(e.target.value)}
                  placeholder="Ketik nama atau tanggal…"
                  className="w-full min-h-[2.625rem] rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
                  autoComplete="off"
                />
              </div>
            </div>
          </div>

          <div
            className="mb-3 flex flex-wrap gap-2"
            role="tablist"
            aria-label="Filter status penghuni"
          >
            {PENGHUNI_STATUS_FILTER_OPTIONS.map((opt) => {
              const active = penghuniStatusFilter === opt.value;
              const count = penghuniStatusFilterCounts[opt.value];
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPenghuniStatusFilter(opt.value)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "border-[#5c4330] bg-[#5c4330] text-[#fff8eb] shadow-sm dark:border-[#c9a574] dark:bg-[#3d2d1f] dark:text-[#f0dcc4]"
                      : "border-[#dcc7aa] bg-[#fffdf9] text-[#6d5232] hover:border-[#b8956a] hover:bg-[#f6efe4] dark:border-[#4d3925] dark:bg-[#2b2016] dark:text-[#d9bb94] dark:hover:bg-[#33261b]"
                  }`}
                >
                  <Icon size={13} aria-hidden />
                  <span>{opt.label}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                      active
                        ? "bg-white/20 text-[#fff8eb]"
                        : "bg-[#efe2d1] text-[#6d5232] dark:bg-[#3d2f22] dark:text-[#d9bb94]"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mb-4 max-h-[min(320px,45vh)] isolate overflow-y-auto rounded-2xl border border-[#eadcc9] dark:border-[#3d2f22]">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-30 text-xs uppercase tracking-[0.12em] text-[#8f724d] dark:text-[#c8a97f]">
                <tr>
                  <th className="bg-[#f8efe2] px-3 py-2.5 dark:bg-[#2b2016]">Nama</th>
                  <th className="bg-[#f8efe2] px-3 py-2.5 dark:bg-[#2b2016]">Lokasi</th>
                  <th className="bg-[#f8efe2] px-3 py-2.5 dark:bg-[#2b2016]">Unit / Kamar</th>
                  <th className="bg-[#f8efe2] px-3 py-2.5 dark:bg-[#2b2016]">Status</th>
                  <th className="bg-[#f8efe2] px-3 py-2.5 dark:bg-[#2b2016]">Check-in</th>
                  <th className="bg-[#f8efe2] px-3 py-2.5 dark:bg-[#2b2016]">Check-out</th>
                  <th className="min-w-[10.5rem] whitespace-nowrap bg-[#f8efe2] px-3 py-2.5 dark:bg-[#2b2016]">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="relative z-0">
                {isLoading ? (
                  <tr>
                    <td className="px-3 py-6" colSpan={7}>
                      <div className="flex justify-center py-2">
                        <BrandLoader size="sm" label="Memuat…" />
                      </div>
                    </td>
                  </tr>
                ) : displayedPenghuniRows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-[#856948]" colSpan={7}>
                      {penghuniStatusFilter === "History"
                        ? "Belum ada penghuni di history untuk filter ini."
                        : penghuniStatusFilter === "Booking"
                          ? "Belum ada penghuni Booking untuk filter ini."
                          : penghuniStatusFilter === "Stay"
                            ? "Belum ada penghuni Stay untuk filter ini."
                            : "Belum ada penghuni (Booking/Stay) untuk filter ini."}
                    </td>
                  </tr>
                ) : (
                  displayedPenghuniRows.map((row) => {
                    const isHistoryRow = row.status === "History";
                    const isPublicBooking = row.bookingSource === "public_form";
                    const rowTone = isHistoryRow
                      ? "text-zinc-700 dark:text-zinc-200"
                      : isPenghuniSewaOverdue(row)
                      ? "border-l-[5px] border-l-red-900 bg-red-300/95 text-[#450a0a] dark:border-l-red-400 dark:bg-red-900/70 dark:text-red-50"
                      : penghuniHasOutstandingPayments(row)
                        ? "border-l-[3px] border-l-amber-500 bg-amber-50/90 text-[#78350f] dark:border-l-amber-400 dark:bg-amber-950/35 dark:text-amber-50"
                        : isPublicBooking
                          ? "border-l-[4px] border-l-sky-500 bg-sky-100 text-[#0c4a6e] dark:border-l-sky-400 dark:bg-sky-950/45 dark:text-sky-50"
                          : "text-[#2c2218] dark:text-[#f5e8d4]";
                    return (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-[#efe2d1] dark:border-[#33261b] ${rowTone}`}
                      onDoubleClick={(e) => {
                        if ((e.target as HTMLElement).closest("button")) return;
                        setHoverKeterangan(null);
                        setPenghuniProfileRow(row);
                      }}
                      onMouseEnter={(e) =>
                        setHoverKeterangan({
                          id: row.id,
                          text: row.keterangan?.trim() || "Tidak ada keterangan.",
                          x: e.clientX,
                          y: e.clientY,
                        })
                      }
                      onMouseMove={(e) =>
                        setHoverKeterangan((prev) =>
                          prev?.id === row.id ? { ...prev, x: e.clientX, y: e.clientY } : prev
                        )
                      }
                      onMouseLeave={() =>
                        setHoverKeterangan((prev) => (prev?.id === row.id ? null : prev))
                      }
                    >
                      <td className="px-3 py-2 font-medium">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {row.namaLengkap}
                          {isPublicBooking ? (
                            <span className="rounded-md bg-sky-600/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800 dark:bg-sky-400/20 dark:text-sky-100">
                              Publik
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-3 py-2">{row.lokasiKos}</td>
                      <td className="px-3 py-2">
                        {row.unitBlok} / {row.noKamar}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2">{row.tglCheckIn || "—"}</td>
                      <td className="px-3 py-2">{row.tglCheckOut || "—"}</td>
                      <td className="px-3 py-2 align-middle">
                        {isHistoryRow ? (
                          <span className="text-[10px] text-[#8b6d48] dark:text-[#b79a78]">Double klik profil</span>
                        ) : (
                          <div className="relative z-0 flex flex-wrap gap-1">
                            {canEditPenghuni ? (
                              <ActionButtonWithIcon
                                icon={Pencil}
                                onClick={() => handleEdit(row)}
                                label="Edit"
                                className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white"
                              />
                            ) : null}
                            {canDeletePenghuni ? (
                              <ActionButtonWithIcon
                                icon={Trash2}
                                onClick={() => void deletePenghuniWithConfirm(row)}
                                label="Hapus"
                                className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold text-white"
                              />
                            ) : (
                              <ActionButtonWithIcon
                                icon={CreditCard}
                                onClick={() => openSettlementPanel(row)}
                                disabled={!penghuniHasOutstandingPayments(row)}
                                label="Settlement"
                                className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {(infoMessage || errorMessage) && (
            <p
              className={`mb-3 rounded-xl px-3 py-2 text-sm ${
                errorMessage
                  ? "border border-red-200 bg-red-50 text-red-600"
                  : "border border-emerald-200 bg-emerald-50 text-emerald-700"
              }`}
            >
              {errorMessage || infoMessage}
            </p>
          )}

          {penghuniStatusFilter !== "History" ? (
          <div className="mt-6 border-t border-[#e5d8c4] pt-5 dark:border-[#3d2f22]">
            <p className="text-xs uppercase tracking-[0.22em] text-[#8b6d48] dark:text-[#b79a78]">History penghuni</p>
            <p className="mt-1 text-xs text-[#7f6344] dark:text-[#b79a78]">
              Penghuni yang sudah check out. Double klik baris untuk melihat profil arsip. Atau buka tab{" "}
              <button
                type="button"
                onClick={() => setPenghuniStatusFilter("History")}
                className="font-semibold text-[#5c4330] underline-offset-2 hover:underline dark:text-[#d9bb94]"
              >
                History
              </button>
              .
            </p>
            <div className="mt-3 max-h-[min(280px,35vh)] overflow-y-auto rounded-2xl border border-zinc-200 dark:border-zinc-700">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-zinc-100 text-xs uppercase tracking-[0.12em] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <tr>
                    <th className="px-3 py-2">Nama</th>
                    <th className="px-3 py-2">Lokasi</th>
                    <th className="px-3 py-2">Unit / Kamar</th>
                    <th className="px-3 py-2">Check-out</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {sortedHistoryByCheckOut.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-6 text-center text-xs text-zinc-500 dark:text-zinc-400">
                        Belum ada penghuni di history.
                      </td>
                    </tr>
                  ) : (
                    sortedHistoryByCheckOut.map((row) => (
                      <tr
                        key={row.id}
                        className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                        onDoubleClick={() => setPenghuniProfileRow(row)}
                      >
                        <td className="px-3 py-2">{row.namaLengkap}</td>
                        <td className="px-3 py-2">{row.lokasiKos}</td>
                        <td className="px-3 py-2">
                          {row.unitBlok} / {row.noKamar}
                        </td>
                        <td className="px-3 py-2">{row.tglCheckOut || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
          ) : null}
      </article>

      <article className="rounded-[2rem] border border-violet-200/80 bg-gradient-to-b from-[#f3f1ff]/95 to-white/95 p-6 shadow-[0_20px_50px_-35px_rgba(63,79,157,0.35)] dark:border-[#424a80] dark:from-[#1f2344] dark:to-[#1b1f3d]/95">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[#a67c35] dark:text-[#e6c48f]">
              <ClipboardList size={14} className={iconTone.warning} /> Survey
            </p>
            <SectionTitleWithIcon
              icon={ClipboardList}
              title="Calon Penghuni (Survey)"
              iconClassName={iconTone.warning}
              className="mt-2 text-xl text-[#2c2218] dark:text-[#f5e8d4]"
            />
            <p className="mt-1 text-xs text-[#7f6344] dark:text-[#b79a78]">
              Urut berdasarkan rencana check-in.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleSurveyBaru}
              className={`btn-tactile inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] shadow-sm transition-colors ${
                showSurveyForm
                  ? "border-amber-800 bg-amber-900 text-amber-50 ring-2 ring-amber-500/40 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
                  : "border-amber-600 bg-amber-500 text-amber-950 hover:border-amber-900 hover:bg-amber-800 hover:text-amber-50 dark:border-amber-500 dark:bg-amber-600 dark:text-amber-950 dark:hover:border-amber-300 dark:hover:bg-amber-800 dark:hover:text-amber-50"
              }`}
            >
              <ClipboardPlus size={14} aria-hidden />
              Survey Baru
            </button>
            <RefreshToolbarButton onRefresh={handleRefreshPenghuni} disabled={isLoading} />
          </div>
        </div>

        <div className="mb-4 max-h-[min(320px,45vh)] isolate overflow-y-auto rounded-2xl border border-amber-100 dark:border-[#4a3a22]">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 z-30 text-xs uppercase tracking-[0.12em] text-[#8f6a2d] dark:text-[#dcb97a]">
              <tr>
                <th className="bg-amber-50 px-2 py-2.5 dark:bg-[#2f2618]">Nama</th>
                <th className="bg-amber-50 px-2 py-2.5 dark:bg-[#2f2618]">Lokasi</th>
                <th className="bg-amber-50 px-2 py-2.5 dark:bg-[#2f2618]">Unit</th>
                <th className="bg-amber-50 px-2 py-2.5 dark:bg-[#2f2618]">Rencana CI</th>
                <th className="bg-amber-50 px-2 py-2.5 dark:bg-[#2f2618]">Negosiasi</th>
                <th className="bg-amber-50 px-2 py-2.5 dark:bg-[#2f2618]">WA</th>
                <th className="min-w-[9rem] whitespace-nowrap bg-amber-50 px-2 py-2.5 dark:bg-[#2f2618]">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="relative z-0">
              {sortedSurveyRows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-[#856948]" colSpan={7}>
                    Belum ada calon survey untuk filter ini.
                  </td>
                </tr>
              ) : (
                sortedSurveyRows.map((row) => (
                  <tr
                    key={row.id}
                    className="cursor-help border-t border-amber-100/90 dark:border-[#3d2f22]"
                    onMouseEnter={(e) =>
                      setHoverKeterangan({
                        id: `survey-${row.id}`,
                        text: row.keterangan?.trim() || "Tidak ada keterangan.",
                        x: e.clientX,
                        y: e.clientY,
                      })
                    }
                    onMouseMove={(e) =>
                      setHoverKeterangan((prev) =>
                        prev?.id === `survey-${row.id}` ? { ...prev, x: e.clientX, y: e.clientY } : prev
                      )
                    }
                    onMouseLeave={() =>
                      setHoverKeterangan((prev) => (prev?.id === `survey-${row.id}` ? null : prev))
                    }
                  >
                    <td className="px-2 py-2">{row.namaLengkap}</td>
                    <td className="px-2 py-2">{row.lokasiKos}</td>
                    <td className="px-2 py-2">{row.unitBlok}</td>
                    <td className="px-2 py-2">{row.rencanaCheckIn || "—"}</td>
                    <td className="px-2 py-2">
                      {row.negosiasiHarga ? `Rp ${row.negosiasiHarga}` : "—"}
                    </td>
                    <td className="px-2 py-2">{row.noWa || "—"}</td>
                    <td className="px-2 py-2">
                      <div className="flex flex-wrap gap-1">
                        {canManageSurvey ? (
                          <>
                            <ActionButtonWithIcon
                              icon={Pencil}
                              onClick={() => handleSurveyEdit(row)}
                              label="Edit"
                              className="rounded-full bg-blue-600 px-2 py-1 text-[10px] font-semibold text-white"
                            />
                            <ActionButtonWithIcon
                              icon={Trash2}
                              onClick={() => void deleteSurveyWithConfirm(row)}
                              label="Hapus"
                              className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold text-white"
                            />
                          </>
                        ) : (
                          <ActionButtonWithIcon
                            icon={MessageCircle}
                            onClick={() => handleSendSurveyWa(row)}
                            label="Kirim WA"
                            className="rounded-full bg-green-600 px-2 py-1 text-[10px] font-semibold text-white"
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {(surveyInfo || surveyError) && (
          <p
            className={`mb-3 rounded-xl px-3 py-2 text-sm ${
              surveyError
                ? "border border-red-200 bg-red-50 text-red-600"
                : "border border-amber-200 bg-amber-50 text-amber-950 dark:text-amber-100"
            }`}
          >
            {surveyError || surveyInfo}
          </p>
        )}
      </article>
    </div>

    {penghuniProfileRow && profilePanelDerived ? (
      <div
        className="fixed inset-0 z-[160] flex items-center justify-center p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="penghuni-profile-title"
      >
        <button
          type="button"
          aria-label="Tutup profil"
          className="btn-flat absolute inset-0 bg-black/55 transition hover:bg-black/65"
          onClick={() => {
            setShowSewaPaymentPanel(false);
            setShowExtendStayPanel(false);
            setShowDepositPaymentPanel(false);
            setPenghuniProfileRow(null);
          }}
        />
        <div
          className="relative z-[170] grid max-h-[min(90vh,640px)] w-full max-w-4xl overflow-hidden rounded-[1.75rem] border border-[#d6ddff] bg-[#f7f8ff] shadow-2xl dark:border-[#424a80] dark:bg-[#1b1f3d] md:grid-cols-2"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col border-b border-[#eadcc9] p-6 dark:border-[#3d2f22] md:border-b-0 md:border-r">
            <p id="penghuni-profile-title" className="text-xs uppercase tracking-[0.22em] text-[#9d7e55] dark:text-[#cfb089]">
              Profil penghuni kamar
            </p>
            <h2 className="mt-2 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">Data penghuni</h2>
            <dl className="mt-6 space-y-4 text-sm">
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Status</dt>
                <dd className="mt-1">
                  <StatusBadge status={penghuniProfileRow.status} />
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Nama lengkap</dt>
                <dd className="mt-1 font-medium text-[#2c2218] dark:text-[#f5e8d4]">{penghuniProfileRow.namaLengkap}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">No. WA</dt>
                <dd className="mt-1 text-[#3f2f1f] dark:text-[#e8dcc8]">{penghuniProfileRow.noWa || "—"}</dd>
              </div>
              {penghuniProfileRow.email ? (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Email</dt>
                  <dd className="mt-1 break-all text-[#3f2f1f] dark:text-[#e8dcc8]">{penghuniProfileRow.email}</dd>
                </div>
              ) : null}
              {penghuniProfileRow.bookingSource === "public_form" ||
              penghuniProfileRow.fotoIdentitasPath ||
              penghuniProfileRow.buktiTransferPath ? (
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                    Dokumen booking
                  </dt>
                  <dd className="mt-2 space-y-3">
                    {penghuniProfileRow.bookingSource === "public_form" ? (
                      <p className="text-xs font-medium text-[#5d6fc0] dark:text-[#a8b6ff]">
                        Dari form publik /bookingkos
                      </p>
                    ) : null}
                    {profileDocsLoading ? (
                      <p className="text-xs text-[#8b6d48] dark:text-[#b79a78]">Memuat foto…</p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b6d48] dark:text-[#b79a78]">
                            Identitas
                          </p>
                          {profileFotoIdentitasUrl ? (
                            <a
                              href={profileFotoIdentitasUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden rounded-xl border border-[#d6ddff] dark:border-[#424a80]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={profileFotoIdentitasUrl}
                                alt="Foto identitas"
                                className="h-28 w-full object-cover"
                              />
                            </a>
                          ) : (
                            <p className="text-xs text-[#8b6d48] dark:text-[#b79a78]">
                              {penghuniProfileRow.fotoIdentitasPath ? "Tidak bisa memuat" : "—"}
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8b6d48] dark:text-[#b79a78]">
                            Bukti transfer
                          </p>
                          {profileBuktiTransferUrl ? (
                            <a
                              href={profileBuktiTransferUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block overflow-hidden rounded-xl border border-[#d6ddff] dark:border-[#424a80]"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={profileBuktiTransferUrl}
                                alt="Bukti transfer"
                                className="h-28 w-full object-cover"
                              />
                            </a>
                          ) : (
                            <p className="text-xs text-[#8b6d48] dark:text-[#b79a78]">
                              {penghuniProfileRow.buktiTransferPath ? "Tidak bisa memuat" : "—"}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                  {penghuniProfileRow.status === "Booking" ? "Rencana check-in" : "Tgl check in"}
                </dt>
                <dd className="mt-1 text-[#3f2f1f] dark:text-[#e8dcc8]">{penghuniProfileRow.tglCheckIn || "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Tgl check out</dt>
                <dd className="mt-1 text-[#3f2f1f] dark:text-[#e8dcc8]">
                  {penghuniProfileRow.status === "Booking" ? "—" : penghuniProfileRow.tglCheckOut || "—"}
                </dd>
                {penghuniProfileRow.status === "Stay" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {isPenghuniSewaOverdue(penghuniProfileRow) ? (
                      <button
                        type="button"
                        onClick={openExtendStayPanel}
                        className="btn-tactile inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-100 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-200 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200 dark:hover:bg-emerald-900/60"
                      >
                        <CalendarPlus size={13} aria-hidden />
                        Extend stay
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => void handleCheckoutPenghuni()}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-400 bg-red-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-red-700 dark:border-red-600 dark:bg-red-700 dark:hover:bg-red-800"
                    >
                      <LogOut size={13} aria-hidden />
                      Check out
                    </button>
                  </div>
                ) : null}
              </div>
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => handlePrintRegistrationCard(penghuniProfileRow)}
                  className="inline-flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-800 transition hover:border-violet-400 hover:bg-violet-200 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-200 dark:hover:border-violet-500 dark:hover:bg-violet-900/60"
                >
                  <Printer className="h-3.5 w-3.5" />
                  <span>Print Registration Card</span>
                </button>
              </div>
            </dl>
          </div>

          <div className="flex min-h-[280px] flex-col bg-[#faf6ef] p-6 dark:bg-[#241b14] md:min-h-0">
            <p className="text-xs uppercase tracking-[0.22em] text-[#8b6d48] dark:text-[#b79a78]">Ringkasan kamar</p>
            <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Lokasi kos</p>
                <p className="mt-1 font-medium text-[#2c2218] dark:text-[#f5e8d4]">{penghuniProfileRow.lokasiKos || "—"}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Blok / unit</p>
                <p className="mt-1 font-medium text-[#2c2218] dark:text-[#f5e8d4]">
                  {penghuniProfileRow.unitBlok} / {penghuniProfileRow.noKamar}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 border-t border-[#e5d8c4] pt-6 dark:border-[#3d2f22]">
              {penghuniProfileRow.status === "Booking" ? (
                <div className="relative">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                    Booking fee (DP sewa)
                  </p>
                  <div
                    className={`relative mt-1 rounded-xl border-2 px-3 py-2.5 transition ${
                      penghuniProfileRow.bookingFeePaid
                        ? "border-violet-500 bg-violet-50/95 dark:border-violet-500 dark:bg-violet-950/40"
                        : "border-transparent"
                    }`}
                  >
                    <p
                      className={`text-lg font-semibold ${
                        penghuniProfileRow.bookingFeePaid
                          ? "text-violet-700 dark:text-violet-300"
                          : "text-[#2c2218] dark:text-[#f5e8d4]"
                      }`}
                    >
                      {profilePanelDerived.bookingFeeFormatted}
                    </p>
                    {penghuniProfileRow.bookingFeePaid ? (
                      <span
                        className="pointer-events-none absolute -right-1 -top-2 rotate-[-8deg] rounded-md border-2 border-violet-800 bg-white px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-800 shadow-sm dark:bg-violet-100"
                        aria-hidden
                      >
                        PAID
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="relative">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                  {profilePanelDerived.depositLabel}
                </p>
                <div
                  className={`relative mt-1 rounded-xl border-2 px-3 py-2.5 transition ${
                    penghuniProfileRow.depositKamarPaid
                      ? "border-violet-500 bg-violet-50/95 dark:border-violet-500 dark:bg-violet-950/40"
                      : "border-transparent"
                  }`}
                >
                  <p
                    className={`text-lg font-semibold ${
                      penghuniProfileRow.depositKamarPaid
                        ? "text-violet-700 dark:text-violet-300"
                        : "text-[#2c2218] dark:text-[#f5e8d4]"
                    }`}
                  >
                    {profilePanelDerived.depositFormatted}
                  </p>
                  {penghuniProfileRow.depositKamarPaid ? (
                    <span
                      className="pointer-events-none absolute -right-1 -top-2 rotate-[-8deg] rounded-md border-2 border-violet-800 bg-white px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-violet-800 shadow-sm dark:bg-violet-100"
                      aria-hidden
                    >
                      PAID
                    </span>
                  ) : null}
                </div>
              </div>
              {penghuniProfileRow.status === "Booking" && profilePanelDerived.sisaPembayaranBookingFormatted ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                    Sisa pembayaran ke Stay
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                    {profilePanelDerived.sisaPembayaranBookingFormatted}
                  </p>
                  <p className="mt-1 text-xs text-[#6e5336] dark:text-[#bfa27f]">
                    Sisa sewa ({profilePanelDerived.sisaSewaFormatted}) + deposit kamar
                  </p>
                </div>
              ) : null}
              {penghuniProfileRow.status === "Stay" ||
              (penghuniProfileRow.status === "Booking" && penghuniProfileRow.bookingFeePaid) ? (
                <div className="relative">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                    {penghuniProfileRow.status === "Booking" ? "Sisa harga sewa kamar" : "Harga sewa kamar"}
                  </p>
                  <div
                    className={`relative mt-1 rounded-xl border-2 px-3 py-2.5 transition ${
                      penghuniProfileRow.sewaKamarPaid
                        ? "border-emerald-500 bg-emerald-50/95 dark:border-emerald-500 dark:bg-emerald-950/40"
                        : "border-transparent"
                    }`}
                  >
                    <p
                      className={`text-lg font-semibold ${
                        penghuniProfileRow.sewaKamarPaid
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-[#2c2218] dark:text-[#f5e8d4]"
                      }`}
                    >
                      {penghuniProfileRow.status === "Booking"
                        ? profilePanelDerived.sisaSewaFormatted
                        : profilePanelDerived.sewaFormatted}
                    </p>
                    <p className="mt-1 text-xs text-[#6e5336] dark:text-[#bfa27f]">
                      {profilePanelDerived.hargaBulanFormatted} × {profilePanelDerived.periodeBulan} bulan
                      {penghuniProfileRow.status === "Booking" ? " − booking fee" : ""}
                    </p>
                    {penghuniProfileRow.sewaKamarPaid ? (
                      <span
                        className="pointer-events-none absolute -right-1 -top-2 rotate-[-8deg] rounded-md border-2 border-emerald-700 bg-white px-2 py-0.5 text-[11px] font-black uppercase tracking-wide text-emerald-700 shadow-sm dark:bg-emerald-100"
                        aria-hidden
                      >
                        PAID
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-auto flex flex-col gap-3 pt-8">
              {penghuniProfileRow.status !== "History" ? (
                <p className="rounded-xl border border-[#e5d8c4] bg-[#f3ebe0]/80 px-3 py-2 text-xs text-[#6e5336] dark:border-[#4f3b2a] dark:bg-[#2a2018]/80 dark:text-[#bfa27f]">
                  Nota terakhir dipakai:{" "}
                  <span className="font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                    {lastUsedSrNota ?? "Belum ada"}
                  </span>
                  <span className="mt-0.5 block text-[10px] text-[#8b6d48] dark:text-[#9d7e55]">
                    Format SR + maks. {SR_NOTA_MAX_DIGITS} digit angka.
                  </span>
                </p>
              ) : null}
              {penghuniProfileRow.status === "History" ? (
                <p className="rounded-xl border border-zinc-300 bg-zinc-100 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-600 dark:bg-zinc-900/50 dark:text-zinc-200">
                  Penghuni ini sudah check out dan hanya tampil di daftar history.
                </p>
              ) : null}
              {penghuniProfileRow.status === "Booking" ? (
                <>
                  <button
                    type="button"
                    disabled={
                      Boolean(penghuniProfileRow.bookingFeePaid) ||
                      parseRupiahToNumber(penghuniProfileRow.bookingFee) <= 0
                    }
                    onClick={openBookingFeePaymentPanel}
                    className="btn-tactile flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Ticket size={18} aria-hidden />
                    Payment Booking
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(penghuniProfileRow.sewaKamarPaid) ||
                      !getActiveSewaCycleStart(penghuniProfileRow) ||
                      Math.max(0, Math.floor(Number(penghuniProfileRow.periodeSewa) || 0)) <= 0 ||
                      (parseRupiahToNumber(penghuniProfileRow.bookingFee) > 0 &&
                        !penghuniProfileRow.bookingFeePaid)
                    }
                    onClick={openSewaPaymentPanel}
                    className="btn-tactile flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <HandCoins size={18} aria-hidden />
                    Payment sewa kamar
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(penghuniProfileRow.depositKamarPaid) ||
                      parseRupiahToNumber(penghuniProfileRow.depositKamar) <= 0
                    }
                    onClick={openDepositPaymentPanel}
                    className="btn-tactile flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-700 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-amber-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Landmark size={18} aria-hidden />
                    Payment deposit kamar
                  </button>
                </>
              ) : penghuniProfileRow.status === "Stay" ? (
                <>
                  <button
                    type="button"
                    disabled={Boolean(penghuniProfileRow.sewaKamarPaid)}
                    onClick={openSewaPaymentPanel}
                    className="btn-tactile flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <HandCoins size={18} aria-hidden />
                    Payment sewa kamar
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(penghuniProfileRow.depositKamarPaid) ||
                      parseRupiahToNumber(penghuniProfileRow.depositKamar) <= 0
                    }
                    onClick={openDepositPaymentPanel}
                    className="btn-tactile flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Landmark size={18} aria-hidden />
                    Payment deposit kamar
                  </button>
                </>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowSewaPaymentPanel(false);
                setShowExtendStayPanel(false);
                setShowDepositPaymentPanel(false);
                setPenghuniProfileRow(null);
              }}
              className="mt-4 inline-flex items-center gap-1.5 self-end rounded-full border border-[#d5be9e] px-4 py-2 text-xs font-semibold text-[#6d5232] transition hover:bg-[#efe2d1] dark:border-[#4f3b2a] dark:text-[#d9bb94] dark:hover:bg-[#33261b]"
            >
              <X size={14} aria-hidden />
              Tutup
            </button>
          </div>
        </div>
      </div>
    ) : null}

    {showSewaPaymentPanel && penghuniProfileRow ? (
      <div
        className="fixed inset-0 z-[175] flex justify-end"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sewa-payment-panel-title"
      >
        <button
          type="button"
          className="btn-flat min-h-0 min-w-0 flex-1 bg-black/40 transition hover:bg-black/50"
          aria-label="Tutup panel pembayaran"
          onClick={() => setShowSewaPaymentPanel(false)}
        />
        <aside
          className="flex h-full w-full max-w-md flex-shrink-0 flex-col border-l border-[#d6ddff] bg-[#f7f8ff] shadow-2xl dark:border-[#424a80] dark:bg-[#1b1f3d]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#eadcc9] p-5 dark:border-[#3d2f22]">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-xl bg-emerald-100 p-2 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200">
                <HandCoins size={22} aria-hidden />
              </span>
              <div>
                <p id="sewa-payment-panel-title" className="text-xs uppercase tracking-[0.2em] text-[#9d7e55] dark:text-[#cfb089]">
                  Input payment
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">Sewa kamar</h2>
                <p className="mt-1 text-sm text-[#6e5336] dark:text-[#bfa27f]">{penghuniProfileRow.namaLengkap}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSewaPaymentPanel(false)}
              className="rounded-full p-2 text-[#6e5336] transition hover:bg-[#efe2d1] hover:text-[#2c2218] dark:text-[#d9bc95] dark:hover:bg-[#33261b]"
              aria-label="Tutup panel"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Kategori</span>
              <input
                readOnly
                value="Pemasukan"
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-[#f3ebe0] px-3 py-2.5 text-[#2c2218] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#f5e8d4]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">POS</span>
              <input
                readOnly
                value={FINANCE_POS_SEWA_KAMAR}
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-[#f3ebe0] px-3 py-2.5 text-[#2c2218] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#f5e8d4]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                No. nota <span className="text-red-600 dark:text-red-400">*</span>
              </span>
              <p className="mt-0.5 text-xs text-[#6e5336] dark:text-[#bfa27f]">
                Format: <span className="font-semibold">SR</span> + maks. {SR_NOTA_MAX_DIGITS} digit angka.
                {" "}
                Nota terakhir dipakai:{" "}
                <span className="font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                  {lastUsedSrNota ?? "Belum ada"}
                </span>
                . Otomatis diisi nomor berikutnya (bisa diubah).
              </p>
              <div
                className={`mt-1 flex w-full items-center overflow-hidden rounded-xl border bg-white text-[#2c2218] outline-none dark:bg-[#1f1710] dark:text-[#f5e8d4] ${
                  paymentNotaConflictMessage
                    ? "border-red-400 ring-2 ring-red-200 focus-within:ring-2 focus-within:ring-red-300 dark:border-red-500/80 dark:ring-red-900/40"
                    : "border-[#d5be9e] focus-within:ring-2 focus-within:ring-emerald-500/30 dark:border-[#4f3b2a]"
                }`}
              >
                <span
                  className="shrink-0 select-none border-r border-[#e5d8c4] bg-[#f3ebe0] px-3 py-2.5 text-sm font-semibold tracking-wide text-[#5c4330] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#e8dcc8]"
                  aria-hidden
                >
                  SR
                </span>
                <input
                  id="penghuni-sewa-payment-nota"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={SR_NOTA_MAX_DIGITS}
                  value={sewaPaymentNotaDigits}
                  onChange={(e) => setSewaPaymentNotaDigits(sanitizeSrNotaDigits(e.target.value))}
                  aria-invalid={Boolean(paymentNotaConflictMessage)}
                  aria-label="Nomor nota setelah SR"
                  aria-describedby={
                    paymentNotaConflictMessage ? "penghuni-sewa-payment-nota-alert" : undefined
                  }
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-[#2c2218] outline-none placeholder:text-[#9d7e55]/70 dark:text-[#f5e8d4]"
                  placeholder="contoh: 0001"
                />
              </div>
              {paymentNotaConflictMessage ? (
                <p
                  id="penghuni-sewa-payment-nota-alert"
                  role="alert"
                  className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                >
                  {paymentNotaConflictMessage}
                </p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                Tanggal payment <span className="text-red-600 dark:text-red-400">*</span>
              </span>
              <input
                type="date"
                required
                value={sewaPaymentTanggal}
                onChange={(e) => setSewaPaymentTanggal(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-white px-3 py-2.5 text-[#2c2218] outline-none ring-emerald-500/30 focus:ring-2 dark:border-[#4f3b2a] dark:bg-[#1f1710] dark:text-[#f5e8d4]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Nominal (Rp)</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={sewaPaymentNominal}
                onChange={(e) => setSewaPaymentNominal(formatRupiahInput(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-white px-3 py-2.5 text-[#2c2218] outline-none ring-emerald-500/30 focus:ring-2 dark:border-[#4f3b2a] dark:bg-[#1f1710] dark:text-[#f5e8d4]"
                placeholder="0"
              />
            </label>
            {sewaPaymentDerived ? (
              <p className="rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-100">
                <span className="font-semibold">Perhitungan (saat Payment sekarang):</span> nominal input − referensi sewa
                profil (harga bulanan × periode) = selisih.
                <br />
                {formatRpNumber(sewaPaymentDerived.nominalInput)} − {formatRpNumber(sewaPaymentDerived.referensiProfil)} ={" "}
                <span className="font-semibold">{formatRpNumber(sewaPaymentDerived.selisih)}</span>
              </p>
            ) : null}
            <p className="text-xs text-[#6e5336] dark:text-[#bfa27f]">
              Referensi: {penghuniProfileRow.lokasiKos || "—"} · {penghuniProfileRow.unitBlok} / {penghuniProfileRow.noKamar}
            </p>
          </div>

          <div className="border-t border-[#eadcc9] p-5 dark:border-[#3d2f22]">
            <button
              type="button"
              disabled={Boolean(paymentNotaConflictMessage) || !isValidSrNotaDigits(sewaPaymentNotaDigits)}
              onClick={() => void handleSewaPaymentSekarang()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={18} aria-hidden />
              Payment sekarang
            </button>
          </div>
        </aside>
      </div>
    ) : null}

    {showExtendStayPanel && penghuniProfileRow ? (
      <div
        className="fixed inset-0 z-[176] flex justify-end"
        role="dialog"
        aria-modal="true"
        aria-labelledby="extend-stay-panel-title"
      >
        <button
          type="button"
          className="btn-flat min-h-0 min-w-0 flex-1 bg-black/40 transition hover:bg-black/50"
          aria-label="Tutup panel extend stay"
          onClick={() => setShowExtendStayPanel(false)}
        />
        <aside className="flex h-full w-full max-w-md flex-shrink-0 flex-col border-l border-[#f0b7b7] bg-[#fff6f6] shadow-2xl dark:border-[#7f2c2c] dark:bg-[#2f1717]">
          <div className="flex items-start justify-between border-b border-[#f2cece] px-5 py-4 dark:border-[#5f2a2a]">
            <div>
              <p id="extend-stay-panel-title" className="text-xs uppercase tracking-[0.2em] text-[#b64c4c] dark:text-[#e59b9b]">
                Extend stay
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[#3a1f1f] dark:text-[#ffd9d9]">Perpanjangan sewa</h2>
              <p className="mt-1 text-xs text-[#7a4747] dark:text-[#e7bdbd]">{penghuniProfileRow.namaLengkap}</p>
            </div>
            <button
              type="button"
              onClick={() => setShowExtendStayPanel(false)}
              className="rounded-full border border-[#e0b7b7] p-2 text-[#7b4a4a] transition hover:bg-[#f8dede] dark:border-[#6f3d3d] dark:text-[#e9b9b9] dark:hover:bg-[#4a2727]"
              aria-label="Tutup"
            >
              <X size={16} />
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5 text-sm">
            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                Periode sewa bulan (tambahan)
              </label>
              <input
                type="number"
                min={1}
                value={extendStayPeriodeBulan}
                onChange={(e) => setExtendStayPeriodeBulan(e.target.value)}
                className="w-full min-h-[2.625rem] rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                Tanggal check out (baru)
              </label>
              <input
                type="date"
                value={extendStayCheckOut}
                readOnly
                className="w-full min-h-[2.625rem] rounded-2xl border border-[#dcc7aa] bg-[#f9efe8] px-3 py-2.5 text-sm outline-none dark:border-[#4d3925] dark:bg-[#3a2a1f]"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                Nominal bulanan
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={extendStayNominalBulanan}
                onChange={(e) => setExtendStayNominalBulanan(formatRupiahInput(e.target.value))}
                placeholder="Contoh: 1.250.000"
                className="w-full min-h-[2.625rem] rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#f2cece] px-5 py-4 dark:border-[#5f2a2a]">
            <button
              type="button"
              onClick={() => setShowExtendStayPanel(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#d5be9e] px-3 py-2 text-xs font-semibold text-[#6d5232] transition hover:bg-[#efe2d1] dark:border-[#4f3b2a] dark:text-[#d9bb94] dark:hover:bg-[#33261b]"
            >
              <X size={13} aria-hidden />
              Batal
            </button>
            <button
              type="button"
              disabled={isSubmittingExtendStay}
              onClick={() => void handleSubmitExtendStay()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CalendarPlus size={13} aria-hidden />
              Simpan Extend Stay
            </button>
          </div>
        </aside>
      </div>
    ) : null}

    {showDepositPaymentPanel && penghuniProfileRow ? (
      <div
        className="fixed inset-0 z-[175] flex justify-end"
        role="dialog"
        aria-modal="true"
        aria-labelledby="deposit-payment-panel-title"
      >
        <button
          type="button"
          className="btn-flat min-h-0 min-w-0 flex-1 bg-black/40 transition hover:bg-black/50"
          aria-label="Tutup panel pembayaran deposit"
          onClick={() => setShowDepositPaymentPanel(false)}
        />
        <aside
          className="flex h-full w-full max-w-md flex-shrink-0 flex-col border-l border-[#d6ddff] bg-[#f7f8ff] shadow-2xl dark:border-[#424a80] dark:bg-[#1b1f3d]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#eadcc9] p-5 dark:border-[#3d2f22]">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 rounded-xl bg-violet-100 p-2 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200">
                {depositPaymentKind === "booking_fee" ? (
                  <Ticket size={22} aria-hidden />
                ) : (
                  <Landmark size={22} aria-hidden />
                )}
              </span>
              <div>
                <p id="deposit-payment-panel-title" className="text-xs uppercase tracking-[0.2em] text-[#9d7e55] dark:text-[#cfb089]">
                  Input payment
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                  {depositPaymentKind === "booking_fee" ? "booking fee" : "deposit kamar"}
                </h2>
                <p className="mt-1 text-sm text-[#6e5336] dark:text-[#bfa27f]">{penghuniProfileRow.namaLengkap}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowDepositPaymentPanel(false)}
              className="rounded-full p-2 text-[#6e5336] transition hover:bg-[#efe2d1] hover:text-[#2c2218] dark:text-[#d9bc95] dark:hover:bg-[#33261b]"
              aria-label="Tutup panel"
            >
              <X size={20} />
            </button>
          </div>

          <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Kategori</span>
              <input
                readOnly
                value="Pemasukan"
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-[#f3ebe0] px-3 py-2.5 text-[#2c2218] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#f5e8d4]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">POS</span>
              <input
                readOnly
                value={depositPaymentKind === "booking_fee" ? FINANCE_POS_BOOKING_FEE : FINANCE_POS_DEPOSIT_KAMAR}
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-[#f3ebe0] px-3 py-2.5 text-[#2c2218] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#f5e8d4]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                No. nota <span className="text-red-600 dark:text-red-400">*</span>
              </span>
              <p className="mt-0.5 text-xs text-[#6e5336] dark:text-[#bfa27f]">
                Format: <span className="font-semibold">SR</span> + maks. {SR_NOTA_MAX_DIGITS} digit angka.
                {" "}
                Nota terakhir dipakai:{" "}
                <span className="font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                  {lastUsedSrNota ?? "Belum ada"}
                </span>
                . Otomatis diisi nomor berikutnya (bisa diubah).
              </p>
              <div
                className={`mt-1 flex w-full items-center overflow-hidden rounded-xl border bg-white text-[#2c2218] outline-none dark:bg-[#1f1710] dark:text-[#f5e8d4] ${
                  paymentNotaConflictMessage
                    ? "border-red-400 ring-2 ring-red-200 focus-within:ring-2 focus-within:ring-red-300 dark:border-red-500/80 dark:ring-red-900/40"
                    : "border-[#d5be9e] focus-within:ring-2 focus-within:ring-violet-500/30 dark:border-[#4f3b2a]"
                }`}
              >
                <span
                  className="shrink-0 select-none border-r border-[#e5d8c4] bg-[#f3ebe0] px-3 py-2.5 text-sm font-semibold tracking-wide text-[#5c4330] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#e8dcc8]"
                  aria-hidden
                >
                  SR
                </span>
                <input
                  id="penghuni-deposit-payment-nota"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={SR_NOTA_MAX_DIGITS}
                  value={depositPaymentNotaDigits}
                  onChange={(e) => setDepositPaymentNotaDigits(sanitizeSrNotaDigits(e.target.value))}
                  aria-invalid={Boolean(paymentNotaConflictMessage)}
                  aria-label="Nomor nota setelah SR"
                  aria-describedby={
                    paymentNotaConflictMessage ? "penghuni-deposit-payment-nota-alert" : undefined
                  }
                  className="min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-[#2c2218] outline-none placeholder:text-[#9d7e55]/70 dark:text-[#f5e8d4]"
                  placeholder="contoh: 0001"
                />
              </div>
              {paymentNotaConflictMessage ? (
                <p
                  id="penghuni-deposit-payment-nota-alert"
                  role="alert"
                  className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                >
                  {paymentNotaConflictMessage}
                </p>
              ) : null}
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                Tanggal payment <span className="text-red-600 dark:text-red-400">*</span>
              </span>
              <input
                type="date"
                required
                value={depositPaymentTanggal}
                onChange={(e) => setDepositPaymentTanggal(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-white px-3 py-2.5 text-[#2c2218] outline-none ring-violet-500/30 focus:ring-2 dark:border-[#4f3b2a] dark:bg-[#1f1710] dark:text-[#f5e8d4]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Nominal (Rp)</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={depositPaymentNominal}
                onChange={(e) => setDepositPaymentNominal(formatRupiahInput(e.target.value))}
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-white px-3 py-2.5 text-[#2c2218] outline-none ring-violet-500/30 focus:ring-2 dark:border-[#4f3b2a] dark:bg-[#1f1710] dark:text-[#f5e8d4]"
                placeholder="0"
              />
            </label>
            {depositPaymentDerived ? (
              <p className="rounded-xl border border-violet-200/80 bg-violet-50/80 px-3 py-2 text-xs text-violet-950 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-100">
                <span className="font-semibold">Perhitungan (saat Payment sekarang):</span> nominal input − referensi{" "}
                {depositPaymentKind === "booking_fee" ? "booking fee" : "deposit"} profil = selisih.
                <br />
                {formatRpNumber(depositPaymentDerived.nominalInput)} −{" "}
                {formatRpNumber(depositPaymentDerived.referensiProfil)} ={" "}
                <span className="font-semibold">{formatRpNumber(depositPaymentDerived.selisih)}</span>
              </p>
            ) : null}
            <p className="text-xs text-[#6e5336] dark:text-[#bfa27f]">
              Referensi: {penghuniProfileRow.lokasiKos || "—"} · {penghuniProfileRow.unitBlok} / {penghuniProfileRow.noKamar}
              {depositPaymentKind === "booking_fee"
                ? " · Setelah lunas, status tetap Booking."
                : penghuniProfileRow.status === "Booking"
                  ? " · Stay otomatis jika sewa juga sudah lunas."
                  : ""}
            </p>
          </div>

          <div className="border-t border-[#eadcc9] p-5 dark:border-[#3d2f22]">
            <button
              type="button"
              disabled={Boolean(paymentNotaConflictMessage) || !isValidSrNotaDigits(depositPaymentNotaDigits)}
              onClick={() => void handleDepositPaymentSekarang()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={18} aria-hidden />
              Payment sekarang
            </button>
          </div>
        </aside>
      </div>
    ) : null}

    {hoverKeterangan ? (
      <div
        role="tooltip"
        className="pointer-events-none fixed z-[250] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[#dcc7aa] bg-[#fffdf9] p-3 text-left text-xs text-[#3f2f1f] shadow-2xl dark:border-[#4d3925] dark:bg-[#2b2016] dark:text-[#e8dcc8]"
        style={{
          left: Math.max(12, Math.min(hoverKeterangan.x, typeof window !== "undefined" ? window.innerWidth - 12 : hoverKeterangan.x)),
          top: hoverKeterangan.y + 14,
          transform: "translateX(-50%)",
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
          Keterangan
        </p>
        <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap">{hoverKeterangan.text}</p>
      </div>
    ) : null}

    {showPenghuniForm ? (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Tutup"
          className="btn-flat absolute inset-0 bg-black/50 transition hover:bg-black/60"
          onClick={closePenghuniModal}
        />
        <div
          className="relative z-[110] max-h-[min(90vh,900px)] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-[#dcc7aa] bg-[#fffdf9] p-6 shadow-2xl dark:border-[#4d3925] dark:bg-[#1f1710]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#eadcc9] pb-4 dark:border-[#3d2f22]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#9d7e55] dark:text-[#cfb089]">
                {editingId ? "Edit penghuni" : "Penghuni baru"}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                {editingId ? "Perbarui data Booking / Stay" : "Tambah penghuni Booking / Stay"}
              </h2>
            </div>
            <button
              type="button"
              onClick={closePenghuniModal}
              className="btn-tactile rounded-full p-2 text-[#6e5336] transition hover:bg-[#efe2d1] hover:text-[#2c2218] dark:text-[#d9bc95] dark:hover:bg-[#33261b]"
              aria-label="Tutup form"
            >
              <X size={20} />
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Status</label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusMenuOpen((prev) => !prev)}
                    className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm outline-none focus:ring-2 dark:bg-[#2b2016] ${
                      isBlueAccent
                        ? "border-blue-400 bg-blue-50 text-blue-700 ring-blue-300 dark:border-blue-500 dark:bg-[#1a2740] dark:text-blue-200"
                        : "border-[#dcc7aa] bg-[#fffdf9] text-[#3f2f1f] ring-[#c09c70] dark:border-[#4d3925]"
                    }`}
                  >
                    <StatusBadge status={form.status} />
                    <ChevronDown size={16} />
                  </button>

                  {statusMenuOpen ? (
                    <div className="absolute z-[120] mt-2 w-full rounded-2xl border border-[#dcc7aa] bg-white p-2 shadow-lg dark:border-[#4d3925] dark:bg-[#2b2016]">
                      {(["Booking", "Stay"] as PenghuniStatus[]).map((statusOption) => (
                        <button
                          key={statusOption}
                          type="button"
                          onClick={() => {
                            handleInputChange("status", statusOption);
                            setStatusMenuOpen(false);
                          }}
                          className="flex w-full items-center rounded-xl px-2 py-2 text-left hover:bg-[#f7ecdb] dark:hover:bg-[#3a2b1f]"
                        >
                          <StatusBadge status={statusOption} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Nama Lengkap</label>
                <input required value={form.namaLengkap} onChange={(event) => handleInputChange("namaLengkap", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" placeholder="Masukkan nama lengkap" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">No. WA</label>
                <input value={form.noWa} onChange={(event) => handleInputChange("noWa", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" placeholder="08xxxxxxxxxx" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Lokasi Kos</label>
                <select value={form.lokasiKos} onChange={(event) => handleInputChange("lokasiKos", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]">{lokasiFormOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Unit / Blok</label>
                <select value={form.unitBlok} onChange={(event) => handleInputChange("unitBlok", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]">{unitFormOptions.map((option) => <option key={option} value={option}>{option}</option>)}</select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">No. Kamar</label>
                <select
                  value={form.noKamar}
                  onChange={(event) => handleInputChange("noKamar", event.target.value)}
                  className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                  disabled={availableRoomNumbers.length === 0}
                >
                  {availableRoomNumbers.length > 0 ? (
                    availableRoomNumbers.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))
                  ) : (
                    <option value="">
                      Tidak ada kamar Available untuk lokasi dan blok ini (cek Master/Kamar)
                    </option>
                  )}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Periode Sewa (Bulan)</label>
                <input type="number" min={1} value={form.periodeSewa} onChange={(event) => handleInputChange("periodeSewa", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" />
              </div>
              {form.status === "Booking" ? (
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Rencana Check In</label>
                  <input type="date" value={form.tglCheckIn} onChange={(event) => handleInputChange("tglCheckIn", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" />
                  {projectedBookingCheckOut ? (
                    <p className="mt-1.5 text-[11px] leading-snug text-[#6b5238] dark:text-[#b79a78]">
                      Perkiraan selesai sewa (check-in + {Math.max(0, Math.floor(Number(form.periodeSewa) || 0))} bulan
                      kalender): <span className="font-semibold text-[#4a3824] dark:text-[#e8d4bc]">{projectedBookingCheckOut}</span>
                    </p>
                  ) : null}
                </div>
              ) : (
                <>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Tgl Check In</label>
                    <input type="date" value={form.tglCheckIn} onChange={(event) => handleInputChange("tglCheckIn", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                      Tgl Check Out
                      <span className="ml-1 font-normal normal-case tracking-normal text-[#8b6d48]/80">(otomatis dari check-in + periode)</span>
                    </label>
                    <input type="date" value={form.tglCheckOut} onChange={(event) => handleInputChange("tglCheckOut", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" />
                  </div>
                </>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Harga Bulanan</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8f734f]">
                    Rp
                  </span>
                  <input
                    inputMode="numeric"
                    value={form.hargaBulanan}
                    onChange={(event) =>
                      handleInputChange("hargaBulanan", formatRupiahInput(event.target.value))
                    }
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] py-2.5 pl-12 pr-4 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                    placeholder="1.300.000"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                  Booking Fee (DP sewa)
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8f734f]">
                    Rp
                  </span>
                  <input
                    inputMode="numeric"
                    value={form.bookingFee}
                    onChange={(event) =>
                      handleInputChange("bookingFee", formatRupiahInput(event.target.value))
                    }
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] py-2.5 pl-12 pr-4 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                    placeholder="0"
                  />
                </div>
                <p className="mt-1 text-[10px] text-[#8b6d48] dark:text-[#b79a78]">
                  Uang muka yang mengurangi total sewa (bukan deposit kamar).
                </p>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                  Deposit Kamar
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8f734f]">
                    Rp
                  </span>
                  <input
                    inputMode="numeric"
                    value={form.depositKamar}
                    onChange={(event) =>
                      handleInputChange("depositKamar", formatRupiahInput(event.target.value))
                    }
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] py-2.5 pl-12 pr-4 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                    placeholder="500.000"
                  />
                </div>
                <p className="mt-1 text-[10px] text-[#8b6d48] dark:text-[#b79a78]">
                  Bisa diubah selama status masih Booking.
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                  {form.status === "Stay" ? "TOTAL PEMBAYARAN" : "Sisa Pembayaran ke Stay"}
                </label>
                <div className="flex w-full items-center rounded-2xl border border-[#dcc7aa] bg-[#f5efe6] px-4 py-2.5 text-sm font-medium text-[#2c2218] dark:border-[#4d3925] dark:bg-[#2b2016] dark:text-[#f5e8d4]">
                  {pembayaranRingkasanDisplay}
                </div>
                <p className="mt-1 text-[10px] text-[#8b6d48] dark:text-[#b79a78]">
                  {form.status === "Stay"
                    ? "Dihitung: (Harga Bulanan × Periode Sewa) + Deposit Kamar"
                    : "Dihitung: (Harga Bulanan × Periode Sewa − Booking Fee) + Deposit Kamar"}
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Keterangan</label>
                <textarea rows={3} value={form.keterangan} onChange={(event) => handleInputChange("keterangan", event.target.value)} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" placeholder="Tambahkan catatan jika perlu" />
              </div>
            </div>

            <div className="flex flex-wrap gap-3 border-t border-[#eadcc9] pt-4 dark:border-[#3d2f22]">
              <ActionButtonWithIcon
                icon={Save}
                type="submit"
                disabled={isSubmitting}
                iconClassName={iconTone.success}
                label={isSubmitting ? "Menyimpan..." : editingId ? "Update Data" : "Simpan Data"}
                className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-6 py-2.5 text-sm font-semibold tracking-[0.15em] text-[#eef3ff] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
              />
              <ActionButtonWithIcon
                icon={X}
                onClick={closePenghuniModal}
                label={editingId ? "Batal edit" : "Tutup"}
                iconClassName={iconTone.warning}
                className="rounded-full border border-[#d5be9e] px-6 py-2.5 text-sm font-semibold text-[#6d5232] transition hover:bg-[#f3e6d2] dark:border-[#4f3b2a] dark:text-[#d9bb94] dark:hover:bg-[#2f2419]"
              />
            </div>
          </form>
        </div>
      </div>
    ) : null}

    {showSurveyForm ? (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
        <button
          type="button"
          aria-label="Tutup"
          className="btn-flat absolute inset-0 bg-black/50 transition hover:bg-black/60"
          onClick={closeSurveyModal}
        />
        <div
          className="relative z-[110] max-h-[min(90vh,900px)] w-full max-w-2xl overflow-y-auto rounded-[1.75rem] border border-amber-200/90 bg-gradient-to-b from-amber-50/98 to-[#fffdf9] p-6 shadow-2xl dark:border-[#5c4828] dark:from-[#2a2215] dark:to-[#1f1710]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-amber-200/80 pb-4 dark:border-[#4a3a22]">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-[#a67c35] dark:text-[#e6c48f]">
                {surveyEditingId ? "Edit survey" : "Survey baru"}
              </p>
              <h2 className="mt-1 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                {localDemoMode ? "Calon penghuni" : "Survey calon penghuni"}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeSurveyModal}
              className="btn-tactile rounded-full p-2 text-amber-900 transition hover:bg-amber-200/80 dark:text-amber-100 dark:hover:bg-amber-900/50"
              aria-label="Tutup form"
            >
              <X size={20} />
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSurveySubmit}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Nama lengkap</label>
                  <input
                    required
                    value={surveyForm.namaLengkap}
                    onChange={(e) => handleSurveyFieldChange("namaLengkap", e.target.value)}
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Lokasi</label>
                  <select
                    value={surveyForm.lokasiKos}
                    onChange={(e) => handleSurveyFieldChange("lokasiKos", e.target.value)}
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm dark:border-[#4d3925] dark:bg-[#2b2016]"
                  >
                    {surveyLokasiOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Unit / Blok</label>
                  <select
                    value={surveyForm.unitBlok}
                    onChange={(e) => handleSurveyFieldChange("unitBlok", e.target.value)}
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm dark:border-[#4d3925] dark:bg-[#2b2016]"
                  >
                    {surveyUnitOptions.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Periode sewa (bulan)</label>
                  <input
                    type="number"
                    min={1}
                    value={surveyForm.periodeSewa}
                    onChange={(e) => handleSurveyFieldChange("periodeSewa", e.target.value)}
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm dark:border-[#4d3925] dark:bg-[#2b2016]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Rencana check-in</label>
                  <input
                    type="date"
                    value={surveyForm.rencanaCheckIn}
                    onChange={(e) => handleSurveyFieldChange("rencanaCheckIn", e.target.value)}
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm dark:border-[#4d3925] dark:bg-[#2b2016]"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Negosiasi harga</label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-[#8f734f]">Rp</span>
                    <input
                      inputMode="numeric"
                      value={surveyForm.negosiasiHarga}
                      onChange={(e) => handleSurveyFieldChange("negosiasiHarga", e.target.value)}
                      className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] py-2.5 pl-12 pr-4 text-sm dark:border-[#4d3925] dark:bg-[#2b2016]"
                      placeholder="2.500.000"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">No. WA</label>
                  <input
                    value={surveyForm.noWa}
                    onChange={(e) => handleSurveyFieldChange("noWa", e.target.value)}
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm dark:border-[#4d3925] dark:bg-[#2b2016]"
                    placeholder="08xxxxxxxxxx"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Keterangan</label>
                  <textarea
                    rows={3}
                    value={surveyForm.keterangan}
                    onChange={(e) => handleSurveyFieldChange("keterangan", e.target.value)}
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm dark:border-[#4d3925] dark:bg-[#2b2016]"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-3 border-t border-amber-200/80 pt-4 dark:border-[#4a3a22]">
                <ActionButtonWithIcon
                  icon={Save}
                  type="submit"
                  disabled={surveySubmitting}
                  iconClassName={iconTone.success}
                  label={surveySubmitting ? "Menyimpan…" : surveyEditingId ? "Update survey" : "Simpan survey"}
                  className="rounded-full bg-gradient-to-r from-amber-800 to-amber-600 px-6 py-2.5 text-sm font-semibold tracking-[0.12em] text-[#fff8eb] hover:from-amber-900 hover:to-amber-800"
                />
                <ActionButtonWithIcon
                  icon={X}
                  onClick={closeSurveyModal}
                  label="Batal"
                  iconClassName={iconTone.warning}
                  className="rounded-full border border-amber-300 px-6 py-2.5 text-sm font-semibold text-amber-900 dark:border-amber-700 dark:text-amber-100"
                />
              </div>
            </form>
        </div>
      </div>
    ) : null}
    </section>
  );
}
