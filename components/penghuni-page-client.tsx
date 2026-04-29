"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/libsupabaseClient";
import {
  AlertTriangle,
  BedDouble,
  ClipboardList,
  ChevronDown,
  CreditCard,
  HandCoins,
  MessageCircle,
  Pencil,
  Printer,
  Save,
  Search,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import RefreshToolbarButton from "@/components/ui/refresh-toolbar-button";
import StatusBadge from "@/components/ui/status-badge";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY, newSandboxId } from "@/lib/sandbox-storage";
import {
  FINANCE_POS_DEPOSIT_KAMAR,
  FINANCE_POS_SEWA_KAMAR,
  sanitizePenghuniPaymentFlags,
} from "@/lib/penghuni-finance-payment-sync";
import { buildDemoLokasiList, buildDemoUnitList } from "@/lib/demo-form-options";
import { syncKamarRowsWithPenghuniList } from "@/lib/kamar-penghuni-sync";
import {
  escapeIlikeExact,
  financeNotaTakenMessage,
  findFinanceRowWithDuplicateNota,
  normalizeNotaKey,
} from "@/lib/finance-nota-validation";
import { buildSewaSplitCalendarMonthStarts, splitNominalRupiahEqualParts } from "@/lib/finance-sewa-split";
import type { KamarRow } from "@/components/kamar-page-client";
import type { FinanceRow } from "@/components/finance-page-client";

type PenghuniStatus = "Booking" | "Stay";

export type PenghuniRow = {
  id: string;
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  periodeSewa: string;
  tglCheckIn: string;
  tglCheckOut: string;
  hargaBulanan: string;
  bookingFee: string;
  noWa: string;
  status: PenghuniStatus;
  keterangan: string;
  /** Tercatat lunas lewat flow payment sewa kamar di profil. */
  sewaKamarPaid?: boolean;
  /** No. nota fisik yang dipakai saat mencatat payment sewa (sinkron dengan Finance). */
  sewaKamarNota?: string;
  depositKamarPaid?: boolean;
  depositKamarNota?: string;
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

/** Hanya dipakai saat demo lokal mati (placeholder sampai data Supabase). */
const CLOUD_FALLBACK_LOKASI = ["Jakarta Selatan", "Bandung", "Yogyakarta"];
const CLOUD_FALLBACK_UNIT = ["Blok A", "Blok B", "Blok C"];

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
  const sewaDue =
    parseRupiahToNumber(p.hargaBulanan) > 0 &&
    Math.max(0, Math.floor(Number(p.periodeSewa) || 0)) > 0 &&
    !p.sewaKamarPaid;
  const depDue = parseRupiahToNumber(p.bookingFee) > 0 && !p.depositKamarPaid;
  return sewaDue || depDue;
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

export default function PenghuniPageClient({
  initialData,
  initialKamarRows = [],
}: {
  initialData: PenghuniRow[];
  initialKamarRows?: KamarRow[];
}) {
  const { localDemoMode } = useSandboxMode();
  const { toast, confirm } = useAppFeedback();
  const [sandboxRev, setSandboxRev] = useState(0);
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

  const [form, setForm] = useState<PenghuniForm>(() => ({
    ...initialForm,
    noKamar: "",
  }));
  const [data, setData] = useState<PenghuniRow[]>(initialData);
  const [cloudKamarRows, setCloudKamarRows] = useState<KamarRow[]>(initialKamarRows);
  const [surveyCalon, setSurveyCalon] = useState<SurveyCalonRow[]>([]);
  const [surveyForm, setSurveyForm] = useState<SurveyCalonForm>({ ...initialSurveyForm });
  const [surveyEditingId, setSurveyEditingId] = useState<string | null>(null);
  const [showPenghuniForm, setShowPenghuniForm] = useState(false);
  const [penghuniProfileRow, setPenghuniProfileRow] = useState<PenghuniRow | null>(null);
  const [showSewaPaymentPanel, setShowSewaPaymentPanel] = useState(false);
  const [sewaPaymentNominal, setSewaPaymentNominal] = useState("");
  const [sewaPaymentNoNota, setSewaPaymentNoNota] = useState("");
  const [showDepositPaymentPanel, setShowDepositPaymentPanel] = useState(false);
  const [depositPaymentNominal, setDepositPaymentNominal] = useState("");
  const [depositPaymentNoNota, setDepositPaymentNoNota] = useState("");
  /** Duplikat no nota vs tabel finance (Supabase), untuk panel payment penghuni. */
  const [remotePaymentNotaConflictMessage, setRemotePaymentNotaConflictMessage] = useState("");
  const [showSurveyForm, setShowSurveyForm] = useState(false);
  const [surveySubmitting, setSurveySubmitting] = useState(false);
  const [surveyInfo, setSurveyInfo] = useState("");
  const [surveyError, setSurveyError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [selectedLokasiFilter, setSelectedLokasiFilter] = useState("Semua Lokasi");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("Semua Blok/Unit");
  const [penghuniListSearch, setPenghuniListSearch] = useState("");
  /** Tooltip keterangan baris tabel (fixed supaya tidak terpotong overflow). */
  const [hoverKeterangan, setHoverKeterangan] = useState<{
    id: string;
    text: string;
    x: number;
    y: number;
  } | null>(null);

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

  const lokasiFormOptions = useMemo(() => {
    if (!localDemoMode) return [...CLOUD_FALLBACK_LOKASI];
    return buildDemoLokasiList(sandboxReady, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge]);

  const unitFormOptions = useMemo(() => {
    if (!localDemoMode) return [...CLOUD_FALLBACK_UNIT];
    return buildDemoUnitList(sandboxReady, form.lokasiKos, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge, form.lokasiKos]);

  const surveyLokasiOptions = useMemo(() => {
    if (!localDemoMode) return [...CLOUD_FALLBACK_LOKASI];
    return buildDemoLokasiList(sandboxReady, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge]);

  const surveyUnitOptions = useMemo(() => {
    if (!localDemoMode) return [...CLOUD_FALLBACK_UNIT];
    return buildDemoUnitList(sandboxReady, surveyForm.lokasiKos, kamarSandboxRows, rowsForDemoMerge);
  }, [localDemoMode, sandboxReady, sandboxRev, kamarSandboxRows, rowsForDemoMerge, surveyForm.lokasiKos]);

  useEffect(() => {
    if (localDemoMode) return;
    if (!CLOUD_FALLBACK_LOKASI.includes(form.lokasiKos)) {
      setForm((prev) => ({
        ...prev,
        lokasiKos: CLOUD_FALLBACK_LOKASI[0],
        unitBlok: CLOUD_FALLBACK_UNIT[0],
      }));
    }
  }, [localDemoMode, form.lokasiKos]);

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

  /** Booking: (harga × periode) − booking fee. Stay: (harga × periode bulan) + deposit kamar (nilai di field bookingFee). */
  const pembayaranRingkasanDisplay = useMemo(() => {
    const h = parseRupiahToNumber(form.hargaBulanan);
    const deposit = parseRupiahToNumber(form.bookingFee);
    const bulan = Math.max(0, Math.floor(Number(form.periodeSewa) || 0));

    if (form.status === "Stay") {
      const hasH = Boolean(form.hargaBulanan.replace(/\D/g, ""));
      const hasD = Boolean(form.bookingFee.replace(/\D/g, ""));
      if (!hasH && !hasD && bulan === 0) return "—";
      const total = h * bulan + deposit;
      const formatted = Math.abs(total).toLocaleString("id-ID");
      return total < 0 ? `Rp -${formatted}` : `Rp ${formatted}`;
    }

    const hasH = Boolean(form.hargaBulanan.replace(/\D/g, ""));
    const hasB = Boolean(form.bookingFee.replace(/\D/g, ""));
    if (!hasH && !hasB && bulan === 0) return "—";
    const sisa = h * bulan - deposit;
    const formatted = Math.abs(sisa).toLocaleString("id-ID");
    return sisa < 0 ? `Rp -${formatted}` : `Rp ${formatted}`;
  }, [form.status, form.hargaBulanan, form.bookingFee, form.periodeSewa]);

  const profilePanelDerived = useMemo(() => {
    if (!penghuniProfileRow) return null;
    const r = penghuniProfileRow;
    const h = parseRupiahToNumber(r.hargaBulanan);
    const bulan = Math.max(0, Math.floor(Number(r.periodeSewa) || 0));
    const sewaTotal = h * bulan;
    const bookingFeeNum = parseRupiahToNumber(r.bookingFee);
    const sisaBooking = sewaTotal - bookingFeeNum;
    const sisaFormatted =
      r.status === "Booking"
        ? `${sisaBooking < 0 ? "−" : ""}Rp ${Math.abs(sisaBooking).toLocaleString("id-ID")}`
        : null;
    return {
      depositLabel: r.status === "Stay" ? "Deposit kamar" : "Booking fee",
      depositFormatted: formatRupiahRingkasan(r.bookingFee),
      sewaFormatted: `Rp ${sewaTotal.toLocaleString("id-ID")}`,
      hargaBulanFormatted: formatRupiahRingkasan(r.hargaBulanan),
      periodeBulan: bulan,
      sisaPembayaranBookingFormatted: sisaFormatted,
    };
  }, [penghuniProfileRow]);

  /** Referensi sewa profil (harga × periode) vs nominal input panel — selisih = input − referensi. */
  const sewaPaymentDerived = useMemo(() => {
    if (!penghuniProfileRow) return null;
    const r = penghuniProfileRow;
    const h = parseRupiahToNumber(r.hargaBulanan);
    const bulan = Math.max(0, Math.floor(Number(r.periodeSewa) || 0));
    const referensiProfil = h * bulan;
    const nominalInput = parseRupiahToNumber(sewaPaymentNominal);
    const selisih = nominalInput - referensiProfil;
    return { referensiProfil, nominalInput, selisih };
  }, [penghuniProfileRow, sewaPaymentNominal]);

  const depositPaymentDerived = useMemo(() => {
    if (!penghuniProfileRow) return null;
    const referensiProfil = parseRupiahToNumber(penghuniProfileRow.bookingFee);
    const nominalInput = parseRupiahToNumber(depositPaymentNominal);
    const selisih = nominalInput - referensiProfil;
    return { referensiProfil, nominalInput, selisih };
  }, [penghuniProfileRow, depositPaymentNominal]);

  const financeRowsForNotaCheck = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as FinanceRow[];
    return readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const activePaymentNotaTrimmed = useMemo(() => {
    if (showSewaPaymentPanel) return sewaPaymentNoNota.trim();
    if (showDepositPaymentPanel) return depositPaymentNoNota.trim();
    return "";
  }, [showSewaPaymentPanel, showDepositPaymentPanel, sewaPaymentNoNota, depositPaymentNoNota]);

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

  const filteredPenghuniForList = useMemo(
    () => filteredData.filter((row) => row.status === "Booking" || row.status === "Stay"),
    [filteredData]
  );

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
    const nums = source
      .filter(
        (r) =>
          r.lokasiKos === form.lokasiKos &&
          r.unitBlok === form.unitBlok &&
          r.status === "Available"
      )
      .map((r) => r.noKamar)
      .filter(Boolean);

    const merged = new Set(nums);
    if (editingId && (form.status === "Booking" || form.status === "Stay")) {
      const ed = data.find((p) => p.id === editingId);
      const cur = ed?.noKamar;
      if (
        cur &&
        cur !== "All Room" &&
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
      if (form.noKamar !== "" && form.noKamar !== "All Room") {
        setForm((prev) => ({ ...prev, noKamar: "" }));
      }
      return;
    }
    if (!availableRoomNumbers.includes(form.noKamar)) {
      setForm((prev) => ({ ...prev, noKamar: availableRoomNumbers[0] ?? "" }));
    }
  }, [availableRoomNumbers, form.status, form.noKamar]);

  useEffect(() => {
    if (!localDemoMode) {
      setData(initialData);
      setSurveyCalon([]);
      return;
    }
    if (!sandboxReady) return;
    const rawPen = readSandboxJson<Array<PenghuniRow & { status?: string }>>(SB_KEY.penghuni, initialData);
    const legacy = rawPen.filter((p) => String(p.status) === "Survey");
    let nextPen = rawPen.filter((p) => String(p.status) !== "Survey").map((r) => ({
      ...(r as PenghuniRow),
      bookingFee: (r as PenghuniRow).bookingFee ?? "",
      sewaKamarPaid: Boolean((r as PenghuniRow).sewaKamarPaid),
      sewaKamarNota: String((r as PenghuniRow).sewaKamarNota ?? ""),
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
    setData(nextPen.length ? nextPen : initialData);
    setSurveyCalon(nextSurvey);
  }, [localDemoMode, initialData, sandboxRev, sandboxReady]);

  const mapDbRowToUi = (row: Record<string, unknown>): PenghuniRow => {
    const statusRaw = String(row.status ?? "Booking");
    const status: PenghuniStatus = statusRaw === "Stay" ? "Stay" : "Booking";

    const mapped: PenghuniRow = {
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
      status,
      keterangan: String(row.keterangan ?? ""),
      sewaKamarPaid: Boolean(row.sewa_kamar_paid),
      sewaKamarNota: String(row.sewa_kamar_nota ?? ""),
      depositKamarPaid: Boolean(row.deposit_kamar_paid),
      depositKamarNota: String(row.deposit_kamar_nota ?? ""),
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
        sewaKamarPaid: Boolean(r.sewaKamarPaid),
        sewaKamarNota: String(r.sewaKamarNota ?? ""),
        depositKamarPaid: Boolean(r.depositKamarPaid),
        depositKamarNota: String(r.depositKamarNota ?? ""),
      }));
      const normalized = mapped.map((r) => sanitizePenghuniPaymentFlags(r));
      const drift = mapped.some((p, i) => {
        const n = normalized[i];
        return (
          Boolean(p.sewaKamarPaid) !== Boolean(n.sewaKamarPaid) ||
          String(p.sewaKamarNota ?? "") !== String(n.sewaKamarNota ?? "") ||
          Boolean(p.depositKamarPaid) !== Boolean(n.depositKamarPaid) ||
          String(p.depositKamarNota ?? "") !== String(n.depositKamarNota ?? "")
        );
      });
      if (drift) {
        writeSandboxJson(SB_KEY.penghuni, normalized);
      }
      setData(normalized.filter((p) => p.status === "Booking" || p.status === "Stay"));
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
    }
    setData(rows.map((row) => mapDbRowToUi(row)));

    const { data: kamarData, error: kamarError } = await supabase
      .from("kamar")
      .select("*")
      .order("no_kamar", { ascending: true });

    if (kamarError) {
      setErrorMessage(kamarError.message);
      setIsLoading(false);
      return false;
    }
    setCloudKamarRows((kamarData ?? []).map((row) => mapKamarDbToUi(row as Record<string, unknown>)));
    setIsLoading(false);
    return true;
  };

  const loadPenghuniRef = useRef(loadPenghuni);
  loadPenghuniRef.current = loadPenghuni;

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
      const fresh = data.find((p) => p.id === prev.id);
      if (!fresh) return prev;
      if (
        fresh.sewaKamarPaid === prev.sewaKamarPaid &&
        String(fresh.sewaKamarNota ?? "") === String(prev.sewaKamarNota ?? "") &&
        fresh.depositKamarPaid === prev.depositKamarPaid &&
        String(fresh.depositKamarNota ?? "") === String(prev.depositKamarNota ?? "")
      ) {
        return prev;
      }
      return fresh;
    });
  }, [data]);

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
      : [...CLOUD_FALLBACK_UNIT];
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
          : [...CLOUD_FALLBACK_UNIT];
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
      harga_bulanan: parseRupiahToNumber(form.hargaBulanan),
      booking_fee: parseRupiahToNumber(form.bookingFee),
      no_wa: form.noWa,
      status: form.status,
      keterangan: form.keterangan,
      sewa_kamar_paid: existingPenghuniRow?.sewaKamarPaid ?? false,
      sewa_kamar_nota: existingPenghuniRow?.sewaKamarNota?.trim() || null,
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
        hargaBulanan: String(parseRupiahToNumber(form.hargaBulanan)),
        bookingFee: String(parseRupiahToNumber(form.bookingFee)),
        noWa: form.noWa,
        status: form.status,
        keterangan: form.keterangan,
        sewaKamarPaid: existingPenghuniRow?.sewaKamarPaid ?? false,
        sewaKamarNota: existingPenghuniRow?.sewaKamarNota ?? "",
        depositKamarPaid: existingPenghuniRow?.depositKamarPaid ?? false,
        depositKamarNota: existingPenghuniRow?.depositKamarNota ?? "",
        createdAt: new Date().toISOString(),
      };
      const next = editingId
        ? data.map((row) => (row.id === editingId ? { ...base, id: editingId } : row))
        : [base, ...data];
      setData(next);
      writeSandboxJson(SB_KEY.penghuni, next);
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, next));
      toast(
        editingId ? "Data penghuni berhasil diperbarui (demo lokal)." : "Data penghuni berhasil disimpan (demo lokal).",
        "success"
      );
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
    setEditingId(row.id);
    setForm({
      namaLengkap: row.namaLengkap,
      lokasiKos: row.lokasiKos || lokasiFormOptions[0] || "",
      unitBlok: (() => {
        const loc = row.lokasiKos || lokasiFormOptions[0] || "";
        const units = localDemoMode
          ? buildDemoUnitList(sandboxReady, loc, kamarSandboxRows, rowsForDemoMerge)
          : [...CLOUD_FALLBACK_UNIT];
        return row.unitBlok && units.includes(row.unitBlok) ? row.unitBlok : units[0] ?? "";
      })(),
      noKamar: row.noKamar || availableRoomNumbers[0] || "",
      periodeSewa: row.periodeSewa || "1",
      tglCheckIn: row.tglCheckIn || "",
      tglCheckOut: row.tglCheckOut || "",
      hargaBulanan: formatRupiahInput(row.hargaBulanan || ""),
      bookingFee: formatRupiahInput(row.bookingFee || ""),
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
      const next = data.filter((row) => row.id !== id);
      setData(next);
      writeSandboxJson(SB_KEY.penghuni, next);
      const kamarSnapshot = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
      writeSandboxJson(SB_KEY.kamar, syncKamarRowsWithPenghuniList(kamarSnapshot, next));
      if (editingId === id) resetForm();
      return true;
    }

    const { error } = await supabase.from("penghuni").delete().eq("id", id);
    if (error) {
      setErrorMessage(error.message);
      toast(error.message, "error");
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
      : [...CLOUD_FALLBACK_UNIT];
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
          : [...CLOUD_FALLBACK_UNIT];
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

  const handleSurveySubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!localDemoMode) {
      const msg = "Data survey calon hanya disimpan saat demo lokal aktif.";
      setSurveyError(msg);
      toast(msg, "error");
      return;
    }
    setSurveySubmitting(true);
    setSurveyError("");
    setSurveyInfo("");
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

  const handleSurveyDelete = (id: string): boolean => {
    if (!localDemoMode) {
      const msg = "Hapus survey tersedia saat demo lokal aktif.";
      setSurveyError(msg);
      toast(msg, "error");
      return false;
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
    const ok = await confirm({
      title: "Hapus data penghuni?",
      message: `Anda akan menghapus "${row.namaLengkap}" (${row.lokasiKos} · ${row.unitBlok} / ${row.noKamar}). Tindakan ini tidak dapat dibatalkan di mode cloud.`,
      confirmLabel: "Ya, hapus",
      cancelLabel: "Batal",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info");
      return;
    }
    const deleted = await handleDelete(row.id);
    if (deleted) {
      toast("Data penghuni berhasil dihapus.", "success");
    }
  };

  const deleteSurveyWithConfirm = async (row: SurveyCalonRow) => {
    const ok = await confirm({
      title: "Hapus calon survey?",
      message: `Anda akan menghapus "${row.namaLengkap}" dari daftar survey.`,
      confirmLabel: "Ya, hapus",
      cancelLabel: "Batal",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info");
      return;
    }
    const deleted = handleSurveyDelete(row.id);
    if (deleted) {
      toast("Data survey berhasil dihapus.", "success");
    }
  };

  const openSettlementPanel = (row: PenghuniRow) => {
    setPenghuniProfileRow(row);
    setShowPenghuniForm(false);
    setShowSewaPaymentPanel(false);
    setShowDepositPaymentPanel(false);
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
    if (penghuniProfileRow.status === "Booking") {
      if (!String(penghuniProfileRow.tglCheckIn ?? "").trim()) {
        toast("Isi rencana check-in terlebih dahulu (data penghuni).", "error");
        return;
      }
      if (bulan <= 0) {
        toast("Periode sewa harus lebih dari 0 bulan.", "error");
        return;
      }
    }
    setSewaPaymentNominal(formatRupiahInput(String(h * bulan)));
    setSewaPaymentNoNota("");
    setShowDepositPaymentPanel(false);
    setShowSewaPaymentPanel(true);
  };

  const openDepositPaymentPanel = () => {
    if (!penghuniProfileRow) return;
    setDepositPaymentNominal(formatRupiahInput(penghuniProfileRow.bookingFee || ""));
    setDepositPaymentNoNota("");
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
    const noNota = sewaPaymentNoNota.trim();
    if (!noNota) {
      toast("Isi No. nota sesuai nota asli.", "error");
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
    let tglCheckOutBaru = "";
    if (row.status === "Booking") {
      if (!String(row.tglCheckIn ?? "").trim()) {
        toast("Rencana check-in dan periode sewa harus valid untuk mengubah status jadi Stay.", "error");
        return;
      }
      tglCheckOutBaru = addCalendarMonthsToIsoDate(row.tglCheckIn, bulan);
      if (!tglCheckOutBaru) {
        toast("Tanggal check-out tidak bisa dihitung dari rencana check-in.", "error");
        return;
      }
    }

    const paymentDate = new Date().toISOString().slice(0, 10);
    const monthStarts = buildSewaSplitCalendarMonthStarts(row.tglCheckIn, bulan, paymentDate);
    if (monthStarts.length !== bulan) {
      toast("Tidak dapat membuat alokasi bulan P&L. Periksa tanggal check-in penghuni.", "error");
      return;
    }
    const nominalParts = splitNominalRupiahEqualParts(nominalNum, bulan);
    const paymentSplitGroupId =
      typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : newSandboxId();

    const hitungText = `Perhitungan: ${formatRpNumber(nominalNum)} − ${formatRpNumber(referensiProfil)} = ${formatRpNumber(selisih)}.`;
    const statusNote =
      row.status === "Booking"
        ? ` Status penghuni berubah menjadi Stay; tgl check-out otomatis ${tglCheckOutBaru} (rencana check-in + ${bulan} bulan).`
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

    if (localDemoMode) {
      const updatedPen = data.map((p) =>
        p.id === row.id
          ? {
              ...p,
              sewaKamarPaid: true,
              sewaKamarNota: noNota,
              ...(row.status === "Booking"
                ? { status: "Stay" as PenghuniStatus, tglCheckOut: tglCheckOutBaru }
                : {}),
            }
          : p
      );
      setData(updatedPen);
      writeSandboxJson(SB_KEY.penghuni, updatedPen);
      setPenghuniProfileRow({
        ...row,
        sewaKamarPaid: true,
        sewaKamarNota: noNota,
        ...(row.status === "Booking"
          ? { status: "Stay" as PenghuniStatus, tglCheckOut: tglCheckOutBaru }
          : {}),
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
          tanggal: pel,
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
          tanggal: pel,
          pelaporan_bulan: pel,
          payment_split_group_id: paymentSplitGroupId,
          nama_penghuni: row.namaLengkap,
          nominal: nominalParts[idx] ?? 0,
          keterangan: keteranganFin,
          lokasi_kos: row.lokasiKos,
          unit_blok: row.unitBlok,
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
      };
      if (row.status === "Booking") {
        penUpdate.status = "Stay";
        penUpdate.tgl_check_out = tglCheckOutBaru;
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
              ...(row.status === "Booking"
                ? { status: "Stay" as PenghuniStatus, tglCheckOut: tglCheckOutBaru }
                : {}),
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
    const noNota = depositPaymentNoNota.trim();
    if (!noNota) {
      toast("Isi No. nota sesuai nota asli.", "error");
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
    const hitungText = `Perhitungan: ${formatRpNumber(nominalNum)} − ${formatRpNumber(referensiProfil)} = ${formatRpNumber(selisih)}.`;
    const ok = await confirm({
      title: "Konfirmasi payment deposit kamar?",
      message: `${hitungText} Catat pembayaran deposit (nota ${noNota}) untuk ${row.namaLengkap}? Nominal di Finance mengikuti nilai input panel (${formatRpNumber(nominalNum)}). Status deposit ditandai lunas.`,
      confirmLabel: "Ya, konfirmasi",
      cancelLabel: "Batal",
    });
    if (!ok) {
      toast("Konfirmasi dibatalkan.", "info");
      return;
    }

    const tanggal = new Date().toISOString().slice(0, 10);
    const keteranganFin = `Payment deposit kamar · ${row.unitBlok} / ${row.noKamar} · ${hitungText}`;

    if (localDemoMode) {
      const updatedPen = data.map((p) =>
        p.id === row.id ? { ...p, depositKamarPaid: true, depositKamarNota: noNota } : p
      );
      setData(updatedPen);
      writeSandboxJson(SB_KEY.penghuni, updatedPen);
      setPenghuniProfileRow({ ...row, depositKamarPaid: true, depositKamarNota: noNota });
      const fin = readSandboxJson<FinanceRow[]>(SB_KEY.finance, []);
      const finRow: FinanceRow = {
        id: newSandboxId(),
        noNota,
        kategori: "Pemasukan",
        pos: FINANCE_POS_DEPOSIT_KAMAR,
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
        pos: FINANCE_POS_DEPOSIT_KAMAR,
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
      const { error: penErr } = await supabase
        .from("penghuni")
        .update({ deposit_kamar_paid: true, deposit_kamar_nota: noNota })
        .eq("id", row.id);
      if (penErr) {
        toast(penErr.message, "error");
        return;
      }
      await loadPenghuni();
      setPenghuniProfileRow((prev) =>
        prev && prev.id === row.id ? { ...prev, depositKamarPaid: true, depositKamarNota: noNota } : prev
      );
    }

    setShowDepositPaymentPanel(false);
    toast(`${hitungText} Payment deposit kamar berhasil dicatat.`, "success");
  };

  const closePenghuniModal = () => {
    resetForm();
    setShowPenghuniForm(false);
    setStatusMenuOpen(false);
    setPenghuniProfileRow(null);
    setShowSewaPaymentPanel(false);
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
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={togglePenghuniBaru}
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] shadow-sm transition-colors ${
                  showPenghuniForm
                    ? "border-[#4a3624] bg-[#5c4330] text-[#fff8eb] ring-2 ring-[#c09c70]/50 dark:border-[#c9a574] dark:bg-[#3d2d1f] dark:text-[#f0dcc4]"
                    : "border-[#a67c48] bg-[#c49a6a] text-white hover:border-[#3d2a18] hover:bg-[#3d2918] hover:text-[#fff8eb] dark:border-[#7a5c3a] dark:bg-[#5c452d] dark:text-[#f5e8d4] dark:hover:border-[#2a1810] dark:hover:bg-[#1f140e]"
                }`}
              >
                Penghuni Baru
              </button>
              <RefreshToolbarButton onRefresh={handleRefreshPenghuni} disabled={isLoading} />
            </div>
          </div>

          <div className="mb-3 grid gap-3 sm:grid-cols-2 md:grid-cols-3 md:items-end">
            <div className="flex min-w-0 flex-col">
              <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
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
              <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
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

          <div className="mb-4 max-h-[min(320px,45vh)] overflow-y-auto rounded-2xl border border-[#eadcc9] dark:border-[#3d2f22]">
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 bg-[#f8efe2] text-xs uppercase tracking-[0.12em] text-[#8f724d] dark:bg-[#2b2016] dark:text-[#c8a97f]">
                <tr>
                  <th className="px-3 py-2">Nama</th>
                  <th className="px-3 py-2">Lokasi</th>
                  <th className="px-3 py-2">Unit / Kamar</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Check-in</th>
                  <th className="px-3 py-2">Check-out</th>
                  <th className="px-3 py-2">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td className="px-3 py-4 text-[#856948]" colSpan={7}>
                      Memuat…
                    </td>
                  </tr>
                ) : sortedByCheckOut.length === 0 ? (
                  <tr>
                    <td className="px-3 py-4 text-[#856948]" colSpan={7}>
                      Belum ada penghuni (Booking/Stay) untuk filter ini.
                    </td>
                  </tr>
                ) : (
                  sortedByCheckOut.map((row) => (
                    <tr
                      key={row.id}
                      className={`cursor-pointer border-t border-[#efe2d1] dark:border-[#33261b] ${
                        penghuniHasOutstandingPayments(row)
                          ? "border-l-[3px] border-l-amber-500 bg-amber-50/90 dark:border-l-amber-400 dark:bg-amber-950/35"
                          : ""
                      }`}
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
                      <td className="px-3 py-2">{row.namaLengkap}</td>
                      <td className="px-3 py-2">{row.lokasiKos}</td>
                      <td className="px-3 py-2">
                        {row.unitBlok} / {row.noKamar}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-3 py-2">{row.tglCheckIn || "—"}</td>
                      <td className="px-3 py-2">{row.tglCheckOut || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <ActionButtonWithIcon
                            icon={CreditCard}
                            onClick={() => openSettlementPanel(row)}
                            disabled={!penghuniHasOutstandingPayments(row)}
                            label="Settlement"
                            className="rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>
                      </td>
                    </tr>
                  ))
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
              Urut berdasarkan rencana check-in. Form survey dibuka lewat popup (demo lokal).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleSurveyBaru}
              className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] shadow-sm transition-colors ${
                showSurveyForm
                  ? "border-amber-800 bg-amber-900 text-amber-50 ring-2 ring-amber-500/40 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
                  : "border-amber-600 bg-amber-500 text-amber-950 hover:border-amber-900 hover:bg-amber-800 hover:text-amber-50 dark:border-amber-500 dark:bg-amber-600 dark:text-amber-950 dark:hover:border-amber-300 dark:hover:bg-amber-800 dark:hover:text-amber-50"
              }`}
            >
              Survey Baru
            </button>
            <RefreshToolbarButton onRefresh={handleRefreshPenghuni} disabled={isLoading} />
          </div>
        </div>

        <div className="mb-4 max-h-[min(320px,45vh)] overflow-y-auto rounded-2xl border border-amber-100 dark:border-[#4a3a22]">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-amber-50 text-xs uppercase tracking-[0.12em] text-[#8f6a2d] dark:bg-[#2f2618] dark:text-[#dcb97a]">
              <tr>
                <th className="px-2 py-2">Nama</th>
                <th className="px-2 py-2">Lokasi</th>
                <th className="px-2 py-2">Unit</th>
                <th className="px-2 py-2">Rencana CI</th>
                <th className="px-2 py-2">Negosiasi</th>
                <th className="px-2 py-2">WA</th>
                <th className="px-2 py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {!localDemoMode ? (
                <tr>
                  <td className="px-3 py-4 text-[#856948]" colSpan={7}>
                    Aktifkan demo lokal untuk daftar dan form survey.
                  </td>
                </tr>
              ) : sortedSurveyRows.length === 0 ? (
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
                        <ActionButtonWithIcon
                          icon={MessageCircle}
                          onClick={() => handleSendSurveyWa(row)}
                          label="Kirim WA"
                          className="rounded-full bg-green-600 px-2 py-1 text-[10px] font-semibold text-white"
                        />
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
          className="absolute inset-0 bg-black/55 transition hover:bg-black/65"
          onClick={() => {
            setShowSewaPaymentPanel(false);
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
              <div className="relative">
                <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                  {penghuniProfileRow.status === "Booking" ? "Booking fee" : profilePanelDerived.depositLabel}
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
                    Sisa pembayaran
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">
                    {profilePanelDerived.sisaPembayaranBookingFormatted}
                  </p>
                  <p className="mt-1 text-xs text-[#6e5336] dark:text-[#bfa27f]">
                    (Harga bulanan × periode sewa) − booking fee
                  </p>
                </div>
              ) : null}
              {penghuniProfileRow.status === "Stay" ? (
                <div className="relative">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">Harga sewa kamar</p>
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
                      {profilePanelDerived.sewaFormatted}
                    </p>
                    <p className="mt-1 text-xs text-[#6e5336] dark:text-[#bfa27f]">
                      {profilePanelDerived.hargaBulanFormatted} × {profilePanelDerived.periodeBulan} bulan
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
              {penghuniProfileRow.status === "Booking" ? (
                <>
                  <button
                    type="button"
                    disabled={
                      Boolean(penghuniProfileRow.depositKamarPaid) ||
                      parseRupiahToNumber(penghuniProfileRow.bookingFee) <= 0
                    }
                    onClick={openDepositPaymentPanel}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Wallet size={18} aria-hidden />
                    Payment Booking
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(penghuniProfileRow.sewaKamarPaid) ||
                      !String(penghuniProfileRow.tglCheckIn ?? "").trim() ||
                      Math.max(0, Math.floor(Number(penghuniProfileRow.periodeSewa) || 0)) <= 0
                    }
                    onClick={openSewaPaymentPanel}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CreditCard size={18} aria-hidden />
                    Payment sewa kamar
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={Boolean(penghuniProfileRow.sewaKamarPaid)}
                    onClick={openSewaPaymentPanel}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <CreditCard size={18} aria-hidden />
                    Payment sewa kamar
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(penghuniProfileRow.depositKamarPaid) ||
                      parseRupiahToNumber(penghuniProfileRow.bookingFee) <= 0
                    }
                    onClick={openDepositPaymentPanel}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Wallet size={18} aria-hidden />
                    Payment deposit kamar
                  </button>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setShowSewaPaymentPanel(false);
                setShowDepositPaymentPanel(false);
                setPenghuniProfileRow(null);
              }}
              className="mt-4 self-end rounded-full border border-[#d5be9e] px-4 py-2 text-xs font-semibold text-[#6d5232] transition hover:bg-[#efe2d1] dark:border-[#4f3b2a] dark:text-[#d9bb94] dark:hover:bg-[#33261b]"
            >
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
          className="min-h-0 min-w-0 flex-1 bg-black/40 transition hover:bg-black/50"
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
              <input
                id="penghuni-sewa-payment-nota"
                type="text"
                autoComplete="off"
                value={sewaPaymentNoNota}
                onChange={(e) => setSewaPaymentNoNota(e.target.value)}
                aria-invalid={Boolean(paymentNotaConflictMessage)}
                aria-describedby={
                  paymentNotaConflictMessage ? "penghuni-sewa-payment-nota-alert" : undefined
                }
                className={`mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-[#2c2218] outline-none dark:bg-[#1f1710] dark:text-[#f5e8d4] ${
                  paymentNotaConflictMessage
                    ? "border-red-400 ring-2 ring-red-200 focus:ring-2 focus:ring-red-300 dark:border-red-500/80 dark:ring-red-900/40"
                    : "border-[#d5be9e] focus:ring-2 focus:ring-emerald-500/30 dark:border-[#4f3b2a]"
                }`}
                placeholder="Nomor nota asli"
              />
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
              disabled={Boolean(paymentNotaConflictMessage)}
              onClick={() => void handleSewaPaymentSekarang()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CreditCard size={18} aria-hidden />
              Payment sekarang
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
          className="min-h-0 min-w-0 flex-1 bg-black/40 transition hover:bg-black/50"
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
                <Wallet size={22} aria-hidden />
              </span>
              <div>
                <p id="deposit-payment-panel-title" className="text-xs uppercase tracking-[0.2em] text-[#9d7e55] dark:text-[#cfb089]">
                  Input payment
                </p>
                <h2 className="mt-1 text-lg font-semibold text-[#2c2218] dark:text-[#f5e8d4]">deposit kamar</h2>
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
                value={FINANCE_POS_DEPOSIT_KAMAR}
                className="mt-1 w-full rounded-xl border border-[#d5be9e] bg-[#f3ebe0] px-3 py-2.5 text-[#2c2218] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#f5e8d4]"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                No. nota <span className="text-red-600 dark:text-red-400">*</span>
              </span>
              <input
                id="penghuni-deposit-payment-nota"
                type="text"
                autoComplete="off"
                value={depositPaymentNoNota}
                onChange={(e) => setDepositPaymentNoNota(e.target.value)}
                aria-invalid={Boolean(paymentNotaConflictMessage)}
                aria-describedby={
                  paymentNotaConflictMessage ? "penghuni-deposit-payment-nota-alert" : undefined
                }
                className={`mt-1 w-full rounded-xl border bg-white px-3 py-2.5 text-[#2c2218] outline-none dark:bg-[#1f1710] dark:text-[#f5e8d4] ${
                  paymentNotaConflictMessage
                    ? "border-red-400 ring-2 ring-red-200 focus:ring-2 focus:ring-red-300 dark:border-red-500/80 dark:ring-red-900/40"
                    : "border-[#d5be9e] focus:ring-2 focus:ring-violet-500/30 dark:border-[#4f3b2a]"
                }`}
                placeholder="Nomor nota asli"
              />
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
                <span className="font-semibold">Perhitungan (saat Payment sekarang):</span> nominal input − referensi deposit
                profil (booking fee / deposit di data penghuni) = selisih.
                <br />
                {formatRpNumber(depositPaymentDerived.nominalInput)} −{" "}
                {formatRpNumber(depositPaymentDerived.referensiProfil)} ={" "}
                <span className="font-semibold">{formatRpNumber(depositPaymentDerived.selisih)}</span>
              </p>
            ) : null}
            <p className="text-xs text-[#6e5336] dark:text-[#bfa27f]">
              Referensi: {penghuniProfileRow.lokasiKos || "—"} · {penghuniProfileRow.unitBlok} / {penghuniProfileRow.noKamar}
            </p>
          </div>

          <div className="border-t border-[#eadcc9] p-5 dark:border-[#3d2f22]">
            <button
              type="button"
              onClick={() => void handleDepositPaymentSekarang()}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-violet-700"
            >
              <Wallet size={18} aria-hidden />
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
          className="absolute inset-0 bg-black/50 transition hover:bg-black/60"
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
              className="rounded-full p-2 text-[#6e5336] transition hover:bg-[#efe2d1] hover:text-[#2c2218] dark:text-[#d9bc95] dark:hover:bg-[#33261b]"
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
                    placeholder="1.800.000"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                  {form.status === "Stay" ? "Deposit Kamar" : "Booking Fee"}
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
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                  {form.status === "Stay" ? "TOTAL PEMBAYARAN" : "Sisa Pembayaran"}
                </label>
                <div className="flex w-full items-center rounded-2xl border border-[#dcc7aa] bg-[#f5efe6] px-4 py-2.5 text-sm font-medium text-[#2c2218] dark:border-[#4d3925] dark:bg-[#2b2016] dark:text-[#f5e8d4]">
                  {pembayaranRingkasanDisplay}
                </div>
                <p className="mt-1 text-[10px] text-[#8b6d48] dark:text-[#b79a78]">
                  {form.status === "Stay"
                    ? "Dihitung: (Harga Bulanan × Periode Sewa) + Deposit Kamar"
                    : "Dihitung: (Harga Bulanan × Periode Sewa) − Booking Fee"}
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
          className="absolute inset-0 bg-black/50 transition hover:bg-black/60"
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
                {localDemoMode ? "Calon penghuni (demo lokal)" : "Survey memerlukan demo lokal"}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeSurveyModal}
              className="rounded-full p-2 text-amber-900 transition hover:bg-amber-200/80 dark:text-amber-100 dark:hover:bg-amber-900/50"
              aria-label="Tutup form"
            >
              <X size={20} />
            </button>
          </div>

          {localDemoMode ? (
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
          ) : (
            <p className="text-sm text-[#856948] dark:text-[#b79a78]">
              Aktifkan demo lokal di header untuk menyimpan data survey di browser Anda.
            </p>
          )}
        </div>
      </div>
    ) : null}
    </section>
  );
}
