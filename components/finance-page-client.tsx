"use client";

import {
  type Dispatch,
  type SetStateAction,
  FormEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useCallback,
  useRef,
  useState,
} from "react";
import { supabase } from "@/libsupabaseClient";
import { Ban, Eye, FileText, HandCoins, Pencil, Plus, ReceiptText, RotateCcw, Save, Search, X } from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import BrandLoader from "@/components/ui/brand-loader";
import RefreshToolbarButton from "@/components/ui/refresh-toolbar-button";
import LaporanLengkapChoiceModal from "@/components/laporan-lengkap-choice-modal";
import StatusBadge from "@/components/ui/status-badge";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useSupabaseSessionHydrated } from "@/components/supabase-session-ready";
import { useCloudDataResyncTick } from "@/components/cloud-resync-hook";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY, newSandboxId } from "@/lib/sandbox-storage";
import {
  clearPenghuniPaymentLinkedToFinanceRow,
  countFinanceRowsWithSameNotaAndPosKind,
  FINANCE_POS_SEWA_KAMAR,
  isBookingFeeFinancePos,
  isDepositFinancePos,
  isSewaKamarFinancePos,
} from "@/lib/penghuni-finance-payment-sync";
import type { PenghuniRow } from "@/components/penghuni-page-client";
import type { KamarRow } from "@/components/kamar-page-client";
import { buildDemoLokasiList, buildDemoUnitList } from "@/lib/demo-form-options";
import { pelaporanBulanIsoFromDbRecord } from "@/lib/finance-pelaporan-bulan-from-db";
import { planSewaSplitBookingFeeFirstMonthReallocation } from "@/lib/finance-sewa-split-reallocate";
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
  SR_NOTA_MAX_DIGITS,
} from "@/lib/finance-nota-validation";
import { readDemoProfileSession } from "@/lib/demo-auth";
import type { ReportKamarRow } from "@/lib/laporan-export-types";
import { normalizeUserProfileRole } from "@/lib/user-profile-role";
import type { PengeluaranScope } from "@/lib/pengeluaran-scope";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";
import { buildLaporanExportPayloadV1 } from "@/lib/laporan-export-payload";
import type { LaporanFokusCetak } from "@/lib/laporan-cetak-filters";
import { financePageRowToReportRow } from "@/lib/laporan-finance-page-row-to-report";
import {
  isForcedPemasukanManajemenFinancePos,
  isPengeluaranKosReportRow,
} from "@/lib/laporan-finance-breakdown";
import { computeMonthlyChartData } from "@/lib/laporan-monthly-chart-data";
import { openLaporanCetakTabWithPayload } from "@/lib/laporan-open-cetak-tab";
import {
  financeRowInPelaporanYmdInclusiveRange,
  financeRowInYmdInclusiveRange,
  parseYmdLocal,
  ymdRangeInvalidOrTooLong,
} from "@/lib/laporan-report-dates";
import { openFinanceInvoiceTab } from "@/lib/finance-open-invoice-tab";
import { fetchKamarPenghuniSurveyForLaporanExport } from "@/lib/laporan-side-export-load";
import {
  pageFieldWarmClass,
  pageHeroSectionClass,
  pageLabelWarmClass,
  pageSectionTitleClass,
  pageTextareaWarmClass,
  pageWarmChoiceClass,
} from "@/lib/ui-page-layout";

type FinanceType = "Pemasukan" | "Pengeluaran";
type PemasukanScope = "kos" | "manajemen";
type PemasukanKind = "sewa_kamar" | "booking_fee" | "lain";

export type FinanceRow = {
  id: string;
  noNota: string;
  kategori: FinanceType;
  pos: string;
  /** Hanya baris Pengeluaran — selaras POS Master (kos vs manajemen). */
  pengeluaranScope?: PengeluaranScope | null;
  /** Hanya baris Pemasukan — kos vs manajemen (dari Master). */
  pemasukanScope?: PemasukanScope | null;
  /** Hanya baris Pemasukan — sewa_kamar | booking_fee | lain (dari Master). */
  pemasukanKind?: PemasukanKind | null;
  tanggal: string;
  namaPenghuni: string;
  lokasiKos: string;
  unitBlok: string;
  nominal: string;
  keterangan: string;
  /** Tanggal 1 bulan kalender untuk P&L / dashboard owner (YYYY-MM-DD). */
  pelaporanBulan?: string;
  /** Mengelompokkan pecahan pembayaran sewa (nota sama). */
  paymentSplitGroupId?: string;
  /** Timestamp update terakhir (untuk urutan recent update). */
  updatedAt?: string;
};

export type FinancePosOption = {
  id: string;
  label: string;
  /** Jika diisi (Supabase / master), POS difilter menurut kategori form. */
  tipe?: FinanceType;
  /** Hanya POS Pengeluaran dari Master. */
  pengeluaranScope?: PengeluaranScope;
  /** Hanya POS Pemasukan dari Master. */
  pemasukanScope?: PemasukanScope;
  /** Hanya POS Pemasukan dari Master. */
  pemasukanKind?: PemasukanKind;
};

type FinanceForm = Omit<FinanceRow, "id" | "pelaporanBulan" | "paymentSplitGroupId"> & {
  pelaporanBulan: string;
  paymentSplitGroupId: string;
};

function formatRupiahInput(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  if (!digitsOnly) return "";
  return Number(digitsOnly).toLocaleString("id-ID");
}

function parseRupiahToNumber(value: string) {
  const digitsOnly = value.replace(/\D/g, "");
  return digitsOnly ? Number(digitsOnly) : 0;
}

function buildKamarStatusPie(rows: ReportKamarRow[]) {
  const counts = { Occupied: 0, Available: 0, Maintenance: 0 };
  rows.forEach((r) => {
    counts[r.status] += 1;
  });
  return [
    { name: "Occupied", value: counts.Occupied },
    { name: "Available", value: counts.Available },
    { name: "Maintenance", value: counts.Maintenance },
  ];
}

function filterRowsByFinanceLokasiUnit<T extends { lokasiKos: string; unitBlok: string }>(
  rows: T[],
  lokasi: string,
  unit: string
): T[] {
  return rows.filter(
    (r) =>
      (lokasi === "Semua Lokasi" || r.lokasiKos === lokasi) && (unit === "Semua Blok/Unit" || r.unitBlok === unit)
  );
}

/** Tampilan tabel / ringkasan: angka mentah atau terformat → Rp … (minus tetap terlihat). */
function formatNominalDisplay(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "—";
  const asNum = Number(s);
  const negative = Number.isFinite(asNum) ? asNum < 0 : /^-/.test(s.replace(/\s/g, ""));
  const digits = s.replace(/\D/g, "");
  if (!digits) return s;
  const absFormatted = `Rp ${Number(digits).toLocaleString("id-ID")}`;
  return negative ? `−${absFormatted}` : absFormatted;
}

function isPosSewaKamar(pos: string): boolean {
  return (pos ?? "").trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase();
}

/** Hanya baris Pemasukan dengan POS sewa kamar (untuk tabel room revenue). */
function isSewaKamarPemasukanRow(row: FinanceRow): boolean {
  return row.kategori === "Pemasukan" && isPosSewaKamar(row.pos);
}

/** Urutkan riwayat: tanggal input payment terbaru di atas. */
function sortFinanceRowsDesc(rows: FinanceRow[]): FinanceRow[] {
  return [...rows].sort((a, b) => {
    const td = String(b.tanggal || "").localeCompare(String(a.tanggal || ""));
    if (td !== 0) return td;
    // Stabil untuk nota yang sama / input sehari: yang terakhir diubah tetap di atas.
    const ud = String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
    if (ud !== 0) return ud;
    return String(b.id).localeCompare(String(a.id));
  });
}

function collectFinanceBoundaryYmds(
  rows: FinanceRow[],
  mode: "tanggal" | "pelaporan"
): string[] {
  const out: string[] = [];
  for (const r of rows) {
    if (mode === "pelaporan") {
      const pb = String(r.pelaporanBulan ?? "").trim().slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(pb)) {
        out.push(pb);
        continue;
      }
    }
    const t = String(r.tanggal ?? "").trim().slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) out.push(t);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Jika rentang > 1 tahun, geser mulai agar tetap valid (akhir tetap). */
function clampYmdRangeToMaxYear(startYmd: string, endYmd: string): { start: string; end: string } {
  if (!ymdRangeInvalidOrTooLong(startYmd, endYmd)) return { start: startYmd, end: endYmd };
  const end = parseYmdLocal(endYmd);
  if (Number.isNaN(end.getTime())) return { start: startYmd, end: endYmd };
  const start = new Date(end);
  start.setDate(start.getDate() - 365);
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const d = String(start.getDate()).padStart(2, "0");
  return { start: `${y}-${m}-${d}`, end: endYmd };
}

function sumNominalRows(rows: FinanceRow[]): number {
  return rows.reduce((sum, r) => sum + parseRupiahToNumber(r.nominal), 0);
}

function isPengeluaranManajemenRow(row: FinanceRow): boolean {
  return row.kategori === "Pengeluaran" && normalizePengeluaranScope(row.pengeluaranScope) === "manajemen";
}

function isPengeluaranKosRow(row: FinanceRow): boolean {
  return isPengeluaranKosReportRow(row);
}

/** Form Pengeluaran: lingkup memfilter POS (selaras kolom pengeluaran_scope di Master). */
function pengeluaranFormSkipsLocationUnit(scopeFilter: PengeluaranScope): boolean {
  return normalizePengeluaranScope(scopeFilter) === "manajemen";
}

const PLACEHOLDER_LOKASI_FORM = "(Belum ada data lokasi)";
const PLACEHOLDER_UNIT_FORM = "(Belum ada unit untuk lokasi ini)";
const PLACEHOLDER_LOKASI_PICK = "";
const LOKASI_PICK_LABEL = "Pilih lokasi kos";
const UNIT_PICK_LABEL = "Pilih blok/unit";
const UNIT_NEED_LOKASI_LABEL = "Pilih lokasi terlebih dahulu";

function isValidRealLokasiForPengeluaranKos(value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (v === PLACEHOLDER_LOKASI_FORM || v === LOKASI_PICK_LABEL) return false;
  if (v.startsWith("(Belum ada lokasi")) return false;
  return true;
}

function isValidRealUnitForPengeluaranKos(value: string): boolean {
  const v = String(value ?? "").trim();
  if (!v) return false;
  if (
    v === PLACEHOLDER_UNIT_FORM ||
    v === UNIT_PICK_LABEL ||
    v === UNIT_NEED_LOKASI_LABEL
  ) {
    return false;
  }
  if (v.startsWith("(Belum ada unit")) return false;
  return true;
}

type HoverKeteranganState = {
  id: string;
  text: string;
  namaPenghuni: string;
  kategori: FinanceType;
  x: number;
  y: number;
} | null;

function FinanceRiwayatTableBlock({
  title,
  hint,
  rows,
  isLoading,
  footerSumLabel,
  setHoverKeterangan,
  canEditPayment,
  onEditPayment,
  canCancelPemasukanPayment,
  onCancelPemasukanPayment,
  canCancelPengeluaranPayment,
  onCancelPengeluaranPayment,
  onRowDoubleClick,
  footerSumTone = "income",
}: {
  title: string;
  hint?: string;
  rows: FinanceRow[];
  isLoading: boolean;
  footerSumLabel: string;
  setHoverKeterangan: Dispatch<SetStateAction<HoverKeteranganState>>;
  canEditPayment?: boolean;
  onEditPayment?: (row: FinanceRow) => void;
  canCancelPemasukanPayment?: boolean;
  onCancelPemasukanPayment?: (row: FinanceRow) => void;
  canCancelPengeluaranPayment?: boolean;
  onCancelPengeluaranPayment?: (row: FinanceRow) => void;
  /** Double klik baris → buka invoice (print / PDF). */
  onRowDoubleClick?: (row: FinanceRow) => void;
  /** Warna nominal total footer: pemasukan (hijau) vs pengeluaran (merah muda). */
  footerSumTone?: "income" | "expense";
}) {
  const [notaQuery, setNotaQuery] = useState("");

  const visibleRows = useMemo(() => {
    const q = normalizeNotaKey(notaQuery);
    if (!q) return rows;
    const qDigits = q.replace(/^sr/, "");
    return rows.filter((row) => {
      const nota = normalizeNotaKey(row.noNota);
      if (!nota) return false;
      if (nota.includes(q)) return true;
      const notaDigits = nota.replace(/^sr/, "");
      return Boolean(qDigits) && notaDigits.includes(qDigits);
    });
  }, [notaQuery, rows]);

  const sumNominal = sumNominalRows(visibleRows);
  const emptyMessage = notaQuery.trim()
    ? `Tidak ada nota yang cocok dengan "${notaQuery.trim()}".`
    : "Belum ada data untuk filter ini.";

  const handleRowOpenInvoice = (row: FinanceRow, e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest("button")) return;
    onRowDoubleClick?.(row);
  };

  const bindRowHover = (row: FinanceRow) => ({
    onMouseEnter: (e: MouseEvent<HTMLTableRowElement>) =>
      setHoverKeterangan({
        id: row.id,
        text: row.keterangan?.trim() || "Tidak ada keterangan.",
        namaPenghuni: (row.namaPenghuni ?? "").trim(),
        kategori: row.kategori,
        x: e.clientX,
        y: e.clientY,
      }),
    onMouseMove: (e: MouseEvent<HTMLTableRowElement>) =>
      setHoverKeterangan((prev) =>
        prev?.id === row.id ? { ...prev, x: e.clientX, y: e.clientY } : prev
      ),
    onMouseLeave: () =>
      setHoverKeterangan((prev) => (prev?.id === row.id ? null : prev)),
  });

  const statusCellForRow = (row: FinanceRow) =>
    row.kategori === "Pemasukan" ? (
      canCancelPemasukanPayment && onCancelPemasukanPayment ? (
        <ActionButtonWithIcon
          icon={Ban}
          label="Cancel payment"
          onClick={() => void onCancelPemasukanPayment(row)}
          className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-red-700"
          iconClassName="text-white"
        />
      ) : (
        <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
          Paid
        </span>
      )
    ) : canCancelPengeluaranPayment && onCancelPengeluaranPayment ? (
      <ActionButtonWithIcon
        icon={Ban}
        label="Cancel payout"
        onClick={() => void onCancelPengeluaranPayment(row)}
        className="rounded-full bg-red-600 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-red-700"
        iconClassName="text-white"
      />
    ) : (
      <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
        Paid Out
      </span>
    );

  const actionCellForRow = (row: FinanceRow) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canEditPayment && onEditPayment ? (
        <ActionButtonWithIcon
          icon={Pencil}
          label="Edit"
          onClick={() => onEditPayment(row)}
          className="rounded-full bg-amber-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-amber-800"
          iconClassName="text-white"
        />
      ) : null}
      {onRowDoubleClick ? (
        <ActionButtonWithIcon
          icon={ReceiptText}
          label="Invoice"
          onClick={() => onRowDoubleClick(row)}
          className="rounded-full bg-violet-700 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white shadow-sm hover:bg-violet-800"
          iconClassName="text-white"
        />
      ) : null}
      {statusCellForRow(row)}
    </div>
  );

  return (
    <section className="overflow-hidden rounded-xl border border-[#e5d9c9] bg-[#fffdfb] dark:border-[#403228] dark:bg-[#231b14]/45">
      <div className="p-3.5 sm:p-4">
        <h3 className="text-[0.8125rem] font-semibold leading-snug tracking-tight text-[#2d2217] sm:text-sm dark:text-[#f6e9d5]">
          {title}
        </h3>
        {hint ? (
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#7f6344] sm:text-xs dark:text-[#b79a78]">{hint}</p>
        ) : null}
        <div className="mt-3">
          <label className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f724d] dark:text-[#c8a97f]">
            Cari No. Nota
          </label>
          <div className="relative mt-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9d7e55] dark:text-[#b79a78]"
              aria-hidden
            />
            <input
              type="search"
              value={notaQuery}
              onChange={(e) => setNotaQuery(e.target.value)}
              placeholder="Contoh: SR0026 atau 0026"
              autoComplete="off"
              className="w-full min-h-[2.5rem] rounded-xl border border-[#dcc7aa] bg-[#fffdf9] py-2 pl-9 pr-9 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016] dark:text-[#f6e9d5]"
            />
            {notaQuery ? (
              <button
                type="button"
                onClick={() => setNotaQuery("")}
                className="btn-flat absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#8f724d] hover:bg-[#efe2d1] dark:text-[#c8a97f] dark:hover:bg-[#33261b]"
                aria-label="Hapus pencarian nota"
              >
                <X size={14} />
              </button>
            ) : null}
          </div>
          {!isLoading && notaQuery.trim() ? (
            <p className="mt-1.5 text-[11px] text-[#7f6344] dark:text-[#b79a78]">
              Menampilkan {visibleRows.length} dari {rows.length} baris
            </p>
          ) : null}
        </div>
        <div className="mt-3 space-y-3 md:hidden">
        {isLoading ? (
          <div className="flex justify-center rounded-2xl border border-[#eadcc9] bg-[#fffdf9] px-4 py-6 dark:border-[#3d2f22] dark:bg-[#2b2016]">
            <BrandLoader size="sm" label="Memuat data finance…" />
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="rounded-2xl border border-[#eadcc9] bg-[#fffdf9] px-4 py-4 text-sm text-[#856948] dark:border-[#3d2f22] dark:bg-[#2b2016] dark:text-[#bca17f]">
            {emptyMessage}
          </div>
        ) : (
          <>
            {visibleRows.map((row) => (
              <article
                key={row.id}
                className={`rounded-2xl border border-[#eadcc9] bg-[#fffdf9] p-4 shadow-sm dark:border-[#3d2f22] dark:bg-[#2b2016] ${
                  onRowDoubleClick ? "cursor-pointer" : ""
                }`}
                onClick={onRowDoubleClick ? (e) => handleRowOpenInvoice(row, e) : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-[#8f724d] dark:text-[#c8a97f]">
                      {row.tanggal || "—"}
                      {row.pelaporanBulan?.trim() ? (
                        <span className="ml-2 font-normal normal-case tracking-normal text-[#6b5238] dark:text-[#b79a78]">
                          · P&amp;L {row.pelaporanBulan.trim().slice(0, 7)}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-1 break-words text-sm font-semibold text-[#2d2217] dark:text-[#f6e9d5]">
                      {row.noNota || "—"}
                    </p>
                  </div>
                  <StatusBadge status={row.kategori} />
                </div>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between gap-3 border-t border-[#efe2d1] pt-2 dark:border-[#33261b]">
                    <dt className="text-[#7f6344] dark:text-[#b79a78]">POS</dt>
                    <dd className="max-w-[65%] text-right font-medium text-[#2d2217] dark:text-[#f6e9d5]">{row.pos || "—"}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-[#7f6344] dark:text-[#b79a78]">Nominal</dt>
                    <dd className="font-semibold tabular-nums text-[#2d2217] dark:text-[#f6e9d5]">
                      {formatNominalDisplay(row.nominal)}
                    </dd>
                  </div>
                  {(row.namaPenghuni ?? "").trim() ? (
                    <div className="flex justify-between gap-3">
                      <dt className="text-[#7f6344] dark:text-[#b79a78]">
                        {row.kategori === "Pengeluaran" ? "Kepada" : "Penghuni"}
                      </dt>
                      <dd className="max-w-[65%] text-right text-[#4a3624] dark:text-[#e8d4bc]">
                        {(row.namaPenghuni ?? "").trim()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {(row.keterangan ?? "").trim() ? (
                  <p className="mt-3 rounded-xl bg-[#f8efe2] px-3 py-2 text-xs leading-relaxed text-[#5c472d] dark:bg-[#1f1710] dark:text-[#d9bc95]">
                    {(row.keterangan ?? "").trim()}
                  </p>
                ) : null}
                <div className="mt-3 flex flex-wrap justify-end">{actionCellForRow(row)}</div>
              </article>
            ))}
            <div className="rounded-2xl border-2 border-[#d4bc9a] bg-[#f0e4d4] p-4 dark:border-[#5c452d] dark:bg-[#2a1f16]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[#4a3624] dark:text-[#e8d4bc]">
                  {footerSumLabel}
                </span>
                <span
                  className={
                    footerSumTone === "expense"
                      ? "text-base font-semibold tabular-nums text-rose-900 dark:text-rose-200"
                      : "text-base font-semibold tabular-nums text-emerald-900 dark:text-emerald-200"
                  }
                >
                  {formatNominalDisplay(String(sumNominal))}
                </span>
              </div>
            </div>
          </>
        )}
        </div>
      </div>

      <div className="hidden max-h-[min(50vh,420px)] overflow-x-auto overflow-y-auto border-t border-[#e8dcc9] md:block dark:border-[#403228]">
        <table className="min-w-full text-left text-sm">
          <thead className="sticky top-0 z-[1] bg-[#f8efe2] dark:bg-[#2b2016]">
            <tr className="text-xs uppercase tracking-[0.13em] text-[#8f724d] dark:text-[#c8a97f]">
              <th className="px-3 py-2.5">Tanggal</th>
              <th className="px-3 py-2.5">Bulan P&amp;L</th>
              <th className="px-3 py-2.5">Nota</th>
              <th className="px-3 py-2.5">Kategori</th>
              <th className="px-3 py-2.5">POS</th>
              <th className="px-3 py-2.5">Nominal</th>
              <th className="px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td className="px-3 py-6" colSpan={7}>
                  <div className="flex justify-center py-2">
                    <BrandLoader size="sm" label="Memuat data finance…" />
                  </div>
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-sm text-[#856948] dark:text-[#bca17f]" colSpan={7}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className={`border-t border-[#efe2d1] dark:border-[#33261b] ${
                    onRowDoubleClick ? "cursor-pointer" : "cursor-help"
                  }`}
                  {...bindRowHover(row)}
                  onClick={onRowDoubleClick ? (e) => handleRowOpenInvoice(row, e) : undefined}
                >
                  <td className="whitespace-nowrap px-3 py-2.5">{row.tanggal || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs text-[#6b5238] dark:text-[#b79a78]">
                    {row.pelaporanBulan?.trim() ? row.pelaporanBulan.trim().slice(0, 7) : "—"}
                  </td>
                  <td className="px-3 py-2.5">{row.noNota}</td>
                  <td className="px-3 py-2.5">
                    <StatusBadge status={row.kategori} />
                  </td>
                  <td className="px-3 py-2.5">{row.pos}</td>
                  <td className="px-3 py-2.5">{formatNominalDisplay(row.nominal)}</td>
                  <td className="px-3 py-2.5">{actionCellForRow(row)}</td>
                </tr>
              ))
            )}
          </tbody>
          {!isLoading && visibleRows.length > 0 ? (
            <tfoot className="border-t-2 border-[#d4bc9a] bg-[#f0e4d4] dark:border-[#5c452d] dark:bg-[#2a1f16]">
              <tr className="text-xs font-semibold uppercase tracking-[0.1em] text-[#4a3624] dark:text-[#e8d4bc]">
                <td className="px-3 py-2.5 text-right md:text-right" colSpan={5}>
                  {footerSumLabel}
                </td>
                <td
                  className={
                    footerSumTone === "expense"
                      ? "whitespace-nowrap px-3 py-2.5 text-sm text-rose-900 dark:text-rose-200"
                      : "whitespace-nowrap px-3 py-2.5 text-sm text-emerald-900 dark:text-emerald-200"
                  }
                >
                  {formatNominalDisplay(String(sumNominal))}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </section>
  );
}

export default function FinancePageClient({
  initialFinanceData,
  posOptions,
}: {
  initialFinanceData: FinanceRow[];
  posOptions: FinancePosOption[];
}) {
  const sessionHydrated = useSupabaseSessionHydrated();
  const cloudSyncTick = useCloudDataResyncTick();
  const { localDemoMode } = useSandboxMode();
  const { toast, confirm } = useAppFeedback();
  const [sandboxRev, setSandboxRev] = useState(0);
  const [masterRev, setMasterRev] = useState(0);
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

  useEffect(() => {
    const fn = () => setMasterRev((n) => n + 1);
    if (typeof window === "undefined") return;
    window.addEventListener("secondroom-master-sandbox-updated", fn as EventListener);
    return () => window.removeEventListener("secondroom-master-sandbox-updated", fn as EventListener);
  }, []);

  const [cloudPosOptions, setCloudPosOptions] = useState<FinancePosOption[]>(posOptions);
  useEffect(() => {
    setCloudPosOptions(posOptions);
  }, [posOptions]);

  const [form, setForm] = useState<FinanceForm>({
    noNota: "",
    kategori: "Pemasukan",
    pos: "",
    tanggal: new Date().toISOString().slice(0, 10),
    namaPenghuni: "",
    lokasiKos: "",
    unitBlok: "",
    nominal: "",
    keterangan: "",
    pelaporanBulan: "",
    paymentSplitGroupId: "",
  });
  /** Opsi form payment dari Master + Kamar (mode cloud). */
  const [cloudMasterLokasi, setCloudMasterLokasi] = useState<Array<{ id: string; namaLokasi: string }>>(
    []
  );
  const [cloudMasterBlok, setCloudMasterBlok] = useState<Array<{ lokasiId: string; namaBlok: string }>>(
    []
  );
  const [cloudKamarLocUnit, setCloudKamarLocUnit] = useState<
    Array<{ lokasiKos: string; unitBlok: string }>
  >([]);
  /** Hanya untuk kategori Pengeluaran — memilih subset POS kos vs manajemen. */
  const [pengeluaranScopeFilter, setPengeluaranScopeFilter] = useState<PengeluaranScope>("kos");
  const [financeData, setFinanceData] = useState<FinanceRow[]>(initialFinanceData);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [financeRiwayatKategori, setFinanceRiwayatKategori] = useState<"Semua" | FinanceType>("Semua");
  const [financeRiwayatPos, setFinanceRiwayatPos] = useState<string>("Semua");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const financeSubmitLockRef = useRef(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedLokasiFilter, setSelectedLokasiFilter] = useState("Semua Lokasi");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("Semua Blok/Unit");
  /** Duplikat terdeteksi dari server (data client belum punya baris itu). */
  const [remoteNotaConflictMessage, setRemoteNotaConflictMessage] = useState("");
  /** Kolom no. nota finance: hanya angka setelah prefiks tetap SR. */
  const [financeNotaDigits, setFinanceNotaDigits] = useState("");
  const [viewerRole, setViewerRole] = useState("staff");

  const financeDateDefaults = useMemo(() => {
    const t = new Date();
    const end = t.toISOString().slice(0, 10);
    const s = new Date(t);
    s.setMonth(t.getMonth() - 5);
    return { start: s.toISOString().slice(0, 10), end };
  }, []);

  const [draftRiwayatStart, setDraftRiwayatStart] = useState(() => financeDateDefaults.start);
  const [draftRiwayatEnd, setDraftRiwayatEnd] = useState(() => financeDateDefaults.end);
  const [appliedRiwayatStart, setAppliedRiwayatStart] = useState(() => financeDateDefaults.start);
  const [appliedRiwayatEnd, setAppliedRiwayatEnd] = useState(() => financeDateDefaults.end);
  const [riwayatDateInit, setRiwayatDateInit] = useState(false);
  /** Filter periode: tanggal input payment vs bulan P&L (pelaporan). */
  const [riwayatDateMode, setRiwayatDateMode] = useState<"tanggal" | "pelaporan">("tanggal");
  const [filterRiwayatBusy, setFilterRiwayatBusy] = useState(false);
  const [laporanModalOpen, setLaporanModalOpen] = useState(false);
  const [laporanPrepBusy, setLaporanPrepBusy] = useState(false);
  const [exportUserLabel, setExportUserLabel] = useState("Pengguna");

  const effectiveFinanceData = financeData;
  const financeNotaFull = useMemo(
    () => formatSrNotaFromDigits(financeNotaDigits),
    [financeNotaDigits]
  );

  const lastUsedSrNota = useMemo(() => findLastUsedSrNota(effectiveFinanceData), [effectiveFinanceData]);

  useEffect(() => {
    if (localDemoMode) {
      const demo = readDemoProfileSession();
      setViewerRole(normalizeUserProfileRole(demo?.role));
      return;
    }
    if (!sessionHydrated) return;
    let cancelled = false;
    const loadViewerRole = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) {
        if (!cancelled) setViewerRole("staff");
        return;
      }
      const { data } = await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      setViewerRole(normalizeUserProfileRole((data as Record<string, unknown> | null)?.role));
    };
    void loadViewerRole();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode, sessionHydrated, cloudSyncTick, sandboxRev]);

  useEffect(() => {
    if (riwayatDateInit) return;
    const dates = collectFinanceBoundaryYmds(financeData, "tanggal");
    if (!dates.length) return;
    const clamped = clampYmdRangeToMaxYear(dates[0]!, dates[dates.length - 1]!);
    setDraftRiwayatStart(clamped.start);
    setDraftRiwayatEnd(clamped.end);
    setAppliedRiwayatStart(clamped.start);
    setAppliedRiwayatEnd(clamped.end);
    setRiwayatDateInit(true);
  }, [financeData, riwayatDateInit]);

  useEffect(() => {
    if (localDemoMode) {
      const demo = readDemoProfileSession();
      setExportUserLabel((demo?.nama || demo?.email || "Pengguna").trim());
      return;
    }
    if (!sessionHydrated) return;
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase.from("user_profiles").select("full_name").eq("id", user.id).maybeSingle();
      if (cancelled) return;
      const fn = String((data as { full_name?: string } | null)?.full_name ?? "").trim();
      setExportUserLabel(fn || user.email || "Pengguna");
    })();
    return () => {
      cancelled = true;
    };
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);

  const localNotaConflictMessage = useMemo(() => {
    const trimmed = financeNotaFull;
    if (!normalizeNotaKey(trimmed)) return "";
    if (
      findFinanceRowWithDuplicateNota(financeData, trimmed, editingId, {
        pos: form.pos,
        kategori: form.kategori,
      })
    ) {
      return financeNotaTakenMessage(trimmed);
    }
    return "";
  }, [financeNotaFull, form.pos, form.kategori, financeData, editingId]);

  useEffect(() => {
    if (localDemoMode || !showPaymentForm) {
      setRemoteNotaConflictMessage("");
      return;
    }
    if (localNotaConflictMessage) {
      setRemoteNotaConflictMessage("");
      return;
    }
    const trimmed = financeNotaFull;
    if (!normalizeNotaKey(trimmed)) {
      setRemoteNotaConflictMessage("");
      return;
    }
    setRemoteNotaConflictMessage("");
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const { data, error } = await supabase
          .from("finance")
          .select("id, no_nota, pos, kategori")
          .ilike("no_nota", escapeIlikeExact(trimmed))
          .limit(80);
        if (cancelled) return;
        if (error) {
          setRemoteNotaConflictMessage("");
          return;
        }
        const mapped = (data ?? []).map((raw) => {
          const r = raw as Record<string, unknown>;
          return {
            id: String(r.id ?? ""),
            noNota: String(r.no_nota ?? ""),
            pos: String(r.pos ?? ""),
            kategori: String(r.kategori ?? ""),
          };
        });
        if (
          findFinanceRowWithDuplicateNota(mapped, trimmed, editingId, {
            pos: form.pos,
            kategori: form.kategori,
          })
        ) {
          setRemoteNotaConflictMessage(financeNotaTakenMessage(trimmed));
        } else {
          setRemoteNotaConflictMessage("");
        }
      })();
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    financeNotaFull,
    form.pos,
    form.kategori,
    editingId,
    localDemoMode,
    showPaymentForm,
    localNotaConflictMessage,
  ]);

  useEffect(() => {
    if (!localDemoMode) return;
    if (!sandboxReady) return;
    const fin = readSandboxJson<FinanceRow[] | null>(SB_KEY.finance, null);
    if (fin) setFinanceData(fin);
    else setFinanceData(initialFinanceData);
  }, [localDemoMode, sandboxReady, sandboxRev, initialFinanceData]);

  const kamarSandboxRows = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as KamarRow[];
    return readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
  }, [localDemoMode, sandboxReady, sandboxRev]);

  const rowsForLocationMerge = useMemo(
    () => [...effectiveFinanceData.map((r) => ({ lokasiKos: r.lokasiKos, unitBlok: r.unitBlok }))],
    [effectiveFinanceData]
  );

  const posFromMasterDemo = useMemo(() => {
    if (!localDemoMode || !sandboxReady) return [] as FinancePosOption[];
    const m = readSandboxJson<{
      financeData?: {
        id: string;
        tipe: FinanceType;
        namaPos: string;
        pengeluaranScope?: PengeluaranScope | null;
      }[];
    } | null>(SB_KEY.master, null);
    const rows = m?.financeData ?? [];
    return rows
      .filter((r) =>
        form.kategori === "Pemasukan"
          ? String(r.tipe).startsWith("Pemasukan")
          : String(r.tipe).startsWith("Pengeluaran")
      )
      .map((r) => {
        const tipeLower = String(r.tipe ?? "").trim().toLowerCase();
        const pemasukanScope: PemasukanScope | undefined =
          tipeLower.startsWith("pemasukan") ?
            (tipeLower.includes("kos") ? "kos" : "manajemen")
          : undefined;
        const pemasukanKind: PemasukanKind | undefined =
          tipeLower === "pemasukan kos" && String(r.namaPos ?? "").trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase() ? "sewa_kamar"
          : tipeLower === "pemasukan kos" && String(r.namaPos ?? "").trim().toLowerCase() === "booking fee" ? "booking_fee"
          : tipeLower.startsWith("pemasukan") ? "lain"
          : undefined;
        return {
          id: r.id,
          label: (r.namaPos || "").trim() || "(Tanpa nama)",
          tipe: form.kategori,
          pengeluaranScope: normalizePengeluaranScope(r.pengeluaranScope),
          pemasukanScope,
          pemasukanKind,
        };
      })
      .filter((r) => r.label)
      .filter((r) =>
        form.kategori !== "Pengeluaran"
          ? true
          : normalizePengeluaranScope(r.pengeluaranScope) === pengeluaranScopeFilter
      );
  }, [localDemoMode, sandboxReady, sandboxRev, masterRev, form.kategori, pengeluaranScopeFilter]);

  const cloudPosFiltered = useMemo(() => {
    if (form.kategori === "Pemasukan") return cloudPosOptions.filter((p) => !p.tipe || p.tipe === "Pemasukan");
    return cloudPosOptions
      .filter((p) => !p.tipe || p.tipe === "Pengeluaran")
      .filter((p) => normalizePengeluaranScope(p.pengeluaranScope) === pengeluaranScopeFilter);
  }, [cloudPosOptions, form.kategori, pengeluaranScopeFilter]);

  const effectivePosOptions = useMemo(
    () => (localDemoMode ? posFromMasterDemo : cloudPosFiltered),
    [localDemoMode, posFromMasterDemo, cloudPosFiltered]
  );

  const getDefaultPosForKategori = (k: FinanceType) => {
    if (localDemoMode) {
      if (!sandboxReady) return "";
      const m = readSandboxJson<{
        financeData?: { tipe: FinanceType; namaPos: string; pengeluaranScope?: PengeluaranScope | null }[];
      } | null>(SB_KEY.master, null);
      const row = (m?.financeData ?? []).find((r) => r.tipe === k);
      return (row?.namaPos || "").trim() || "";
    }
    const opts = cloudPosOptions.filter((p) => !p.tipe || p.tipe === k);
    return opts[0]?.label ?? "";
  };

  const lokasiFilterOptions = useMemo(
    () =>
      Array.from(new Set(effectiveFinanceData.map((row) => row.lokasiKos).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b)
      ),
    [effectiveFinanceData]
  );

  const unitFilterOptions = useMemo(() => {
    const allRows = effectiveFinanceData.map((row) => ({ lokasiKos: row.lokasiKos, unitBlok: row.unitBlok }));
    const source =
      selectedLokasiFilter === "Semua Lokasi"
        ? allRows
        : allRows.filter((row) => row.lokasiKos === selectedLokasiFilter);
    return Array.from(new Set(source.map((row) => row.unitBlok).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [effectiveFinanceData, selectedLokasiFilter]);

  const riwayatPosOptions = useMemo(() => {
    const u = new Set(effectiveFinanceData.map((r) => r.pos).filter(Boolean));
    return Array.from(u).sort((a, b) => a.localeCompare(b, "id"));
  }, [effectiveFinanceData]);

  const filteredFinanceData = effectiveFinanceData.filter((row) => {
    const lokasiMatch = selectedLokasiFilter === "Semua Lokasi" || row.lokasiKos === selectedLokasiFilter;
    const unitMatch = selectedUnitFilter === "Semua Blok/Unit" || row.unitBlok === selectedUnitFilter;
    const katMatch = financeRiwayatKategori === "Semua" || row.kategori === financeRiwayatKategori;
    const posMatch = financeRiwayatPos === "Semua" || row.pos === financeRiwayatPos;
    const tanggalMatch =
      riwayatDateMode === "pelaporan"
        ? financeRowInPelaporanYmdInclusiveRange(row, appliedRiwayatStart, appliedRiwayatEnd)
        : financeRowInYmdInclusiveRange(row, appliedRiwayatStart, appliedRiwayatEnd);
    return lokasiMatch && unitMatch && katMatch && posMatch && tanggalMatch;
  });

  const financeDraftDateInvalid = useMemo(
    () => ymdRangeInvalidOrTooLong(draftRiwayatStart, draftRiwayatEnd),
    [draftRiwayatEnd, draftRiwayatStart]
  );

  const financeAppliedDateInvalid = useMemo(
    () => ymdRangeInvalidOrTooLong(appliedRiwayatStart, appliedRiwayatEnd),
    [appliedRiwayatEnd, appliedRiwayatStart]
  );

  const riwayatSewaKamarRows = useMemo(
    () => sortFinanceRowsDesc(filteredFinanceData.filter(isSewaKamarPemasukanRow)),
    [filteredFinanceData]
  );

  /** Pemasukan manajemen + POS khusus (IPL/manajemen fee) walau tercatat sebagai pengeluaran. */
  const riwayatNonSewaKamarPemasukanRows = useMemo(
    () =>
      sortFinanceRowsDesc(
        filteredFinanceData.filter(
          (r) =>
            (r.kategori === "Pemasukan" && !isSewaKamarPemasukanRow(r)) ||
            (r.kategori === "Pengeluaran" && isForcedPemasukanManajemenFinancePos(r.pos))
        )
      ),
    [filteredFinanceData]
  );

  const riwayatPengeluaranKosRows = useMemo(
    () => sortFinanceRowsDesc(filteredFinanceData.filter(isPengeluaranKosRow)),
    [filteredFinanceData]
  );

  const riwayatPengeluaranManajemenRows = useMemo(
    () => sortFinanceRowsDesc(filteredFinanceData.filter(isPengeluaranManajemenRow)),
    [filteredFinanceData]
  );

  const sumSewaKamarNominal = useMemo(
    () => sumNominalRows(riwayatSewaKamarRows),
    [riwayatSewaKamarRows]
  );
  const sumNonSewaPemasukanNominal = useMemo(
    () => sumNominalRows(riwayatNonSewaKamarPemasukanRows),
    [riwayatNonSewaKamarPemasukanRows]
  );
  const sumPengeluaranKosNominal = useMemo(
    () => sumNominalRows(riwayatPengeluaranKosRows),
    [riwayatPengeluaranKosRows]
  );
  const sumPengeluaranManajemenNominal = useMemo(
    () => sumNominalRows(riwayatPengeluaranManajemenRows),
    [riwayatPengeluaranManajemenRows]
  );
  const plKosSewaMinusPengeluaranKos =
    financeRiwayatKategori === "Semua" ? sumSewaKamarNominal - sumPengeluaranKosNominal : null;
  const plManajemenMarginMinusPengeluaran =
    financeRiwayatKategori === "Semua"
      ? sumNonSewaPemasukanNominal - sumPengeluaranManajemenNominal
      : null;

  const formLokasiOptions = useMemo(() => {
    if (localDemoMode) {
      return buildDemoLokasiList(sandboxReady, kamarSandboxRows, rowsForLocationMerge);
    }
    const fromMaster = cloudMasterLokasi.map((l) => l.namaLokasi).filter(Boolean);
    const fromKamar = cloudKamarLocUnit.map((r) => r.lokasiKos).filter(Boolean);
    const fromFinance = lokasiFilterOptions;
    const merged = Array.from(new Set([...fromMaster, ...fromKamar, ...fromFinance])).sort((a, b) =>
      a.localeCompare(b, "id")
    );
    return merged.length ? merged : [PLACEHOLDER_LOKASI_FORM];
  }, [
    localDemoMode,
    sandboxReady,
    kamarSandboxRows,
    rowsForLocationMerge,
    cloudMasterLokasi,
    cloudKamarLocUnit,
    lokasiFilterOptions,
  ]);

  const formUnitOptions = useMemo(() => {
    if (!isValidRealLokasiForPengeluaranKos(form.lokasiKos)) return [] as string[];
    let units: string[];
    if (localDemoMode) {
      units = buildDemoUnitList(sandboxReady, form.lokasiKos, kamarSandboxRows, rowsForLocationMerge);
    } else {
      const lok = cloudMasterLokasi.find((l) => l.namaLokasi === form.lokasiKos);
      const fromBlok = lok
        ? cloudMasterBlok
            .filter((b) => b.lokasiId === lok.id)
            .map((b) => b.namaBlok)
            .filter(Boolean)
        : [];
      const fromKamar = cloudKamarLocUnit
        .filter((r) => r.lokasiKos === form.lokasiKos)
        .map((r) => r.unitBlok)
        .filter(Boolean);
      const fromFinance = rowsForLocationMerge
        .filter((r) => r.lokasiKos === form.lokasiKos)
        .map((r) => r.unitBlok)
        .filter(Boolean);
      units = Array.from(new Set([...fromBlok, ...fromKamar, ...fromFinance])).sort((a, b) =>
        a.localeCompare(b, "id")
      );
    }
    return units.filter(isValidRealUnitForPengeluaranKos);
  }, [
    localDemoMode,
    sandboxReady,
    form.lokasiKos,
    kamarSandboxRows,
    rowsForLocationMerge,
    cloudMasterLokasi,
    cloudMasterBlok,
    cloudKamarLocUnit,
  ]);

  const lokasiOptionsForSelect = useMemo(() => {
    const base = formLokasiOptions.filter(isValidRealLokasiForPengeluaranKos);
    if (isValidRealLokasiForPengeluaranKos(form.lokasiKos) && !base.includes(form.lokasiKos)) {
      return [form.lokasiKos, ...base];
    }
    return base;
  }, [formLokasiOptions, form.lokasiKos]);

  const unitOptionsForSelect = useMemo(() => {
    const base = [...formUnitOptions];
    if (
      form.unitBlok &&
      isValidRealUnitForPengeluaranKos(form.unitBlok) &&
      !base.includes(form.unitBlok)
    ) {
      return [form.unitBlok, ...base];
    }
    return base;
  }, [formUnitOptions, form.unitBlok]);

  const lokasiUnitNotApplicable =
    form.kategori === "Pengeluaran" && pengeluaranFormSkipsLocationUnit(pengeluaranScopeFilter);

  useEffect(() => {
    const labels = effectivePosOptions.map((p) => p.label);
    if (labels.length === 0) {
      setForm((prev) => (prev.pos === "" ? prev : { ...prev, pos: "" }));
      return;
    }
    setForm((prev) => (labels.includes(prev.pos) ? prev : { ...prev, pos: labels[0] }));
  }, [effectivePosOptions]);

  /** Jika lokasi kosong / berubah dan unit tidak lagi valid untuk lokasi itu, kosongkan unit. */
  useEffect(() => {
    if (lokasiUnitNotApplicable) return;
    if (!isValidRealLokasiForPengeluaranKos(form.lokasiKos)) {
      if (form.unitBlok) setForm((prev) => ({ ...prev, unitBlok: "" }));
      return;
    }
    if (
      form.unitBlok &&
      (!isValidRealUnitForPengeluaranKos(form.unitBlok) || !formUnitOptions.includes(form.unitBlok))
    ) {
      setForm((prev) => ({ ...prev, unitBlok: "" }));
    }
  }, [form.lokasiKos, form.unitBlok, formUnitOptions, lokasiUnitNotApplicable]);

  useEffect(() => {
    if (!lokasiUnitNotApplicable) return;
    setForm((prev) =>
      prev.lokasiKos === "" && prev.unitBlok === "" ? prev : { ...prev, lokasiKos: "", unitBlok: "" }
    );
  }, [lokasiUnitNotApplicable]);

  /** Tooltip keterangan baris riwayat (fixed supaya tidak terpotong overflow). */
  const [hoverKeterangan, setHoverKeterangan] = useState<HoverKeteranganState>(null);

  useEffect(() => {
    if (!showPaymentForm || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showPaymentForm]);

  const loadFinanceData = useCallback(async (): Promise<boolean> => {
    setIsLoading(true);
    if (localDemoMode) {
      const fin = readSandboxJson<FinanceRow[]>(SB_KEY.finance, initialFinanceData);
      const pen = readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
      const patches = planSewaSplitBookingFeeFirstMonthReallocation(
        fin.map((r) => ({
          id: r.id,
          noNota: r.noNota,
          pos: r.pos,
          nominal: r.nominal,
          pelaporanBulan: r.pelaporanBulan,
          tanggal: r.tanggal,
          paymentSplitGroupId: r.paymentSplitGroupId,
          kategori: r.kategori,
          namaPenghuni: r.namaPenghuni,
          lokasiKos: r.lokasiKos,
          unitBlok: r.unitBlok,
          keterangan: r.keterangan,
        })),
        pen.map((p) => ({
          hargaBulanan: parseRupiahToNumber(String(p.hargaBulanan ?? "")),
          periodeBulan: Math.max(0, Math.floor(Number(p.periodeSewa) || 0)),
          bookingFee: parseRupiahToNumber(String(p.bookingFee ?? "")),
          bookingFeePaid: Boolean(p.bookingFeePaid),
          sewaKamarNota: p.sewaKamarNota,
          bookingFeeNota: p.bookingFeeNota,
          cycleStartYmd: p.sewaCycleStart || p.tglCheckIn,
        }))
      );
      if (
        patches.bookingFeePosPatches.length > 0 ||
        patches.patches.length > 0 ||
        patches.deleteIds.length > 0 ||
        patches.expandInserts.length > 0
      ) {
        const byIdPatch = new Map(patches.patches.map((p) => [p.id, p]));
        const byIdBf = new Map(patches.bookingFeePosPatches.map((p) => [p.id, p]));
        const deleteSet = new Set(patches.deleteIds);
        const nextFin: FinanceRow[] = fin
          .filter((r) => !deleteSet.has(r.id))
          .map((r) => {
            let next = r;
            const bf = byIdBf.get(r.id);
            if (bf) {
              next = { ...next, pos: bf.pos, pelaporanBulan: bf.pelaporanBulan };
            }
            const pt = byIdPatch.get(r.id);
            if (pt) {
              next = {
                ...next,
                nominal: String(pt.nominal),
                ...(pt.pelaporanBulan ? { pelaporanBulan: pt.pelaporanBulan } : {}),
              };
            }
            return next;
          });
        for (const ins of patches.expandInserts) {
          nextFin.unshift({
            id: newSandboxId(),
            noNota: ins.noNota,
            kategori: ins.kategori === "Pengeluaran" ? "Pengeluaran" : "Pemasukan",
            pos: ins.pos,
            tanggal: ins.tanggal,
            namaPenghuni: ins.namaPenghuni,
            lokasiKos: ins.lokasiKos,
            unitBlok: ins.unitBlok,
            nominal: String(ins.nominal),
            keterangan: ins.keterangan,
            pelaporanBulan: ins.pelaporanBulan,
            paymentSplitGroupId: ins.paymentSplitGroupId,
          });
        }
        writeSandboxJson(SB_KEY.finance, nextFin);
        setFinanceData(nextFin);
      } else {
        setFinanceData(fin);
      }
      setErrorMessage("");
      setIsLoading(false);
      return true;
    }

    const [
      { data: financeRows, error: financeError },
      { data: kategoriRows, error: kategoriError },
      { data: lokasiMasterRows },
      { data: blokMasterRows },
      { data: kamarRows },
    ] = await Promise.all([
      supabase.from("finance").select("*").order("updated_at", { ascending: false }),
      supabase
        .from("finance_kategori")
        .select("id, nama_pos, tipe, pengeluaran_scope, pemasukan_scope, pemasukan_kind"),
      supabase.from("master_lokasi").select("id, nama_lokasi"),
      supabase.from("master_blok").select("lokasi_id, nama_blok"),
      supabase.from("kamar").select("lokasi_kos, unit_blok"),
    ]);

    if (financeError) {
      setErrorMessage(financeError.message);
      setIsLoading(false);
      return false;
    }

    setCloudMasterLokasi(
      (lokasiMasterRows ?? [])
        .map((row) => {
          const rec = row as Record<string, unknown>;
          return {
            id: String(rec.id ?? ""),
            namaLokasi: String(rec.nama_lokasi ?? "").trim(),
          };
        })
        .filter((r) => r.id && r.namaLokasi)
    );
    setCloudMasterBlok(
      (blokMasterRows ?? [])
        .map((row) => {
          const rec = row as Record<string, unknown>;
          return {
            lokasiId: String(rec.lokasi_id ?? ""),
            namaBlok: String(rec.nama_blok ?? "").trim(),
          };
        })
        .filter((r) => r.lokasiId && r.namaBlok)
    );
    setCloudKamarLocUnit(
      (kamarRows ?? [])
        .map((row) => {
          const rec = row as Record<string, unknown>;
          return {
            lokasiKos: String(rec.lokasi_kos ?? "").trim(),
            unitBlok: String(rec.unit_blok ?? "").trim(),
          };
        })
        .filter((r) => r.lokasiKos || r.unitBlok)
    );

    if (!kategoriError && kategoriRows && kategoriRows.length > 0) {
      setCloudPosOptions(
        kategoriRows.map((row) => {
          const rec = row as Record<string, unknown>;
          const label = String(rec.nama_pos ?? "").trim() || "POS";
          const tipeRaw = String(rec.tipe ?? "Pemasukan").trim().toLowerCase();
          const tipe: FinanceType =
            tipeRaw.startsWith("pengeluaran") ? "Pengeluaran" : tipeRaw.startsWith("pemasukan") ? "Pemasukan" : "Pemasukan";
          const scopeByTipe =
            tipeRaw === "pengeluaran manajemen"
              ? "manajemen"
              : tipeRaw === "pengeluaran kos" || tipeRaw === "pengeluaran"
                ? "kos"
                : null;
          const pemasukanScopeByTipe =
            tipeRaw === "pemasukan kos"
              ? "kos"
              : tipeRaw === "pemasukan manajemen" || tipeRaw === "pemasukan"
                ? "manajemen"
                : null;
          const pemasukanKindByTipe =
            tipeRaw === "pemasukan kos" && label.trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase()
              ? "sewa_kamar"
              : tipeRaw === "pemasukan kos" && label.trim().toLowerCase() === "booking fee"
                ? "booking_fee"
                : tipeRaw.startsWith("pemasukan")
                  ? "lain"
                  : null;
          return {
            id: String(rec.id ?? label),
            label,
            tipe,
            pengeluaranScope:
              tipe === "Pengeluaran"
                ? normalizePengeluaranScope(scopeByTipe ?? rec.pengeluaran_scope)
                : undefined,
            pemasukanScope:
              tipe === "Pemasukan"
                ? (normalizePengeluaranScope(pemasukanScopeByTipe ?? rec.pemasukan_scope) as PemasukanScope)
                : undefined,
            pemasukanKind:
              tipe === "Pemasukan"
                ? (String(pemasukanKindByTipe ?? rec.pemasukan_kind ?? "")
                    .trim()
                    .toLowerCase() as PemasukanKind)
                : undefined,
          };
        })
      );
    }

    const mappedFinance: FinanceRow[] = (financeRows ?? []).map((row) => {
      const rec = row as Record<string, unknown>;
      const kat: FinanceType = String(rec.kategori ?? "") === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";
      return {
        id: String(rec.id ?? ""),
        noNota: String(rec.no_nota ?? ""),
        kategori: kat,
        pos: String(rec.pos ?? ""),
        pengeluaranScope:
          kat === "Pengeluaran" ? normalizePengeluaranScope(rec.pengeluaran_scope) : null,
        pemasukanScope:
          kat === "Pemasukan"
            ? (normalizePengeluaranScope(rec.pemasukan_scope) as PemasukanScope)
            : null,
        pemasukanKind:
          kat === "Pemasukan"
            ? (String(rec.pemasukan_kind ?? "").trim().toLowerCase() as PemasukanKind)
            : null,
        tanggal: String(rec.tanggal ?? ""),
        namaPenghuni: String(rec.nama_penghuni ?? ""),
        lokasiKos: String(rec.lokasi_kos ?? ""),
        unitBlok: String(rec.unit_blok ?? ""),
        nominal: String(rec.nominal ?? ""),
        keterangan: String(rec.keterangan ?? ""),
        pelaporanBulan: pelaporanBulanIsoFromDbRecord(rec),
        paymentSplitGroupId: rec.payment_split_group_id
          ? String(rec.payment_split_group_id)
          : undefined,
        updatedAt: rec.updated_at
          ? String(rec.updated_at)
          : rec.created_at
            ? String(rec.created_at)
            : undefined,
      };
    });

    const { data: penghuniPayRows } = await supabase
      .from("penghuni")
      .select(
        "harga_bulanan, periode_sewa_bulan, booking_fee, booking_fee_paid, booking_fee_nota, sewa_kamar_nota, sewa_cycle_start, tgl_check_in"
      );

    const patches = planSewaSplitBookingFeeFirstMonthReallocation(
      mappedFinance.map((r) => ({
        id: r.id,
        noNota: r.noNota,
        pos: r.pos,
        nominal: r.nominal,
        pelaporanBulan: r.pelaporanBulan,
        tanggal: r.tanggal,
        paymentSplitGroupId: r.paymentSplitGroupId,
        kategori: r.kategori,
        namaPenghuni: r.namaPenghuni,
        lokasiKos: r.lokasiKos,
        unitBlok: r.unitBlok,
        keterangan: r.keterangan,
      })),
      (penghuniPayRows ?? []).map((row) => {
        const rec = row as Record<string, unknown>;
        const hargaRaw = rec.harga_bulanan;
        const bfRaw = rec.booking_fee;
        return {
          hargaBulanan:
            typeof hargaRaw === "number"
              ? Math.max(0, Math.round(hargaRaw))
              : parseRupiahToNumber(String(hargaRaw ?? "")),
          periodeBulan: Math.max(0, Math.floor(Number(rec.periode_sewa_bulan) || 0)),
          bookingFee:
            typeof bfRaw === "number"
              ? Math.max(0, Math.round(bfRaw))
              : parseRupiahToNumber(String(bfRaw ?? "")),
          bookingFeePaid: Boolean(rec.booking_fee_paid),
          sewaKamarNota: String(rec.sewa_kamar_nota ?? ""),
          bookingFeeNota: String(rec.booking_fee_nota ?? ""),
          cycleStartYmd: String(rec.sewa_cycle_start ?? rec.tgl_check_in ?? ""),
        };
      })
    );

    let finalFinance = mappedFinance;
    if (
      patches.bookingFeePosPatches.length > 0 ||
      patches.patches.length > 0 ||
      patches.deleteIds.length > 0 ||
      patches.expandInserts.length > 0
    ) {
      const insertPayloads = patches.expandInserts.map((ins) => ({
        no_nota: ins.noNota,
        kategori: ins.kategori === "Pengeluaran" ? "Pengeluaran" : "Pemasukan",
        pos: ins.pos,
        tanggal: ins.tanggal,
        nama_penghuni: ins.namaPenghuni,
        nominal: ins.nominal,
        keterangan: ins.keterangan,
        lokasi_kos: ins.lokasiKos,
        unit_blok: ins.unitBlok,
        pelaporan_bulan: ins.pelaporanBulan,
      }));

      const results = await Promise.all([
        ...patches.bookingFeePosPatches.map((p) =>
          supabase
            .from("finance")
            .update({ pos: p.pos, pelaporan_bulan: p.pelaporanBulan })
            .eq("id", p.id)
        ),
        ...patches.patches.map((p) =>
          supabase
            .from("finance")
            .update({
              nominal: p.nominal,
              ...(p.pelaporanBulan ? { pelaporan_bulan: p.pelaporanBulan } : {}),
            })
            .eq("id", p.id)
        ),
        ...patches.deleteIds.map((id) => supabase.from("finance").delete().eq("id", id)),
        ...(insertPayloads.length
          ? [supabase.from("finance").insert(insertPayloads).select("*")]
          : []),
      ]);
      const firstErr = results.find((r) => r.error)?.error;
      if (firstErr) {
        setErrorMessage(firstErr.message);
        setIsLoading(false);
        return false;
      }

      const insertedRaw = insertPayloads.length
        ? ((results[results.length - 1] as { data?: unknown[] | null }).data ?? [])
        : [];
      const insertedMapped: FinanceRow[] = insertedRaw.map((row) => {
        const rec = row as Record<string, unknown>;
        const kat: FinanceType = String(rec.kategori ?? "") === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";
        return {
          id: String(rec.id ?? ""),
          noNota: String(rec.no_nota ?? ""),
          kategori: kat,
          pos: String(rec.pos ?? ""),
          pengeluaranScope: null,
          pemasukanScope: null,
          pemasukanKind: null,
          tanggal: String(rec.tanggal ?? ""),
          namaPenghuni: String(rec.nama_penghuni ?? ""),
          lokasiKos: String(rec.lokasi_kos ?? ""),
          unitBlok: String(rec.unit_blok ?? ""),
          nominal: String(rec.nominal ?? ""),
          keterangan: String(rec.keterangan ?? ""),
          pelaporanBulan: pelaporanBulanIsoFromDbRecord(rec),
          paymentSplitGroupId: rec.payment_split_group_id
            ? String(rec.payment_split_group_id)
            : undefined,
          updatedAt: rec.updated_at
            ? String(rec.updated_at)
            : rec.created_at
              ? String(rec.created_at)
              : undefined,
        };
      });

      const byIdPatch = new Map(patches.patches.map((p) => [p.id, p]));
      const byIdBf = new Map(patches.bookingFeePosPatches.map((p) => [p.id, p]));
      const deleteSet = new Set(patches.deleteIds);
      finalFinance = [
        ...insertedMapped,
        ...mappedFinance
          .filter((r) => !deleteSet.has(r.id))
          .map((r) => {
            let next = r;
            const bf = byIdBf.get(r.id);
            if (bf) {
              next = { ...next, pos: bf.pos, pelaporanBulan: bf.pelaporanBulan };
            }
            const pt = byIdPatch.get(r.id);
            if (pt) {
              next = {
                ...next,
                nominal: String(pt.nominal),
                ...(pt.pelaporanBulan ? { pelaporanBulan: pt.pelaporanBulan } : {}),
              };
            }
            return next;
          }),
      ];
    }

    setErrorMessage("");
    setFinanceData(finalFinance);
    setIsLoading(false);
    return true;
  }, [localDemoMode, initialFinanceData]);

  useEffect(() => {
    if (localDemoMode || !sessionHydrated) return;
    void loadFinanceData();
  }, [localDemoMode, loadFinanceData, sessionHydrated, cloudSyncTick]);

  const handleRefreshFinance = async () => {
    const ok = await loadFinanceData();
    setSandboxRev((n) => n + 1);
    if (ok) {
      toast("Data finance berhasil dimuat ulang.", "info");
    } else {
      toast("Gagal memuat ulang. Periksa pesan di halaman.", "error");
    }
  };

  const resetForm = () => {
    const nextNotaDigits = suggestNextSrNotaDigits(financeData);
    setFinanceNotaDigits(nextNotaDigits);
    setPengeluaranScopeFilter("kos");
    setForm({
      noNota: formatSrNotaFromDigits(nextNotaDigits),
      kategori: "Pemasukan",
      pos: getDefaultPosForKategori("Pemasukan"),
      tanggal: new Date().toISOString().slice(0, 10),
      namaPenghuni: "",
      lokasiKos: PLACEHOLDER_LOKASI_PICK,
      unitBlok: "",
      nominal: "",
      keterangan: "",
      pelaporanBulan: "",
      paymentSplitGroupId: "",
    });
    setEditingId(null);
    setRemoteNotaConflictMessage("");
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (financeSubmitLockRef.current || isSubmitting) return;
    financeSubmitLockRef.current = true;
    setIsSubmitting(true);
    setInfoMessage("");
    setErrorMessage("");

    const unlockSubmit = () => {
      financeSubmitLockRef.current = false;
      setIsSubmitting(false);
    };

    if (editingId && !canSuperAdminEditFinance) {
      toast("Hanya super admin yang dapat mengedit payment.", "error");
      unlockSubmit();
      return;
    }

    if (!form.pos.trim()) {
      toast("Pilih POS terlebih dahulu (Master Data / finance_kategori).", "error");
      unlockSubmit();
      return;
    }

    const nominalAngka = parseRupiahToNumber(form.nominal);
    if (!form.nominal.trim() || nominalAngka <= 0) {
      toast("Isi nominal Rupiah lebih dari 0.", "error");
      unlockSubmit();
      return;
    }

    const notaTrimmed = financeNotaFull;
    if (!isValidSrNotaDigits(financeNotaDigits) || !normalizeNotaKey(notaTrimmed)) {
      toast(
        sanitizeSrNotaDigits(financeNotaDigits).length > SR_NOTA_MAX_DIGITS
          ? srNotaDigitsInvalidMessage()
          : "Isi nomor nota setelah SR (hanya angka).",
        "error"
      );
      unlockSubmit();
      return;
    }

    const effectiveKategori: FinanceType = form.kategori;

    const dupLocal = findFinanceRowWithDuplicateNota(financeData, notaTrimmed, editingId, {
      pos: form.pos,
      kategori: effectiveKategori,
    });
    if (dupLocal) {
      const dupMsg = financeNotaTakenMessage(notaTrimmed);
      setErrorMessage(dupMsg);
      toast(dupMsg, "error");
      unlockSubmit();
      return;
    }

    const ymPel = String(form.pelaporanBulan ?? "").trim();
    const pelaporanSql = ymPel.length === 7 ? `${ymPel}-01` : ymPel.length >= 10 ? ymPel.slice(0, 10) : null;
    const editingRow = editingId ? financeData.find((r) => r.id === editingId) : undefined;

    const posMeta = effectivePosOptions.find((p) => p.label === form.pos);
    const resolvedPengeluaranScope =
      effectiveKategori === "Pengeluaran"
        ? posMeta?.pengeluaranScope ?? normalizePengeluaranScope(undefined)
        : null;
    /** Samakan dengan UI: jika tipe Kos tampilkan lokasi/unit, maka wajib diisi. */
    const omitLocUnit =
      effectiveKategori === "Pengeluaran" &&
      pengeluaranFormSkipsLocationUnit(pengeluaranScopeFilter);
    const resolvedPemasukanScope: PemasukanScope | null =
      effectiveKategori === "Pemasukan"
        ? (posMeta?.pemasukanScope ??
            ((form.pos ?? "").trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase() ||
            (form.pos ?? "").trim().toLowerCase() === "booking fee"
              ? "kos"
              : "manajemen"))
        : null;
    const resolvedPemasukanKind: PemasukanKind | null =
      effectiveKategori === "Pemasukan"
        ? (posMeta?.pemasukanKind ??
            ((form.pos ?? "").trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase()
              ? "sewa_kamar"
              : (form.pos ?? "").trim().toLowerCase() === "booking fee"
                ? "booking_fee"
                : "lain"))
        : null;

    const lokasiKosEff = String(form.lokasiKos ?? "").trim();
    const unitBlokEff = String(form.unitBlok ?? "").trim();
    if (!omitLocUnit) {
      if (!isValidRealLokasiForPengeluaranKos(lokasiKosEff)) {
        toast("Pilih lokasi kos terlebih dahulu.", "error");
        unlockSubmit();
        return;
      }
      if (!isValidRealUnitForPengeluaranKos(unitBlokEff)) {
        toast(
          formUnitOptions.length === 0
            ? "Belum ada blok/unit untuk lokasi ini. Tambah data di Master/Kamar."
            : "Pilih blok/unit untuk lokasi yang dipilih.",
          "error"
        );
        unlockSubmit();
        return;
      }
    }

    const payloadCloud: Record<string, unknown> = {
      no_nota: notaTrimmed,
      kategori: effectiveKategori,
      pos: form.pos,
      tanggal: form.tanggal,
      nama_penghuni: form.namaPenghuni || null,
      lokasi_kos: omitLocUnit ? null : lokasiKosEff || null,
      unit_blok: omitLocUnit ? null : unitBlokEff || null,
      nominal: nominalAngka,
      keterangan: form.keterangan,
      pengeluaran_scope: effectiveKategori === "Pengeluaran" ? resolvedPengeluaranScope : null,
      pemasukan_scope: effectiveKategori === "Pemasukan" ? resolvedPemasukanScope : null,
      pemasukan_kind: effectiveKategori === "Pemasukan" ? resolvedPemasukanKind : null,
      pelaporan_bulan: pelaporanSql,
    };

    if (localDemoMode) {
      const splitGid = (editingRow?.paymentSplitGroupId ?? "").trim() || null;
      const row: FinanceRow = {
        id: editingId ?? newSandboxId(),
        noNota: notaTrimmed,
        kategori: effectiveKategori,
        pos: form.pos,
        pengeluaranScope: effectiveKategori === "Pengeluaran" ? resolvedPengeluaranScope : null,
        pemasukanScope: effectiveKategori === "Pemasukan" ? resolvedPemasukanScope : null,
        pemasukanKind: effectiveKategori === "Pemasukan" ? resolvedPemasukanKind : null,
        tanggal: form.tanggal,
        namaPenghuni: form.namaPenghuni,
        lokasiKos: omitLocUnit ? "" : lokasiKosEff,
        unitBlok: omitLocUnit ? "" : unitBlokEff,
        nominal: String(nominalAngka),
        keterangan: form.keterangan,
        pelaporanBulan: pelaporanSql ?? undefined,
        paymentSplitGroupId: splitGid ? splitGid : undefined,
        updatedAt: new Date().toISOString(),
      };
      const next = editingId
        ? financeData.map((r) => (r.id === editingId ? { ...row, id: editingId } : r))
        : [row, ...financeData];
      setFinanceData(next);
      writeSandboxJson(SB_KEY.finance, next);
      toast(editingId ? "Data finance berhasil diperbarui." : "Transaksi berhasil disimpan.", "success");
      resetForm();
      setShowPaymentForm(false);
      unlockSubmit();
      return;
    }

    const { data: dupCloudRows, error: dupCloudError } = await supabase
      .from("finance")
      .select("id, no_nota, pos, kategori")
      .ilike("no_nota", escapeIlikeExact(notaTrimmed))
      .limit(80);
    if (dupCloudError) {
      setErrorMessage(dupCloudError.message);
      toast(dupCloudError.message, "error");
      unlockSubmit();
      return;
    }
    const mappedDup = (dupCloudRows ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id: String(r.id ?? ""),
        noNota: String(r.no_nota ?? ""),
        pos: String(r.pos ?? ""),
        kategori: String(r.kategori ?? ""),
      };
    });
    if (
      findFinanceRowWithDuplicateNota(mappedDup, notaTrimmed, editingId, {
        pos: form.pos,
        kategori: effectiveKategori,
      })
    ) {
      const dupMsg = financeNotaTakenMessage(notaTrimmed);
      setErrorMessage(dupMsg);
      setRemoteNotaConflictMessage(dupMsg);
      toast(dupMsg, "error");
      unlockSubmit();
      return;
    }

    if (editingId) {
      const { error } = await supabase.from("finance").update(payloadCloud).eq("id", editingId);
      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        unlockSubmit();
        return;
      }
      toast("Data finance berhasil diperbarui.", "success");
    } else {
      const { error } = await supabase.from("finance").insert(payloadCloud);
      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        unlockSubmit();
        return;
      }
      toast("Transaksi berhasil disimpan.", "success");
    }

    await loadFinanceData();
    resetForm();
    setShowPaymentForm(false);
    unlockSubmit();
  };

  const handleEdit = (row: FinanceRow) => {
    if (!canSuperAdminEditFinance) {
      toast("Hanya super admin yang dapat mengedit payment.", "error");
      return;
    }
    setShowPaymentForm(true);
    setEditingId(row.id);
    if (row.kategori === "Pengeluaran") {
      setPengeluaranScopeFilter(normalizePengeluaranScope(row.pengeluaranScope));
    } else {
      setPengeluaranScopeFilter("kos");
    }
    const pb = (row.pelaporanBulan ?? "").trim().slice(0, 10);
    const pelaporanYm = pb.length >= 7 ? pb.slice(0, 7) : "";
    setForm({
      noNota: row.noNota,
      kategori: row.kategori,
      pos: row.pos,
      tanggal: row.tanggal || new Date().toISOString().slice(0, 10),
      namaPenghuni: row.namaPenghuni,
      lokasiKos: row.lokasiKos,
      unitBlok: row.unitBlok,
      nominal: formatRupiahInput(row.nominal || ""),
      keterangan: row.keterangan,
      pelaporanBulan: pelaporanYm,
      paymentSplitGroupId: row.paymentSplitGroupId ?? "",
    });
    setFinanceNotaDigits(sanitizeSrNotaDigits(String(row.noNota ?? "").replace(/^SR/i, "")));
    setInfoMessage("Mode edit payment aktif (super admin).");
    setErrorMessage("");
    setRemoteNotaConflictMessage("");
  };

  const handleDelete = async (row: FinanceRow): Promise<boolean> => {
    const { id } = row;
    setInfoMessage("");
    setErrorMessage("");
    if (localDemoMode) {
      const next = financeData.filter((r) => r.id !== id);
      setFinanceData(next);
      writeSandboxJson(SB_KEY.finance, next);
      const remainingLinked = countFinanceRowsWithSameNotaAndPosKind(next, {
        noNota: row.noNota,
        pos: row.pos,
      });
      if (remainingLinked === 0) {
        const pen = readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
        const cleared = clearPenghuniPaymentLinkedToFinanceRow(pen, { noNota: row.noNota, pos: row.pos });
        const penghuniChanged = cleared.some((p, i) => {
          const o = pen[i];
          if (!o) return false;
          return (
            Boolean(o.sewaKamarPaid) !== Boolean(p.sewaKamarPaid) ||
            String(o.sewaKamarNota ?? "") !== String(p.sewaKamarNota ?? "") ||
            Boolean(o.bookingFeePaid) !== Boolean(p.bookingFeePaid) ||
            String(o.bookingFeeNota ?? "") !== String(p.bookingFeeNota ?? "") ||
            Boolean(o.depositKamarPaid) !== Boolean(p.depositKamarPaid) ||
            String(o.depositKamarNota ?? "") !== String(p.depositKamarNota ?? "")
          );
        });
        if (penghuniChanged) {
          writeSandboxJson(SB_KEY.penghuni, cleared);
        }
      }
      if (editingId === id) resetForm();
      return true;
    }
    const { error } = await supabase.from("finance").delete().eq("id", id);
    if (error) {
      setErrorMessage(error.message);
      toast(error.message, "error", "center");
      return false;
    }
    const nota = (row.noNota ?? "").trim();
    if (nota) {
      const { data: leftRows } = await supabase.from("finance").select("id, pos").ilike("no_nota", escapeIlikeExact(nota));
      const mappedLeft = (leftRows ?? []).map((raw) => {
        const rec = raw as Record<string, unknown>;
        return { noNota: nota, pos: String(rec.pos ?? "") };
      });
      const remainingLinked = countFinanceRowsWithSameNotaAndPosKind(mappedLeft, { noNota: nota, pos: row.pos });
      if (remainingLinked === 0) {
        if (isSewaKamarFinancePos(row.pos)) {
          await supabase
            .from("penghuni")
            .update({ sewa_kamar_paid: false, sewa_kamar_nota: null })
            .eq("sewa_kamar_nota", nota);
        } else if (isBookingFeeFinancePos(row.pos)) {
          await supabase
            .from("penghuni")
            .update({ booking_fee_paid: false, booking_fee_nota: null })
            .eq("booking_fee_nota", nota);
        } else if (isDepositFinancePos(row.pos)) {
          await supabase
            .from("penghuni")
            .update({ deposit_kamar_paid: false, deposit_kamar_nota: null })
            .eq("deposit_kamar_nota", nota);
        }
      }
    }
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("secondroom-penghuni-reload"));
    }
    if (editingId === id) {
      resetForm();
    }
    await loadFinanceData();
    return true;
  };

  const deleteFinanceWithConfirm = async (row: FinanceRow) => {
    const ok = await confirm({
      title: "Hapus transaksi finance?",
      message: `Yakin hapus nota "${row.noNota}" (${row.kategori} · ${row.pos})?`,
      confirmLabel: "Ya",
      cancelLabel: "Tidak",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info", "center");
      return;
    }
    const deleted = await handleDelete(row);
    if (deleted) {
      toast("Data finance berhasil dihapus.", "success", "center");
    }
  };

  const cancelPaymentWithConfirm = async (row: FinanceRow) => {
    if (row.kategori !== "Pemasukan") return;
    const penghuniLabel = (row.namaPenghuni ?? "").trim();
    const ok = await confirm({
      title: "Batalkan pembayaran?",
      message: `Hapus transaksi pemasukan nota "${row.noNota}" (${row.pos} · ${formatNominalDisplay(row.nominal)})${
        penghuniLabel ? ` — ${penghuniLabel}` : ""
      }? Jika tidak ada baris lain dengan nota dan jenis POS yang sama, status lunas di data penghuni akan dicabut.`,
      confirmLabel: "Ya",
      cancelLabel: "Tidak",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info", "center");
      return;
    }
    const deleted = await handleDelete(row);
    if (deleted) {
      toast("Pembayaran berhasil dibatalkan.", "success", "center");
    }
  };

  const cancelPayoutWithConfirm = async (row: FinanceRow) => {
    if (row.kategori !== "Pengeluaran") return;
    const ok = await confirm({
      title: "Batalkan pengeluaran?",
      message: `Hapus transaksi pengeluaran nota "${row.noNota}" (${row.pos} · ${formatNominalDisplay(row.nominal)})? Transaksi ini akan dihapus dari riwayat finance.`,
      confirmLabel: "Ya",
      cancelLabel: "Tidak",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info", "center");
      return;
    }
    const deleted = await handleDelete(row);
    if (deleted) {
      toast("Pengeluaran berhasil dibatalkan.", "success", "center");
    }
  };

  const handleOpenFinanceInvoice = useCallback(
    (row: FinanceRow) => {
      const opened = openFinanceInvoiceTab(row);
      if (!opened) {
        toast("Gagal membuka invoice. Coba izinkan popup browser.", "error");
      }
    },
    [toast]
  );

  const handleApplyRiwayatDates = () => {
    if (financeDraftDateInvalid) {
      toast("Rentang waktu maksimal 1 tahun dan tanggal harus valid.", "error");
      return;
    }
    setFilterRiwayatBusy(true);
    window.setTimeout(() => {
      setAppliedRiwayatStart(draftRiwayatStart);
      setAppliedRiwayatEnd(draftRiwayatEnd);
      setFilterRiwayatBusy(false);
    }, 320);
  };

  const handleResetRiwayatDates = () => {
    const dates = collectFinanceBoundaryYmds(financeData, riwayatDateMode);
    if (!dates.length) {
      toast("Belum ada data finance untuk reset rentang tanggal.", "info");
      return;
    }
    const clamped = clampYmdRangeToMaxYear(dates[0]!, dates[dates.length - 1]!);
    setDraftRiwayatStart(clamped.start);
    setDraftRiwayatEnd(clamped.end);
    setAppliedRiwayatStart(clamped.start);
    setAppliedRiwayatEnd(clamped.end);
    toast(
      riwayatDateMode === "pelaporan"
        ? "Rentang direset sesuai Bulan P&L pada data."
        : "Rentang direset ke seluruh periode tanggal payment.",
      "success"
    );
  };

  const handleOpenLaporanFromFinance = () => {
    if (financeAppliedDateInvalid) {
      toast("Rentang waktu maksimal 1 tahun dan tanggal harus valid.", "error");
      return;
    }
    setLaporanModalOpen(true);
  };

  const handlePickLaporanFinance = async (fokus: LaporanFokusCetak) => {
    if (financeAppliedDateInvalid) {
      toast("Rentang waktu maksimal 1 tahun dan tanggal harus valid.", "error");
      setLaporanModalOpen(false);
      return;
    }
    setLaporanPrepBusy(true);
    setLaporanModalOpen(false);
    try {
      const reportRows = filteredFinanceData.map(financePageRowToReportRow);
      const bundle = await fetchKamarPenghuniSurveyForLaporanExport(localDemoMode);
      const lok = selectedLokasiFilter;
      const unit = selectedUnitFilter;
      const kamarF = filterRowsByFinanceLokasiUnit(bundle.kamarRows, lok, unit);
      const penF = filterRowsByFinanceLokasiUnit(bundle.penghuniRows, lok, unit);
      const surF = filterRowsByFinanceLokasiUnit(bundle.surveyRows, lok, unit);
      const payload = buildLaporanExportPayloadV1({
        generatedAt: new Date(),
        currentUserName: exportUserLabel.trim() || "Pengguna",
        userProfileRole: viewerRole,
        localDemoMode,
        laporanFokus: fokus,
        filters: {
          startDate: appliedRiwayatStart,
          endDate: appliedRiwayatEnd,
          selectedLokasi: lok,
          selectedUnit: unit,
        },
        filteredFinance: reportRows,
        filteredKamar: kamarF,
        monthlyChartData: computeMonthlyChartData(reportRows),
        statusPieData: buildKamarStatusPie(kamarF),
        penghuniRows: penF,
        surveyRows: surF,
      });
      const ok = openLaporanCetakTabWithPayload(payload);
      if (!ok) {
        toast("Penyimpanan penuh. Kurangi data atau kosongkan situs.", "error");
        return;
      }
      toast("Tab laporan lengkap dibuka. Gunakan Print, Unduh PDF, atau Email di sana.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyiapkan laporan.";
      toast(msg, "error");
    } finally {
      setLaporanPrepBusy(false);
    }
  };

  const canSuperAdminCancelFinance = normalizeUserProfileRole(viewerRole) === "super_admin";
  const canSuperAdminEditFinance = canSuperAdminCancelFinance;

  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-10">
      <article className={`${pageHeroSectionClass} space-y-0`}>
        <header className="flex min-w-0 flex-col gap-4 border-b border-[#eadcc9]/65 pb-5 dark:border-[#3f3225]/70 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="min-w-0 flex-1 max-w-none sm:max-w-[min(100%,42rem)]">
            <p className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] text-[#8f714c] dark:text-[#cba97d]">
              <HandCoins size={14} className={`shrink-0 ${iconTone.brand}`} aria-hidden />
              Data Finance
            </p>
            <SectionTitleWithIcon
              icon={HandCoins}
              title="Riwayat Transaksi"
              iconClassName={iconTone.info}
              className="mt-1.5 text-lg text-[#2d2217] sm:text-xl dark:text-[#f6e9d5]"
            />
            <p className="mt-2 text-[12px] leading-relaxed text-[#7f6344] dark:text-[#b79a78]">
              Pemetaan dua P&amp;L mengikuti Master: kos (sewa kamar − pengeluaran kos) dan manajemen (margin −
              pengeluaran manajemen). Ringkasan di bagian bawah muncul jika kategori &quot;Semua&quot;.
            </p>
          </div>
          <div className="flex w-full min-w-0 shrink-0 flex-col gap-2 sm:w-auto md:max-w-none md:flex-row md:flex-wrap md:justify-end">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowPaymentForm(true);
              }}
              className="inline-flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-[#7f8fff] bg-[#6d32ff] px-3 py-2.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.08em] text-white shadow-sm transition hover:bg-[#3f4f9d] active:brightness-95 dark:border-[#8ea2ff] dark:bg-[#4d6dff] dark:hover:bg-[#6d32ff] sm:min-h-0 sm:flex-initial sm:rounded-full sm:py-2 sm:text-[11px]"
            >
              <Plus size={14} className="shrink-0" aria-hidden />
              <span>Input payment baru</span>
            </button>
            <button
              type="button"
              onClick={handleOpenLaporanFromFinance}
              disabled={isLoading || laporanPrepBusy || financeAppliedDateInvalid}
              className="btn-tactile btn-tactile-soft inline-flex min-h-[44px] w-full touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-[#c9b89a] bg-[#fffdf9] px-3 py-2.5 text-center text-[10px] font-semibold uppercase leading-tight tracking-[0.06em] text-[#5c4828] shadow-sm transition hover:bg-[#f5ede0] disabled:cursor-not-allowed disabled:opacity-55 dark:border-[#55442e] dark:bg-[#2a2218] dark:text-[#dfc9a8] dark:hover:bg-[#352a1c] sm:min-h-0 sm:flex-initial sm:rounded-full sm:py-2 sm:text-[11px]"
              title="Buka tab laporan cetak dengan filter lokasi/unit &amp; tanggal yang dipakai di bawah ini"
            >
              <FileText size={14} className="shrink-0" aria-hidden />
              <span>Laporan lengkap</span>
            </button>
            <RefreshToolbarButton
              onRefresh={handleRefreshFinance}
              disabled={isLoading}
              className="w-full justify-center md:w-auto md:shrink-0"
            />
          </div>
        </header>

        <div className="mt-5 space-y-4 sm:mt-6">
          <section
            aria-label="Filter lokasi dan klasifikasi"
            className="rounded-xl border border-[#e5d9c9] bg-[#fffdfb] p-4 shadow-[0_1px_0_rgba(74,54,36,0.04)] dark:border-[#403228] dark:bg-[#231b14]/45 sm:p-4"
          >
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2 gap-y-1">
              <p className={`${pageSectionTitleClass} !mb-0`}>Filter tampilan</p>
              <p className="text-[11px] text-[#8b735a] dark:text-[#aa8f6f]">
                Lokasi · unit · kategori · POS
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className={pageLabelWarmClass}>Lokasi kos</label>
                <select
                  value={selectedLokasiFilter}
                  onChange={(event) => {
                    setSelectedLokasiFilter(event.target.value);
                    setSelectedUnitFilter("Semua Blok/Unit");
                  }}
                  className={pageFieldWarmClass}
                >
                  <option>Semua Lokasi</option>
                  {lokasiFilterOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={pageLabelWarmClass}>Blok / Unit</label>
                <select
                  value={selectedUnitFilter}
                  onChange={(event) => setSelectedUnitFilter(event.target.value)}
                  className={pageFieldWarmClass}
                >
                  <option>Semua Blok/Unit</option>
                  {unitFilterOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={pageLabelWarmClass}>Kategori</label>
                <select
                  value={financeRiwayatKategori}
                  onChange={(event) =>
                    setFinanceRiwayatKategori(event.target.value as "Semua" | FinanceType)
                  }
                  className={pageFieldWarmClass}
                >
                  <option value="Semua">Semua</option>
                  <option value="Pemasukan">Pemasukan</option>
                  <option value="Pengeluaran">Pengeluaran</option>
                </select>
              </div>
              <div className="sm:col-span-2 xl:col-span-1">
                <label className={pageLabelWarmClass}>POS</label>
                <select
                  value={financeRiwayatPos}
                  onChange={(event) => setFinanceRiwayatPos(event.target.value)}
                  className={pageFieldWarmClass}
                >
                  <option value="Semua">Semua POS</option>
                  {riwayatPosOptions.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <section
            aria-label="Periode tanggal riwayat"
            className="rounded-xl border border-[#dfe6ff]/90 bg-gradient-to-br from-[#fafbff] via-[#fffdfb] to-[#f8faff] p-4 dark:border-[#3d4260] dark:from-[#1a2038]/90 dark:via-[#1c1812]/80 dark:to-[#171c32]/90 sm:p-4"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className={`${pageSectionTitleClass} !mb-0`}>Periode transaksi</p>
              {financeAppliedDateInvalid ? (
                <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700 dark:bg-rose-950/55 dark:text-rose-100">
                  Periode tidak valid
                </span>
              ) : (
                <span className="max-w-[18rem] truncate rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-medium text-[#5c5780] ring-1 ring-[#dfe4ff]/80 dark:bg-[#252a46]/85 dark:text-[#c9d3ff] dark:ring-[#4a5690]/50 md:max-w-none">
                  Aktif ({riwayatDateMode === "pelaporan" ? "Bulan P&L" : "Tgl payment"}):{" "}
                  {appliedRiwayatStart}&nbsp;→&nbsp;{appliedRiwayatEnd}
                </span>
              )}
            </div>
            <div className="mb-3">
              <label className={pageLabelWarmClass}>Dasar filter tanggal</label>
              <select
                value={riwayatDateMode}
                onChange={(e) => setRiwayatDateMode(e.target.value === "pelaporan" ? "pelaporan" : "tanggal")}
                className={pageFieldWarmClass}
              >
                <option value="tanggal">Tanggal input payment</option>
                <option value="pelaporan">Bulan P&amp;L (pelaporan)</option>
              </select>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between lg:gap-6">
              <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={pageLabelWarmClass}>Mulai tanggal</label>
                  <input
                    type="date"
                    value={draftRiwayatStart}
                    onChange={(e) => setDraftRiwayatStart(e.target.value)}
                    className={pageFieldWarmClass}
                  />
                </div>
                <div>
                  <label className={pageLabelWarmClass}>Akhir tanggal</label>
                  <input
                    type="date"
                    value={draftRiwayatEnd}
                    onChange={(e) => setDraftRiwayatEnd(e.target.value)}
                    className={pageFieldWarmClass}
                  />
                </div>
              </div>
              <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row sm:items-stretch sm:justify-end lg:w-auto lg:flex-col xl:flex-row">
                <button
                  type="button"
                  onClick={handleApplyRiwayatDates}
                  disabled={financeDraftDateInvalid || filterRiwayatBusy}
                  className="btn-tactile inline-flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#eef3ff] shadow-sm transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-55 sm:min-w-[8.5rem] sm:flex-none sm:rounded-full xl:flex-initial"
                >
                  <Eye size={14} aria-hidden className="shrink-0" />
                  {filterRiwayatBusy ? "Memuat…" : "Tampilkan"}
                </button>
                <button
                  type="button"
                  onClick={handleResetRiwayatDates}
                  className="btn-tactile btn-tactile-soft inline-flex min-h-[44px] flex-1 touch-manipulation items-center justify-center gap-1.5 rounded-xl border border-[#d5be9e] bg-white/90 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6d5232] transition hover:bg-[#faf5ef] dark:border-[#4f3b2a] dark:bg-[#2f2419] dark:text-[#d9bb94] dark:hover:bg-[#3d2f22] sm:flex-none sm:rounded-full xl:flex-initial"
                >
                  <RotateCcw size={14} aria-hidden className="shrink-0" />
                  Reset semua tanggal
                </button>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-[#7a6552] dark:text-[#a89178]">
              Pilih dasar filter: <span className="font-semibold">Tanggal input payment</span> (kolom Tanggal) atau{" "}
              <span className="font-semibold">Bulan P&amp;L</span> (kolom Bulan P&amp;L / alokasi sewa per bulan). Setelah
              mengubah, ketuk <span className="font-semibold">Tampilkan</span>.
            </p>
          </section>
        </div>

        <div className="relative mt-6 border-t border-[#eadcc9]/55 pt-6 dark:border-[#3f3225]/60 sm:mt-7 sm:pt-7">
          <p className={`${pageSectionTitleClass} !mb-1 sm:!mb-2`}>Daftar riwayat</p>
          <p className="mb-4 text-[11px] leading-relaxed text-[#7f6344] sm:mb-5 sm:text-xs dark:text-[#b79a78]">
            Klik baris atau tombol <span className="font-semibold text-[#5c4330] dark:text-[#d9bc95]">Invoice</span>{" "}
            untuk membuka faktur Second Room (print atau unduh PDF).
            {canSuperAdminEditFinance ? (
              <>
                {" "}
                Super admin: gunakan <span className="font-semibold text-[#5c4330] dark:text-[#d9bc95]">Edit</span> untuk
                mengubah payment lewat form.
              </>
            ) : null}
          </p>
          {filterRiwayatBusy ? (
            <div
              className="pointer-events-none absolute inset-0 z-[4] flex flex-col items-center justify-center rounded-2xl bg-[#fffdf9]/75 backdrop-blur-[2px] dark:bg-[#1e1812]/70"
              role="status"
              aria-busy="true"
              aria-label="Memuat riwayat sesuai tanggal"
            >
              <BrandLoader size="md" label="Memuat riwayat…" />
            </div>
          ) : null}
          <div
            className={
              filterRiwayatBusy
                ? "pointer-events-none min-h-[14rem] space-y-5 opacity-55 transition-opacity sm:space-y-6"
                : "space-y-5 transition-opacity sm:space-y-6"
            }
          >
          <FinanceRiwayatTableBlock
            title="Riwayat — Sewa kamar (Pemasukan)"
            hint={`Hanya baris kategori Pemasukan dengan POS "${FINANCE_POS_SEWA_KAMAR}". Basis P&amp;L kos — dikurangi pengeluaran kos (tabel di bawah).`}
            rows={riwayatSewaKamarRows}
            isLoading={isLoading}
            footerSumLabel="Total pemasukan sewa kamar — basis P&L (SUM nominal)"
            setHoverKeterangan={setHoverKeterangan}
            canEditPayment={canSuperAdminEditFinance}
            onEditPayment={handleEdit}
            canCancelPemasukanPayment={canSuperAdminCancelFinance}
            onCancelPemasukanPayment={cancelPaymentWithConfirm}
            canCancelPengeluaranPayment={canSuperAdminCancelFinance}
            onCancelPengeluaranPayment={cancelPayoutWithConfirm}
            onRowDoubleClick={handleOpenFinanceInvoice}
          />

          <FinanceRiwayatTableBlock
            title="Riwayat — Pemasukan di luar sewa kamar"
            hint="Dasar P&amp;L manajemen: pemasukan selain sewa kamar. Dikurangi pengeluaran manajemen (tabel terpisah)."
            rows={riwayatNonSewaKamarPemasukanRows}
            isLoading={isLoading}
            footerSumLabel="Total margin manajemen (SUM nominal)"
            setHoverKeterangan={setHoverKeterangan}
            canEditPayment={canSuperAdminEditFinance}
            onEditPayment={handleEdit}
            canCancelPemasukanPayment={canSuperAdminCancelFinance}
            onCancelPemasukanPayment={cancelPaymentWithConfirm}
            canCancelPengeluaranPayment={canSuperAdminCancelFinance}
            onCancelPengeluaranPayment={cancelPayoutWithConfirm}
            onRowDoubleClick={handleOpenFinanceInvoice}
          />

          <FinanceRiwayatTableBlock
            title="Riwayat — Pengeluaran kos"
            hint="POS pengeluaran dengan lingkup &quot;kos&quot; di Master. Membentuk P&amp;L kos bersama pemasukan sewa kamar."
            rows={riwayatPengeluaranKosRows}
            isLoading={isLoading}
            footerSumLabel="Total pengeluaran kos (SUM nominal)"
            footerSumTone="expense"
            setHoverKeterangan={setHoverKeterangan}
            canEditPayment={canSuperAdminEditFinance}
            onEditPayment={handleEdit}
            canCancelPemasukanPayment={canSuperAdminCancelFinance}
            onCancelPemasukanPayment={cancelPaymentWithConfirm}
            canCancelPengeluaranPayment={canSuperAdminCancelFinance}
            onCancelPengeluaranPayment={cancelPayoutWithConfirm}
            onRowDoubleClick={handleOpenFinanceInvoice}
          />

          <FinanceRiwayatTableBlock
            title="Riwayat — Pengeluaran manajemen"
            hint="POS pengeluaran dengan lingkup &quot;manajemen&quot; di Master. Membentuk P&amp;L manajemen bersama margin."
            rows={riwayatPengeluaranManajemenRows}
            isLoading={isLoading}
            footerSumLabel="Total pengeluaran manajemen (SUM nominal)"
            footerSumTone="expense"
            setHoverKeterangan={setHoverKeterangan}
            canEditPayment={canSuperAdminEditFinance}
            onEditPayment={handleEdit}
            canCancelPemasukanPayment={canSuperAdminCancelFinance}
            onCancelPemasukanPayment={cancelPaymentWithConfirm}
            canCancelPengeluaranPayment={canSuperAdminCancelFinance}
            onCancelPengeluaranPayment={cancelPayoutWithConfirm}
            onRowDoubleClick={handleOpenFinanceInvoice}
          />

          {plKosSewaMinusPengeluaranKos !== null && plManajemenMarginMinusPengeluaran !== null && !isLoading ? (
            <div className="rounded-2xl border border-[#eadcc9] bg-[#fffdf9] px-4 py-3 text-sm dark:border-[#3d2f22] dark:bg-[#2b2016]">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#8f724d] dark:text-[#c8a97f]">
                Ringkasan dua P&amp;L (filter saat ini)
              </p>
              <p className="mt-2 text-[#2d2217] dark:text-[#f6e9d5]">
                <span className="font-medium">P&amp;L kos</span>
                {" "}
                (sewa kamar − pengeluaran kos):{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    plKosSewaMinusPengeluaranKos < 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-[#2d2217] dark:text-[#f6e9d5]"
                  }`}
                >
                  {formatNominalDisplay(String(plKosSewaMinusPengeluaranKos))}
                </span>
              </p>
              <p className="mt-1 text-xs text-[#6b5238] dark:text-[#b79a78]">
                {formatNominalDisplay(String(sumSewaKamarNominal))} −{" "}
                {formatNominalDisplay(String(sumPengeluaranKosNominal))}
              </p>
              <p className="mt-3 text-[#2d2217] dark:text-[#f6e9d5]">
                <span className="font-medium">P&amp;L manajemen</span>
                {" "}
                (margin − pengeluaran manajemen):{" "}
                <span
                  className={`font-semibold tabular-nums ${
                    plManajemenMarginMinusPengeluaran < 0
                      ? "text-rose-700 dark:text-rose-300"
                      : "text-emerald-800 dark:text-emerald-200"
                  }`}
                >
                  {formatNominalDisplay(String(plManajemenMarginMinusPengeluaran))}
                </span>
              </p>
              <p className="mt-1 text-xs text-[#6b5238] dark:text-[#b79a78]">
                {formatNominalDisplay(String(sumNonSewaPemasukanNominal))} −{" "}
                {formatNominalDisplay(String(sumPengeluaranManajemenNominal))}
              </p>
              <p className="mt-2 border-t border-[#dcc7aa] pt-2 text-[11px] leading-snug text-[#7f6344] dark:text-[#b79a78]">
                Transaksi lama tanpa kolom lingkup di database diperlakukan sebagai pengeluaran kos setelah migrasi
                SQL; sesuaikan POS di Master bila perlu.
              </p>
            </div>
          ) : null}
          </div>
        </div>
      </article>

      <LaporanLengkapChoiceModal
        open={laporanModalOpen}
        busy={laporanPrepBusy}
        onClose={() => {
          if (laporanPrepBusy) return;
          setLaporanModalOpen(false);
        }}
        onPick={(fokus) => void handlePickLaporanFinance(fokus)}
      />

      {showPaymentForm ? (
        <>
          <button
            type="button"
            className="btn-flat fixed inset-0 z-[200] cursor-default bg-black/45 backdrop-blur-[1px]"
            aria-label="Tutup panel input payment"
            onClick={() => {
              resetForm();
              setShowPaymentForm(false);
            }}
          />
          <aside
            className="fixed inset-y-0 right-0 z-[210] flex w-full max-w-md flex-col border-l border-[#d6ddff] bg-[#f7f8ff] shadow-[-16px_0_48px_-24px_rgba(40,57,120,0.45)] dark:border-[#424a80] dark:bg-[#1b1f3d]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-payment-panel-title"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div id="finance-payment-panel-title">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[#8b6d48] dark:text-[#cfb089]">
                    <ReceiptText size={14} className={iconTone.brand} />
                    Finance Form
                  </p>
                  <SectionTitleWithIcon
                    icon={ReceiptText}
                    title={editingId ? "Edit Payment" : "Input Payment"}
                    iconClassName={iconTone.info}
                    className="mt-2 text-2xl text-[#2c2218] dark:text-[#f5e8d4]"
                  />
                  <p className="mt-2 text-sm text-[#7f6344] dark:text-[#b79a78]">
                    {editingId
                      ? "Ubah data transaksi ini, lalu simpan dengan Update Payment."
                      : "Isi transaksi pemasukan/pengeluaran dari panel samping ini."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowPaymentForm(false);
                  }}
                  className="rounded-full p-2 text-[#6e5336] transition hover:bg-[#efe2d1] dark:text-[#d9bc95] dark:hover:bg-[#33261b]"
                  aria-label="Tutup form input"
                >
                  <X size={22} />
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label htmlFor="finance-no-nota" className={pageLabelWarmClass}>
                No Nota
              </label>
              <p className="mb-1 text-[11px] text-[#7f6344] dark:text-[#b79a78]">
                Format: <span className="font-semibold">SR</span> + maks. {SR_NOTA_MAX_DIGITS} digit angka.
                {lastUsedSrNota ? (
                  <>
                    {" "}
                    · Terakhir dipakai:{" "}
                    <span className="font-semibold text-[#5c4330] dark:text-[#e8dcc8]">{lastUsedSrNota}</span>
                    {" "}
                    · Otomatis diisi nomor berikutnya (bisa diubah).
                  </>
                ) : (
                  <> · Belum ada nomor nota sebelumnya · Otomatis diisi SR0001 (bisa diubah).</>
                )}
              </p>
              <div
                className={`flex min-h-[46px] w-full items-center overflow-hidden rounded-xl border bg-[#fffdf9] text-sm outline-none ring-[#c09c70] sm:min-h-[42px] sm:rounded-2xl dark:bg-[#2b2016] ${
                  localNotaConflictMessage || remoteNotaConflictMessage
                    ? "border-red-400 ring-red-200 focus-within:ring-2 focus-within:ring-red-300 dark:border-red-500/80 dark:ring-red-900/40"
                    : "border-[#dcc7aa] focus-within:ring-2 dark:border-[#4d3925]"
                }`}
              >
                <span className="shrink-0 select-none border-r border-[#e5d8c4] bg-[#f3ebe0] px-3 py-2.5 font-semibold tracking-wide text-[#5c4330] dark:border-[#4f3b2a] dark:bg-[#2a2018] dark:text-[#e8dcc8]">
                  SR
                </span>
                <input
                  id="finance-no-nota"
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={SR_NOTA_MAX_DIGITS}
                  value={financeNotaDigits}
                  onChange={(event) => {
                    const digits = sanitizeSrNotaDigits(event.target.value);
                    setFinanceNotaDigits(digits);
                    setForm((prev) => ({ ...prev, noNota: formatSrNotaFromDigits(digits) }));
                    if (errorMessage) setErrorMessage("");
                  }}
                  aria-invalid={Boolean(localNotaConflictMessage || remoteNotaConflictMessage)}
                  aria-describedby={
                    localNotaConflictMessage || remoteNotaConflictMessage
                      ? "finance-no-nota-alert"
                      : undefined
                  }
                  className="min-h-0 min-w-0 flex-1 border-0 bg-transparent px-3 py-2.5 text-[16px] outline-none placeholder:text-[#9d7e55]/70 sm:py-2.5 sm:text-sm"
                  placeholder="contoh: 0001"
                />
              </div>
              {localNotaConflictMessage || remoteNotaConflictMessage ? (
                <p
                  id="finance-no-nota-alert"
                  role="alert"
                  className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                >
                  {localNotaConflictMessage || remoteNotaConflictMessage}
                </p>
              ) : null}
            </div>
            <div>
              <label className={pageLabelWarmClass}>Kategori</label>
              <select
                value={form.kategori}
                onChange={(event) => {
                  const next = event.target.value as FinanceType;
                  setPengeluaranScopeFilter("kos");
                  setForm((prev) => ({ ...prev, kategori: next, pos: "" }));
                }}
                className={pageFieldWarmClass}
              >
                <option value="Pemasukan">Pemasukan</option>
                <option value="Pengeluaran">Pengeluaran</option>
              </select>
            </div>
            {form.kategori === "Pengeluaran" ? (
              <div className="md:col-span-2">
                <label className={pageLabelWarmClass}>Tipe pengeluaran</label>
                <p className="mb-2 text-[11px] leading-snug text-[#7f6344] dark:text-[#b79a78]">
                  Pisahkan pengeluaran operasional kost dan pengeluaran manajemen. POS daftar mengikuti klasifikasi di
                  Master (lingkup kos / manajemen).
                </p>
                <div className="flex flex-wrap gap-3">
                  <label className={pageWarmChoiceClass}>
                    <input
                      type="radio"
                      name="finance-pengeluaran-scope"
                      className="accent-[#6d32ff]"
                      checked={normalizePengeluaranScope(pengeluaranScopeFilter) === "kos"}
                      onChange={() => {
                        setPengeluaranScopeFilter("kos");
                        setForm((prev) => ({ ...prev, pos: "" }));
                      }}
                    />
                    Pengeluaran kos
                  </label>
                  <label className={pageWarmChoiceClass}>
                    <input
                      type="radio"
                      name="finance-pengeluaran-scope"
                      className="accent-[#6d32ff]"
                      checked={normalizePengeluaranScope(pengeluaranScopeFilter) === "manajemen"}
                      onChange={() => {
                        setPengeluaranScopeFilter("manajemen");
                        setForm((prev) => ({ ...prev, pos: "", lokasiKos: "", unitBlok: "" }));
                      }}
                    />
                    Pengeluaran manajemen
                  </label>
                </div>
              </div>
            ) : null}
            <div>
              <label className={pageLabelWarmClass}>POS</label>
              <select
                value={form.pos}
                onChange={(event) => {
                  const nextPos = event.target.value;
                  setForm((prev) => ({ ...prev, pos: nextPos }));
                  if (isForcedPemasukanManajemenFinancePos(nextPos) && form.kategori === "Pengeluaran") {
                    setInfoMessage(
                      `POS "${nextPos}": dicatat sebagai pengeluaran kos (mengurangi P&L kos) dan sekaligus pemasukan manajemen di ringkasan P&L.`
                    );
                  }
                }}
                disabled={effectivePosOptions.length === 0}
                className={`${pageFieldWarmClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {effectivePosOptions.length > 0 ? (
                  effectivePosOptions.map((pos) => (
                    <option key={pos.id} value={pos.label}>
                      {pos.label}
                    </option>
                  ))
                ) : (
                  <option value="">Tambah POS di Master Data (tab Finance)</option>
                )}
              </select>
            </div>
            <div>
              <label className={pageLabelWarmClass}>Tanggal</label>
              <input
                type="date"
                required
                value={form.tanggal}
                onChange={(event) => setForm((prev) => ({ ...prev, tanggal: event.target.value }))}
                className={pageFieldWarmClass}
              />
              <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-[#8f714c] dark:text-[#b79a78]">
                Bulan P&amp;L (kalender, opsional)
              </label>
              <input
                type="month"
                value={
                  String(form.pelaporanBulan ?? "").trim().length >= 7
                    ? String(form.pelaporanBulan ?? "").trim().slice(0, 7)
                    : ""
                }
                onChange={(event) => {
                  const v = event.target.value;
                  setForm((prev) => ({ ...prev, pelaporanBulan: v ? `${v}-01` : "" }));
                }}
                className={`${pageFieldWarmClass} mt-1`}
              />
              <p className="mt-1 text-[10px] text-[#7d6042] dark:text-[#9a7d5c]">
                Kosongkan agar dashboard owner memakai bulan dari tanggal transaksi. Diisi untuk mengalokasikan ke bulan kalender tertentu.
              </p>
            </div>
            <div>
              <label className={pageLabelWarmClass}>
                {form.kategori === "Pengeluaran" ? "Kepada (Opsional)" : "Nama Penghuni (Opsional)"}
              </label>
              <input
                value={form.namaPenghuni}
                onChange={(event) => setForm((prev) => ({ ...prev, namaPenghuni: event.target.value }))}
                className={pageFieldWarmClass}
                placeholder={
                  form.kategori === "Pengeluaran"
                    ? "Nama penerima / kepada (opsional)"
                    : "Nama penghuni (opsional)"
                }
              />
            </div>
            <div>
              <label
                className={`${pageLabelWarmClass} ${lokasiUnitNotApplicable ? "text-[#9d8875] dark:text-[#8a745c]" : ""}`}
              >
                Lokasi Kos
                {lokasiUnitNotApplicable ? (
                  <span className="ml-1 font-normal normal-case tracking-normal text-[10px] text-[#a08b72] dark:text-[#8a745c]">
                    (tidak diperlukan)
                  </span>
                ) : null}
              </label>
              <select
                value={lokasiUnitNotApplicable ? "" : form.lokasiKos}
                disabled={lokasiUnitNotApplicable}
                onChange={(event) => {
                  const nextLokasi = event.target.value;
                  setForm((prev) => ({
                    ...prev,
                    lokasiKos: nextLokasi,
                    unitBlok: "",
                  }));
                }}
                className={`${pageFieldWarmClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {!lokasiUnitNotApplicable ? (
                  <>
                    <option value="">{LOKASI_PICK_LABEL}</option>
                    {lokasiOptionsForSelect.length === 0 ? (
                      <option value={PLACEHOLDER_LOKASI_FORM} disabled>
                        {PLACEHOLDER_LOKASI_FORM}
                      </option>
                    ) : (
                      lokasiOptionsForSelect.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))
                    )}
                  </>
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
            <div>
              <label
                className={`${pageLabelWarmClass} ${lokasiUnitNotApplicable ? "text-[#9d8875] dark:text-[#8a745c]" : ""}`}
              >
                Blok / Unit
                {lokasiUnitNotApplicable ? (
                  <span className="ml-1 font-normal normal-case tracking-normal text-[10px] text-[#a08b72] dark:text-[#8a745c]">
                    (tidak diperlukan)
                  </span>
                ) : null}
              </label>
              <select
                value={lokasiUnitNotApplicable ? "" : form.unitBlok}
                disabled={lokasiUnitNotApplicable || !isValidRealLokasiForPengeluaranKos(form.lokasiKos)}
                onChange={(event) => setForm((prev) => ({ ...prev, unitBlok: event.target.value }))}
                className={`${pageFieldWarmClass} disabled:cursor-not-allowed disabled:opacity-60`}
              >
                {!lokasiUnitNotApplicable ? (
                  !isValidRealLokasiForPengeluaranKos(form.lokasiKos) ? (
                    <option value="">{UNIT_NEED_LOKASI_LABEL}</option>
                  ) : unitOptionsForSelect.length === 0 ? (
                    <option value="">{PLACEHOLDER_UNIT_FORM}</option>
                  ) : (
                    <>
                      {!isValidRealUnitForPengeluaranKos(form.unitBlok) ? (
                        <option value="">{UNIT_PICK_LABEL}</option>
                      ) : null}
                      {unitOptionsForSelect.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </>
                  )
                ) : (
                  <option value="">—</option>
                )}
              </select>
            </div>
            <div>
              <label className={pageLabelWarmClass}>Nominal Rupiah</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#8b6d48] dark:text-[#b79a78]">
                  Rp
                </span>
                <input
                  required
                  inputMode="numeric"
                  autoComplete="off"
                  value={form.nominal}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, nominal: formatRupiahInput(event.target.value) }))
                  }
                  className={`${pageFieldWarmClass} pl-12 sm:pl-11`}
                  placeholder="0"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className={pageLabelWarmClass}>Keterangan</label>
              <textarea
                rows={4}
                value={form.keterangan}
                onChange={(event) => setForm((prev) => ({ ...prev, keterangan: event.target.value }))}
                className={pageTextareaWarmClass}
                placeholder="Keterangan transaksi..."
              />
            </div>
          </div>

          {(infoMessage || errorMessage) && <p className={`rounded-xl px-3 py-2 text-sm ${errorMessage ? "border border-red-200 bg-red-50 text-red-600" : "border border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{errorMessage || infoMessage}</p>}

          <div className="flex flex-wrap gap-3">
            <ActionButtonWithIcon
              icon={Save}
              type="submit"
              disabled={
                isSubmitting ||
                effectivePosOptions.length === 0 ||
                !isValidSrNotaDigits(financeNotaDigits) ||
                Boolean(localNotaConflictMessage || remoteNotaConflictMessage)
              }
              iconClassName={iconTone.success}
              label={isSubmitting ? "Processing..." : editingId ? "Update Payment" : "Payment"}
              className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-8 py-3 text-sm font-semibold tracking-[0.15em] text-[#eef3ff] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
            />
            {editingId && (
              <ActionButtonWithIcon
                icon={X}
                onClick={() => {
                  resetForm();
                  setShowPaymentForm(false);
                }}
                label="Batal Edit"
                iconClassName={iconTone.warning}
                className="rounded-full border border-[#c8d3ff] px-6 py-3 text-sm font-semibold text-[#4f61aa] transition hover:bg-[#eef2ff] dark:border-[#424a80] dark:text-[#dbe3ff] dark:hover:bg-[#232a4d]"
              />
            )}
          </div>
              </form>
            </div>
          </aside>
        </>
      ) : null}

      {hoverKeterangan ? (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[250] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-[#dcc7aa] bg-[#fffdf9] p-3 text-left text-xs text-[#3f2f1f] shadow-2xl dark:border-[#4d3925] dark:bg-[#2b2016] dark:text-[#e8dcc8]"
          style={{
            left: Math.max(
              12,
              Math.min(
                hoverKeterangan.x,
                typeof window !== "undefined" ? window.innerWidth - 12 : hoverKeterangan.x
              )
            ),
            top: hoverKeterangan.y + 14,
            transform: "translateX(-50%)",
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
            Keterangan
          </p>
          {hoverKeterangan.namaPenghuni ? (
            <p className="mt-1 text-[11px] font-medium text-[#5e462e] dark:text-[#d8be99]">
              {hoverKeterangan.kategori === "Pengeluaran" ? "Kepada" : "Penghuni"}:{" "}
              {hoverKeterangan.namaPenghuni}
            </p>
          ) : null}
          <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap">{hoverKeterangan.text}</p>
        </div>
      ) : null}
    </section>
  );
}
