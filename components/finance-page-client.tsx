"use client";

import {
  type Dispatch,
  type SetStateAction,
  FormEvent,
  MouseEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/libsupabaseClient";
import { HandCoins, Plus, ReceiptText, Save, X } from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import RefreshToolbarButton from "@/components/ui/refresh-toolbar-button";
import StatusBadge from "@/components/ui/status-badge";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY, newSandboxId } from "@/lib/sandbox-storage";
import {
  clearPenghuniPaymentLinkedToFinanceRow,
  countFinanceRowsWithSameNotaAndPosKind,
  FINANCE_POS_SEWA_KAMAR,
  isDepositFinancePos,
  isSewaKamarFinancePos,
} from "@/lib/penghuni-finance-payment-sync";
import type { PenghuniRow } from "@/components/penghuni-page-client";
import type { KamarRow } from "@/components/kamar-page-client";
import { buildDemoLokasiList, buildDemoUnitList } from "@/lib/demo-form-options";
import {
  escapeIlikeExact,
  financeNotaTakenMessage,
  findFinanceRowWithDuplicateNota,
  normalizeNotaKey,
} from "@/lib/finance-nota-validation";

type FinanceType = "Pemasukan" | "Pengeluaran";

export type FinanceRow = {
  id: string;
  noNota: string;
  kategori: FinanceType;
  pos: string;
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

/** Tampilan tabel / ringkasan: angka mentah atau terformat → Rp … */
function formatNominalDisplay(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return raw?.trim() ? raw : "—";
  return `Rp ${Number(digits).toLocaleString("id-ID")}`;
}

function isPosSewaKamar(pos: string): boolean {
  return (pos ?? "").trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase();
}

/** Hanya baris Pemasukan dengan POS sewa kamar (untuk tabel room revenue). */
function isSewaKamarPemasukanRow(row: FinanceRow): boolean {
  return row.kategori === "Pemasukan" && isPosSewaKamar(row.pos);
}

function sortFinanceRowsDesc(rows: FinanceRow[]): FinanceRow[] {
  return [...rows].sort((a, b) => {
    const ud = String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));
    if (ud !== 0) return ud;
    const td = String(b.tanggal || "").localeCompare(String(a.tanggal || ""));
    if (td !== 0) return td;
    return String(b.id).localeCompare(String(a.id));
  });
}

function sumNominalRows(rows: FinanceRow[]): number {
  return rows.reduce((sum, r) => sum + parseRupiahToNumber(r.nominal), 0);
}

type HoverKeteranganState = { id: string; text: string; x: number; y: number } | null;

function FinanceRiwayatTableBlock({
  title,
  hint,
  rows,
  isLoading,
  footerSumLabel,
  setHoverKeterangan,
}: {
  title: string;
  hint?: string;
  rows: FinanceRow[];
  isLoading: boolean;
  footerSumLabel: string;
  setHoverKeterangan: Dispatch<SetStateAction<HoverKeteranganState>>;
}) {
  const sumNominal = sumNominalRows(rows);

  const bindRowHover = (row: FinanceRow) => ({
    onMouseEnter: (e: MouseEvent<HTMLTableRowElement>) =>
      setHoverKeterangan({
        id: row.id,
        text: row.keterangan?.trim() || "Tidak ada keterangan.",
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

  return (
    <div>
      <h3 className="text-sm font-semibold text-[#2d2217] dark:text-[#f6e9d5]">{title}</h3>
      {hint ? <p className="mt-1 text-xs text-[#7f6344] dark:text-[#b79a78]">{hint}</p> : null}
      <div className="mt-3 max-h-[min(50vh,420px)] overflow-x-auto overflow-y-auto rounded-2xl border border-[#eadcc9] dark:border-[#3d2f22]">
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
                <td className="px-3 py-3 text-sm text-[#856948] dark:text-[#bca17f]" colSpan={7}>
                  Memuat data finance...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-sm text-[#856948] dark:text-[#bca17f]" colSpan={7}>
                  Belum ada data untuk filter ini.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="cursor-help border-t border-[#efe2d1] dark:border-[#33261b]"
                  {...bindRowHover(row)}
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
                  <td className="px-3 py-2.5">
                    {row.kategori === "Pemasukan" ? (
                      <span className="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                        Paid
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-800 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200">
                        Paid Out
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!isLoading && rows.length > 0 ? (
            <tfoot className="border-t-2 border-[#d4bc9a] bg-[#f0e4d4] dark:border-[#5c452d] dark:bg-[#2a1f16]">
              <tr className="text-xs font-semibold uppercase tracking-[0.1em] text-[#4a3624] dark:text-[#e8d4bc]">
                <td className="px-3 py-2.5 text-right md:text-right" colSpan={5}>
                  {footerSumLabel}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-sm text-emerald-900 dark:text-emerald-200">
                  {formatNominalDisplay(String(sumNominal))}
                </td>
                <td className="px-3 py-2.5" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </div>
  );
}

export default function FinancePageClient({
  initialFinanceData,
  posOptions,
}: {
  initialFinanceData: FinanceRow[];
  posOptions: FinancePosOption[];
}) {
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
  const [financeData, setFinanceData] = useState<FinanceRow[]>(initialFinanceData);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [financeRiwayatKategori, setFinanceRiwayatKategori] = useState<"Semua" | FinanceType>("Semua");
  const [financeRiwayatPos, setFinanceRiwayatPos] = useState<string>("Semua");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [selectedLokasiFilter, setSelectedLokasiFilter] = useState("Semua Lokasi");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("Semua Blok/Unit");
  /** Duplikat terdeteksi dari server (data client belum punya baris itu). */
  const [remoteNotaConflictMessage, setRemoteNotaConflictMessage] = useState("");

  const effectiveFinanceData = financeData;

  const localNotaConflictMessage = useMemo(() => {
    const trimmed = form.noNota.trim();
    if (!normalizeNotaKey(trimmed)) return "";
    if (findFinanceRowWithDuplicateNota(financeData, trimmed, editingId)) {
      return financeNotaTakenMessage(trimmed);
    }
    return "";
  }, [form.noNota, financeData, editingId]);

  useEffect(() => {
    if (localDemoMode || !showPaymentForm) {
      setRemoteNotaConflictMessage("");
      return;
    }
    if (localNotaConflictMessage) {
      setRemoteNotaConflictMessage("");
      return;
    }
    const trimmed = form.noNota.trim();
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
          .select("id, no_nota, payment_split_group_id")
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
            paymentSplitGroupId: r.payment_split_group_id ? String(r.payment_split_group_id) : undefined,
          };
        });
        if (findFinanceRowWithDuplicateNota(mapped, trimmed, editingId)) {
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
  }, [form.noNota, editingId, localDemoMode, showPaymentForm, localNotaConflictMessage]);

  useEffect(() => {
    if (!localDemoMode) {
      setFinanceData(initialFinanceData);
      return;
    }
    const fin = readSandboxJson<FinanceRow[] | null>(SB_KEY.finance, null);
    if (fin) setFinanceData(fin);
    else setFinanceData(initialFinanceData);
  }, [localDemoMode, initialFinanceData, sandboxRev]);

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
    const m = readSandboxJson<{ financeData?: { id: string; tipe: FinanceType; namaPos: string }[] } | null>(
      SB_KEY.master,
      null
    );
    const rows = m?.financeData ?? [];
    return rows
      .filter((r) => r.tipe === form.kategori)
      .map((r) => ({
        id: r.id,
        label: (r.namaPos || "").trim() || "(Tanpa nama)",
        tipe: r.tipe,
      }))
      .filter((r) => r.label);
  }, [localDemoMode, sandboxReady, sandboxRev, masterRev, form.kategori]);

  const cloudPosFiltered = useMemo(
    () =>
      cloudPosOptions.filter((p) => !p.tipe || p.tipe === form.kategori),
    [cloudPosOptions, form.kategori]
  );

  const effectivePosOptions = useMemo(
    () => (localDemoMode ? posFromMasterDemo : cloudPosFiltered),
    [localDemoMode, posFromMasterDemo, cloudPosFiltered]
  );

  const getDefaultPosForKategori = (k: FinanceType) => {
    if (localDemoMode) {
      if (!sandboxReady) return "";
      const m = readSandboxJson<{ financeData?: { tipe: FinanceType; namaPos: string }[] } | null>(
        SB_KEY.master,
        null
      );
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
    return lokasiMatch && unitMatch && katMatch && posMatch;
  });

  const riwayatSewaKamarRows = useMemo(
    () => sortFinanceRowsDesc(filteredFinanceData.filter(isSewaKamarPemasukanRow)),
    [filteredFinanceData]
  );

  const riwayatNonSewaKamarRows = useMemo(
    () => sortFinanceRowsDesc(filteredFinanceData.filter((r) => !isSewaKamarPemasukanRow(r))),
    [filteredFinanceData]
  );

  const formLokasiOptions = useMemo(() => {
    if (localDemoMode) {
      return buildDemoLokasiList(sandboxReady, kamarSandboxRows, rowsForLocationMerge);
    }
    return lokasiFilterOptions.length ? lokasiFilterOptions : ["(Belum ada data lokasi)"];
  }, [localDemoMode, sandboxReady, kamarSandboxRows, rowsForLocationMerge, lokasiFilterOptions]);

  const formUnitOptions = useMemo(() => {
    if (localDemoMode) {
      return buildDemoUnitList(sandboxReady, form.lokasiKos, kamarSandboxRows, rowsForLocationMerge);
    }
    const allRows = rowsForLocationMerge.filter((r) => !form.lokasiKos || r.lokasiKos === form.lokasiKos);
    const arr = Array.from(new Set(allRows.map((r) => r.unitBlok).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "id")
    );
    return arr.length ? arr : ["(Belum ada unit untuk lokasi ini)"];
  }, [localDemoMode, sandboxReady, form.lokasiKos, kamarSandboxRows, rowsForLocationMerge]);

  const lokasiOptionsForSelect = useMemo(() => {
    const base = [...formLokasiOptions];
    if (form.lokasiKos && !base.includes(form.lokasiKos)) {
      return [form.lokasiKos, ...base];
    }
    return base;
  }, [formLokasiOptions, form.lokasiKos]);

  const unitOptionsForSelect = useMemo(() => {
    const base = [...formUnitOptions];
    if (form.unitBlok && !base.includes(form.unitBlok)) {
      return [form.unitBlok, ...base];
    }
    return base;
  }, [formUnitOptions, form.unitBlok]);

  useEffect(() => {
    const first = formLokasiOptions[0];
    if (!first) return;
    setForm((prev) => (prev.lokasiKos ? prev : { ...prev, lokasiKos: first }));
  }, [formLokasiOptions]);

  useEffect(() => {
    const labels = effectivePosOptions.map((p) => p.label);
    if (labels.length === 0) {
      setForm((prev) => (prev.pos === "" ? prev : { ...prev, pos: "" }));
      return;
    }
    setForm((prev) => (labels.includes(prev.pos) ? prev : { ...prev, pos: labels[0] }));
  }, [effectivePosOptions]);

  useEffect(() => {
    const first = formUnitOptions[0] ?? "";
    if (!form.unitBlok || !formUnitOptions.includes(form.unitBlok)) {
      setForm((prev) => ({ ...prev, unitBlok: first }));
    }
  }, [form.lokasiKos, formUnitOptions]);

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

  const loadFinanceData = async (): Promise<boolean> => {
    setIsLoading(true);
    if (localDemoMode) {
      const fin = readSandboxJson<FinanceRow[]>(SB_KEY.finance, initialFinanceData);
      setFinanceData(fin);
      setErrorMessage("");
      setIsLoading(false);
      return true;
    }

    const [{ data: financeRows, error: financeError }, { data: kategoriRows, error: kategoriError }] =
      await Promise.all([
        supabase.from("finance").select("*").order("updated_at", { ascending: false }),
        supabase.from("finance_kategori").select("id, nama_pos, tipe"),
      ]);

    if (financeError) {
      setErrorMessage(financeError.message);
      setIsLoading(false);
      return false;
    }

    if (!kategoriError && kategoriRows && kategoriRows.length > 0) {
      setCloudPosOptions(
        kategoriRows.map((row) => {
          const rec = row as Record<string, unknown>;
          const label = String(rec.nama_pos ?? "").trim() || "POS";
          const tipeRaw = String(rec.tipe ?? "Pemasukan");
          const tipe: FinanceType = tipeRaw === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";
          return { id: String(rec.id ?? label), label, tipe };
        })
      );
    }

    setErrorMessage("");
    setFinanceData(
      (financeRows ?? []).map((row) => {
        const rec = row as Record<string, unknown>;
        const pb = rec.pelaporan_bulan;
        const pelaporanBulan =
          typeof pb === "string"
            ? pb.slice(0, 10)
            : pb && typeof pb === "object" && "toISOString" in (pb as Date)
              ? (pb as Date).toISOString().slice(0, 10)
              : pb
                ? String(pb).slice(0, 10)
                : "";
        return {
          id: String(rec.id ?? ""),
          noNota: String(rec.no_nota ?? ""),
          kategori: String(rec.kategori ?? "") === "Pengeluaran" ? "Pengeluaran" : "Pemasukan",
          pos: String(rec.pos ?? ""),
          tanggal: String(rec.tanggal ?? ""),
          namaPenghuni: String(rec.nama_penghuni ?? ""),
          lokasiKos: String(rec.lokasi_kos ?? ""),
          unitBlok: String(rec.unit_blok ?? ""),
          nominal: String(rec.nominal ?? ""),
          keterangan: String(rec.keterangan ?? ""),
          pelaporanBulan: pelaporanBulan || undefined,
          paymentSplitGroupId: rec.payment_split_group_id
            ? String(rec.payment_split_group_id)
            : undefined,
          updatedAt: rec.updated_at
            ? String(rec.updated_at)
            : rec.created_at
              ? String(rec.created_at)
              : undefined,
        };
      })
    );
    setIsLoading(false);
    return true;
  };

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
    const lokasiAwal = formLokasiOptions[0] ?? "";
    setForm({
      noNota: "",
      kategori: "Pemasukan",
      pos: getDefaultPosForKategori("Pemasukan"),
      tanggal: new Date().toISOString().slice(0, 10),
      namaPenghuni: "",
      lokasiKos: lokasiAwal,
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
    setIsSubmitting(true);
    setInfoMessage("");
    setErrorMessage("");

    if (!form.pos.trim()) {
      toast("Pilih POS terlebih dahulu (Master Data / finance_kategori).", "error");
      setIsSubmitting(false);
      return;
    }

    const nominalAngka = parseRupiahToNumber(form.nominal);
    if (!form.nominal.trim() || nominalAngka <= 0) {
      toast("Isi nominal Rupiah lebih dari 0.", "error");
      setIsSubmitting(false);
      return;
    }

    const notaTrimmed = form.noNota.trim();
    if (!normalizeNotaKey(notaTrimmed)) {
      toast("Isi No Nota terlebih dahulu.", "error");
      setIsSubmitting(false);
      return;
    }

    const dupLocal = findFinanceRowWithDuplicateNota(financeData, notaTrimmed, editingId);
    if (dupLocal) {
      const dupMsg = financeNotaTakenMessage(notaTrimmed);
      setErrorMessage(dupMsg);
      toast(dupMsg, "error");
      setIsSubmitting(false);
      return;
    }

    const ymPel = String(form.pelaporanBulan ?? "").trim();
    const pelaporanSql = ymPel.length === 7 ? `${ymPel}-01` : ymPel.length >= 10 ? ymPel.slice(0, 10) : null;
    const editingRow = editingId ? financeData.find((r) => r.id === editingId) : undefined;
    const splitGid = (editingRow?.paymentSplitGroupId ?? "").trim() || null;

    const payload: Record<string, unknown> = {
      no_nota: notaTrimmed,
      kategori: form.kategori,
      pos: form.pos,
      tanggal: form.tanggal,
      nama_penghuni: form.namaPenghuni || null,
      lokasi_kos: form.lokasiKos || null,
      unit_blok: form.unitBlok || null,
      nominal: nominalAngka,
      keterangan: form.keterangan,
      pelaporan_bulan: pelaporanSql,
      payment_split_group_id: splitGid,
    };

    if (localDemoMode) {
      const row: FinanceRow = {
        id: editingId ?? newSandboxId(),
        noNota: notaTrimmed,
        kategori: form.kategori,
        pos: form.pos,
        tanggal: form.tanggal,
        namaPenghuni: form.namaPenghuni,
        lokasiKos: form.lokasiKos,
        unitBlok: form.unitBlok,
        nominal: String(nominalAngka),
        keterangan: form.keterangan,
        pelaporanBulan: pelaporanSql ?? undefined,
        paymentSplitGroupId: splitGid ?? undefined,
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
      setIsSubmitting(false);
      return;
    }

    const { data: dupCloudRows, error: dupCloudError } = await supabase
      .from("finance")
      .select("id, no_nota, payment_split_group_id")
      .ilike("no_nota", escapeIlikeExact(notaTrimmed))
      .limit(80);
    if (dupCloudError) {
      setErrorMessage(dupCloudError.message);
      toast(dupCloudError.message, "error");
      setIsSubmitting(false);
      return;
    }
    const mappedDup = (dupCloudRows ?? []).map((raw) => {
      const r = raw as Record<string, unknown>;
      return {
        id: String(r.id ?? ""),
        noNota: String(r.no_nota ?? ""),
        paymentSplitGroupId: r.payment_split_group_id ? String(r.payment_split_group_id) : undefined,
      };
    });
    if (findFinanceRowWithDuplicateNota(mappedDup, notaTrimmed, editingId)) {
      const dupMsg = financeNotaTakenMessage(notaTrimmed);
      setErrorMessage(dupMsg);
      setRemoteNotaConflictMessage(dupMsg);
      toast(dupMsg, "error");
      setIsSubmitting(false);
      return;
    }

    if (editingId) {
      const { error } = await supabase.from("finance").update(payload).eq("id", editingId);
      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        setIsSubmitting(false);
        return;
      }
      toast("Data finance berhasil diperbarui.", "success");
    } else {
      const { error } = await supabase.from("finance").insert(payload);
      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        setIsSubmitting(false);
        return;
      }
      toast("Transaksi berhasil disimpan.", "success");
    }

    await loadFinanceData();
    resetForm();
    setShowPaymentForm(false);
    setIsSubmitting(false);
  };

  const handleEdit = (row: FinanceRow) => {
    setShowPaymentForm(true);
    setEditingId(row.id);
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
    setInfoMessage("Mode edit finance aktif.");
    setErrorMessage("");
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
      toast(error.message, "error");
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
      confirmLabel: "Ya, hapus",
      cancelLabel: "Batal",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info");
      return;
    }
    const deleted = await handleDelete(row);
    if (deleted) {
      toast("Data finance berhasil dihapus.", "success");
    }
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-10">
      <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-6 shadow-[0_20px_50px_-35px_rgba(63,79,157,0.35)] dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-[#8f714c] dark:text-[#cba97d]">
              <HandCoins size={14} className={iconTone.brand} />
              Data Finance
            </p>
            <SectionTitleWithIcon
              icon={HandCoins}
              title="Riwayat Transaksi"
              iconClassName={iconTone.info}
              className="mt-1 text-xl text-[#2d2217] dark:text-[#f6e9d5]"
            />
            <p className="mt-1 text-xs text-[#7f6344] dark:text-[#b79a78]">
              Tabel pertama: pemasukan POS sewa kamar. Tabel kedua: transaksi lain (termasuk pengeluaran). Baris
              bawah = SUM nominal pada tabel tersebut.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowPaymentForm(true);
              }}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#7f8fff] bg-[#6d32ff] px-3.5 py-0 text-[11px] font-semibold uppercase leading-none tracking-[0.1em] text-white shadow-sm transition hover:bg-[#3f4f9d] dark:border-[#8ea2ff] dark:bg-[#4d6dff] dark:hover:bg-[#6d32ff]"
            >
              <Plus size={14} className="shrink-0" aria-hidden />
              INPUT PAYMENT BARU
            </button>
            <RefreshToolbarButton onRefresh={handleRefreshFinance} disabled={isLoading} />
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48]">Filter Lokasi</label>
            <select
              value={selectedLokasiFilter}
              onChange={(event) => {
                setSelectedLokasiFilter(event.target.value);
                setSelectedUnitFilter("Semua Blok/Unit");
              }}
              className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
            >
              <option>Semua Lokasi</option>
              {lokasiFilterOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48]">Filter Blok/Unit</label>
            <select
              value={selectedUnitFilter}
              onChange={(event) => setSelectedUnitFilter(event.target.value)}
              className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
            >
              <option>Semua Blok/Unit</option>
              {unitFilterOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48]">Filter Kategori</label>
            <select
              value={financeRiwayatKategori}
              onChange={(event) =>
                setFinanceRiwayatKategori(event.target.value as "Semua" | FinanceType)
              }
              className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
            >
              <option value="Semua">Semua</option>
              <option value="Pemasukan">Pemasukan</option>
              <option value="Pengeluaran">Pengeluaran</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48]">Filter POS</label>
            <select
              value={financeRiwayatPos}
              onChange={(event) => setFinanceRiwayatPos(event.target.value)}
              className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
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

        <div className="space-y-10 pt-2">
          <FinanceRiwayatTableBlock
            title="Riwayat — Sewa kamar (Pemasukan)"
            hint={`Hanya baris kategori Pemasukan dengan POS "${FINANCE_POS_SEWA_KAMAR}" (sesuai filter di atas).`}
            rows={riwayatSewaKamarRows}
            isLoading={isLoading}
            footerSumLabel="Total room revenue (SUM nominal)"
            setHoverKeterangan={setHoverKeterangan}
          />

          <FinanceRiwayatTableBlock
            title="Riwayat — Di luar sewa kamar"
            hint="Semua transaksi lain setelah filter (bukan pemasukan sewa kamar)."
            rows={riwayatNonSewaKamarRows}
            isLoading={isLoading}
            footerSumLabel="Total (SUM nominal)"
            setHoverKeterangan={setHoverKeterangan}
          />
        </div>
      </article>

      {showPaymentForm ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[200] cursor-default bg-black/45 backdrop-blur-[1px]"
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
                    title="Input Payment"
                    iconClassName={iconTone.info}
                    className="mt-2 text-2xl text-[#2c2218] dark:text-[#f5e8d4]"
                  />
                  <p className="mt-2 text-sm text-[#7f6344] dark:text-[#b79a78]">
                    Isi transaksi pemasukan/pengeluaran dari panel samping ini.
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
              <label
                htmlFor="finance-no-nota"
                className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]"
              >
                No Nota
              </label>
              <input
                id="finance-no-nota"
                required
                value={form.noNota}
                onChange={(event) => {
                  setForm((prev) => ({ ...prev, noNota: event.target.value }));
                  if (errorMessage) setErrorMessage("");
                }}
                aria-invalid={Boolean(localNotaConflictMessage || remoteNotaConflictMessage)}
                aria-describedby={
                  localNotaConflictMessage || remoteNotaConflictMessage
                    ? "finance-no-nota-alert"
                    : undefined
                }
                className={`w-full rounded-2xl border bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:bg-[#2b2016] ${
                  localNotaConflictMessage || remoteNotaConflictMessage
                    ? "border-red-400 ring-red-200 focus:ring-red-300 dark:border-red-500/80 dark:ring-red-900/40"
                    : "border-[#dcc7aa] dark:border-[#4d3925]"
                }`}
                placeholder="INV-2026-001"
              />
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
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Kategori</label>
              <select
                value={form.kategori}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, kategori: event.target.value as FinanceType, pos: "" }))
                }
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
              >
                <option value="Pemasukan">Pemasukan</option>
                <option value="Pengeluaran">Pengeluaran</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">POS</label>
              <select
                value={form.pos}
                onChange={(event) => setForm((prev) => ({ ...prev, pos: event.target.value }))}
                disabled={effectivePosOptions.length === 0}
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#4d3925] dark:bg-[#2b2016]"
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
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Tanggal</label>
              <input type="date" required value={form.tanggal} onChange={(event) => setForm((prev) => ({ ...prev, tanggal: event.target.value }))} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" />
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
                className="mt-1 w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
              />
              <p className="mt-1 text-[10px] text-[#7d6042] dark:text-[#9a7d5c]">
                Kosongkan agar dashboard owner memakai bulan dari tanggal transaksi. Diisi untuk mengalokasikan ke bulan kalender tertentu.
              </p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Nama Penghuni (Opsional)</label>
              <input value={form.namaPenghuni} onChange={(event) => setForm((prev) => ({ ...prev, namaPenghuni: event.target.value }))} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" placeholder="Nama penghuni (opsional)" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Lokasi Kos</label>
              <select
                value={form.lokasiKos}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, lokasiKos: event.target.value, unitBlok: "" }))
                }
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
              >
                {lokasiOptionsForSelect.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Blok / Unit</label>
              <select
                value={form.unitBlok}
                onChange={(event) => setForm((prev) => ({ ...prev, unitBlok: event.target.value }))}
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
              >
                {unitOptionsForSelect.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Nominal Rupiah</label>
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
                  className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] py-2.5 pl-11 pr-4 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                  placeholder="0"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">Keterangan</label>
              <textarea rows={4} value={form.keterangan} onChange={(event) => setForm((prev) => ({ ...prev, keterangan: event.target.value }))} className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]" placeholder="Keterangan transaksi..." />
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
          <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap">{hoverKeterangan.text}</p>
        </div>
      ) : null}
    </section>
  );
}
