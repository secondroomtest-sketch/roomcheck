"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/libsupabaseClient";
import {
  AlertCircle,
  Building2,
  Calendar,
  ChevronDown,
  LayoutList,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import StatusBadge from "@/components/ui/status-badge";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import RefreshToolbarButton from "@/components/ui/refresh-toolbar-button";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY, newSandboxId } from "@/lib/sandbox-storage";
import { buildDemoLokasiList, buildDemoUnitList } from "@/lib/demo-form-options";
import {
  findPenghuniForKamarRoom,
  getOccupiedCheckoutVisual,
  syncKamarRowsWithPenghuniList,
  type PenghuniForKamarSync,
} from "@/lib/kamar-penghuni-sync";

/** Cukup untuk merge opsi demo (hindari impor sirkular ke penghuni-page-client). */
type PenghuniSandboxLite = { lokasiKos: string; unitBlok: string };

type PenghuniJsonRow = {
  status?: string;
  lokasiKos?: string;
  unitBlok?: string;
  noKamar?: string;
  sewaKamarPaid?: boolean;
  namaLengkap?: string;
  tglCheckOut?: string;
};

type KamarStatus = "Occupied" | "Available" | "Maintenance";

export type KamarRow = {
  id: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  status: KamarStatus;
  keterangan: string;
  namaPenghuni: string;
  tglCheckOut: string;
};

type KamarForm = Omit<KamarRow, "id" | "namaPenghuni" | "tglCheckOut">;

function buildLokasiSelectOptions(
  localDemo: boolean,
  kamarRows: KamarRow[],
  penghuniRows: PenghuniSandboxLite[],
  sandboxReady: boolean
): string[] {
  if (!localDemo) {
    const kamarLokasi = kamarRows.map((r) => r.lokasiKos).filter(Boolean);
    const penghuniLokasi = penghuniRows.map((p) => p.lokasiKos).filter(Boolean);
    return Array.from(new Set([...kamarLokasi, ...penghuniLokasi])).sort((a, b) =>
      a.localeCompare(b, "id")
    );
  }
  return buildDemoLokasiList(sandboxReady, kamarRows, penghuniRows);
}

function buildUnitSelectOptions(
  localDemo: boolean,
  lokasiName: string,
  kamarRows: KamarRow[],
  penghuniRows: PenghuniSandboxLite[],
  sandboxReady: boolean
): string[] {
  if (!localDemo) {
    const fromKamar = kamarRows
      .filter((r) => !lokasiName || r.lokasiKos === lokasiName)
      .map((r) => r.unitBlok)
      .filter(Boolean);
    const fromPenghuni = penghuniRows
      .filter((p) => !lokasiName || p.lokasiKos === lokasiName)
      .map((p) => p.unitBlok)
      .filter(Boolean);
    return Array.from(new Set([...fromKamar, ...fromPenghuni])).sort((a, b) =>
      a.localeCompare(b, "id")
    );
  }
  return buildDemoUnitList(sandboxReady, lokasiName, kamarRows, penghuniRows);
}

const initialForm: KamarForm = {
  lokasiKos: "",
  unitBlok: "",
  noKamar: "",
  status: "Available",
  keterangan: "",
};

const statusColors: Record<KamarStatus, string> = {
  Occupied: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-500 dark:bg-[#1a2740] dark:text-blue-200",
  Available: "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-500 dark:bg-[#0f2f27] dark:text-emerald-200",
  Maintenance: "border-red-300 bg-red-50 text-red-700 dark:border-red-500 dark:bg-[#3b1a1a] dark:text-red-200",
};

const statusOptions: KamarStatus[] = ["Available", "Occupied", "Maintenance"];

type KamarStatusFilter = "Semua" | KamarStatus;

function mapSupabasePenghuniToSync(row: Record<string, unknown>): PenghuniForKamarSync {
  return {
    status: String(row.status ?? "Booking"),
    lokasiKos: String(row.lokasi_kos ?? ""),
    unitBlok: String(row.unit_blok ?? ""),
    noKamar: String(row.no_kamar ?? ""),
    sewaKamarPaid: Boolean(row.sewa_kamar_paid),
    namaLengkap: String(row.nama_lengkap ?? ""),
    tglCheckOut: String(row.tgl_check_out ?? ""),
  };
}

export default function KamarPageClient({
  initialData,
  initialPenghuniForSync = [],
}: {
  initialData: KamarRow[];
  initialPenghuniForSync?: PenghuniForKamarSync[];
}) {
  const { localDemoMode } = useSandboxMode();
  const { toast, confirm } = useAppFeedback();
  const [masterTick, setMasterTick] = useState(0);
  const [sandboxRev, setSandboxRev] = useState(0);
  const [sandboxReady, setSandboxReady] = useState(false);

  useEffect(() => {
    setSandboxReady(true);
  }, []);

  const [penghuniCloudRows, setPenghuniCloudRows] = useState<PenghuniForKamarSync[]>(initialPenghuniForSync);
  const [data, setData] = useState<KamarRow[]>(initialData);

  const penghuniForKamarSyncList = useMemo((): PenghuniForKamarSync[] => {
    if (localDemoMode) {
      if (!sandboxReady) return [];
      const raw = readSandboxJson<PenghuniJsonRow[]>(SB_KEY.penghuni, []);
      return raw.map((r) => ({
        status: String(r.status ?? "Booking"),
        lokasiKos: String(r.lokasiKos ?? ""),
        unitBlok: String(r.unitBlok ?? ""),
        noKamar: String(r.noKamar ?? ""),
        sewaKamarPaid: Boolean(r.sewaKamarPaid),
        namaLengkap: String(r.namaLengkap ?? ""),
        tglCheckOut: String(r.tglCheckOut ?? ""),
      }));
    }
    return penghuniCloudRows;
  }, [localDemoMode, sandboxReady, sandboxRev, penghuniCloudRows]);

  const penghuniSandboxRows = useMemo(
    () => penghuniForKamarSyncList.map((p) => ({ lokasiKos: p.lokasiKos, unitBlok: p.unitBlok })),
    [penghuniForKamarSyncList]
  );

  const displayRooms = useMemo(
    () => syncKamarRowsWithPenghuniList(data, penghuniForKamarSyncList),
    [data, penghuniForKamarSyncList]
  );
  const [form, setForm] = useState<KamarForm>(initialForm);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [selectedLokasiFilter, setSelectedLokasiFilter] = useState("Semua Lokasi");
  const [selectedUnitFilter, setSelectedUnitFilter] = useState("Semua Blok/Unit");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<KamarStatusFilter>("Semua");
  /** Lokasi khusus agregasi tabel ringkasan (boleh beda dari filter grid). */
  const [ringkasanLokasiFilter, setRingkasanLokasiFilter] = useState("Semua Lokasi");
  const [showKamarSidePanel, setShowKamarSidePanel] = useState(false);

  useEffect(() => {
    const fnMaster = () => setMasterTick((t) => t + 1);
    const fnSandbox = () => setSandboxRev((n) => n + 1);
    if (typeof window === "undefined") return;
    window.addEventListener("secondroom-master-sandbox-updated", fnMaster as EventListener);
    window.addEventListener("secondroom-sandbox-updated", fnSandbox as EventListener);
    return () => {
      window.removeEventListener("secondroom-master-sandbox-updated", fnMaster as EventListener);
      window.removeEventListener("secondroom-sandbox-updated", fnSandbox as EventListener);
    };
  }, []);

  useEffect(() => {
    if (localDemoMode) return;
    setPenghuniCloudRows(initialPenghuniForSync);
  }, [localDemoMode, initialPenghuniForSync]);

  const lokasiSelectOptions = useMemo(
    () => buildLokasiSelectOptions(!!localDemoMode, data, penghuniSandboxRows, sandboxReady),
    [localDemoMode, data, penghuniSandboxRows, sandboxReady, masterTick, sandboxRev]
  );

  const unitSelectOptions = useMemo(
    () =>
      buildUnitSelectOptions(!!localDemoMode, form.lokasiKos, data, penghuniSandboxRows, sandboxReady),
    [localDemoMode, form.lokasiKos, data, penghuniSandboxRows, sandboxReady, masterTick, sandboxRev]
  );

  const lokasiFilterOptions = useMemo(() => {
    const fromRooms = displayRooms.map((room) => room.lokasiKos).filter(Boolean);
    if (!localDemoMode) {
      return Array.from(new Set(fromRooms)).sort((a, b) => a.localeCompare(b, "id"));
    }
    return buildDemoLokasiList(sandboxReady, displayRooms, penghuniSandboxRows);
  }, [displayRooms, localDemoMode, masterTick, sandboxRev, sandboxReady, penghuniSandboxRows]);

  const unitFilterOptions = useMemo(() => {
    const source =
      selectedLokasiFilter === "Semua Lokasi"
        ? displayRooms
        : displayRooms.filter((room) => room.lokasiKos === selectedLokasiFilter);
    const fromRooms = source.map((room) => room.unitBlok).filter(Boolean);
    if (!localDemoMode || selectedLokasiFilter === "Semua Lokasi") {
      return Array.from(new Set(fromRooms)).sort((a, b) => a.localeCompare(b, "id"));
    }
    return buildDemoUnitList(sandboxReady, selectedLokasiFilter, displayRooms, penghuniSandboxRows);
  }, [displayRooms, selectedLokasiFilter, localDemoMode, masterTick, sandboxRev, sandboxReady, penghuniSandboxRows]);
  const filteredRooms = useMemo(() => {
    return displayRooms.filter((room) => {
      const lokasiMatch =
        selectedLokasiFilter === "Semua Lokasi" || room.lokasiKos === selectedLokasiFilter;
      const unitMatch =
        selectedUnitFilter === "Semua Blok/Unit" || room.unitBlok === selectedUnitFilter;
      const statusMatch =
        selectedStatusFilter === "Semua" || room.status === selectedStatusFilter;
      return lokasiMatch && unitMatch && statusMatch;
    });
  }, [displayRooms, selectedLokasiFilter, selectedUnitFilter, selectedStatusFilter]);

  const roomsForSummaryTable = useMemo(() => {
    return displayRooms.filter((room) => {
      const lokasiMatch =
        ringkasanLokasiFilter === "Semua Lokasi" || room.lokasiKos === ringkasanLokasiFilter;
      const unitMatch =
        selectedUnitFilter === "Semua Blok/Unit" || room.unitBlok === selectedUnitFilter;
      const statusMatch =
        selectedStatusFilter === "Semua" || room.status === selectedStatusFilter;
      return lokasiMatch && unitMatch && statusMatch;
    });
  }, [displayRooms, ringkasanLokasiFilter, selectedUnitFilter, selectedStatusFilter]);

  const kamarAggregationRows = useMemo(() => {
    const map = new Map<string, { lokasiKos: string; unitBlok: string; jumlah: number }>();
    for (const r of roomsForSummaryTable) {
      const key = `${r.lokasiKos}\u0000${r.unitBlok}`;
      const prev = map.get(key);
      if (prev) prev.jumlah += 1;
      else map.set(key, { lokasiKos: r.lokasiKos, unitBlok: r.unitBlok, jumlah: 1 });
    }
    return Array.from(map.values()).sort((a, b) => {
      const c = a.lokasiKos.localeCompare(b.lokasiKos, "id");
      if (c !== 0) return c;
      return a.unitBlok.localeCompare(b.unitBlok, "id");
    });
  }, [roomsForSummaryTable]);

  const kamarAggregationTotal = roomsForSummaryTable.length;

  useEffect(() => {
    if (
      ringkasanLokasiFilter !== "Semua Lokasi" &&
      !lokasiFilterOptions.includes(ringkasanLokasiFilter)
    ) {
      setRingkasanLokasiFilter("Semua Lokasi");
    }
  }, [lokasiFilterOptions, ringkasanLokasiFilter]);

  useEffect(() => {
    if (!localDemoMode) {
      setData(initialData);
      return;
    }
    const saved = readSandboxJson<KamarRow[] | null>(SB_KEY.kamar, null);
    if (saved) setData(saved);
    else setData(initialData);
  }, [localDemoMode, initialData, sandboxRev]);

  useEffect(() => {
    if (!localDemoMode) return;
    const opts = buildLokasiSelectOptions(true, data, penghuniSandboxRows, sandboxReady);
    if (opts.length === 0) return;
    if (!opts.includes(form.lokasiKos)) {
      const first = opts[0] ?? "";
      const units = buildUnitSelectOptions(true, first, data, penghuniSandboxRows, sandboxReady);
      setForm((prev) => ({
        ...prev,
        lokasiKos: first,
        unitBlok: units.includes(prev.unitBlok) ? prev.unitBlok : units[0] ?? "",
      }));
    }
  }, [localDemoMode, data, penghuniSandboxRows, sandboxReady, masterTick, sandboxRev, form.lokasiKos]);

  useEffect(() => {
    if (!localDemoMode) return;
    const units = buildUnitSelectOptions(true, form.lokasiKos, data, penghuniSandboxRows, sandboxReady);
    if (units.length === 0) return;
    if (!units.includes(form.unitBlok)) {
      setForm((prev) => ({ ...prev, unitBlok: units[0] ?? "" }));
    }
  }, [localDemoMode, form.lokasiKos, data, penghuniSandboxRows, sandboxReady, masterTick, sandboxRev]);

  const mapDbRowToUi = (row: Record<string, unknown>): KamarRow => {
    const statusRaw = String(row.status ?? "Available");
    const status: KamarStatus =
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

  const loadKamar = async (): Promise<boolean> => {
    setIsLoading(true);
    if (localDemoMode) {
      setData(readSandboxJson(SB_KEY.kamar, initialData));
      setErrorMessage("");
      setIsLoading(false);
      return true;
    }
    const [{ data: fetchedData, error }, { data: penData, error: penErr }] = await Promise.all([
      supabase.from("kamar").select("*").order("no_kamar", { ascending: true }),
      supabase
        .from("penghuni")
        .select("status, lokasi_kos, unit_blok, no_kamar, sewa_kamar_paid, nama_lengkap, tgl_check_out"),
    ]);

    if (error) {
      setErrorMessage(error.message);
      setIsLoading(false);
      return false;
    }

    if (!penErr && penData) {
      setPenghuniCloudRows(
        penData.map((row) => mapSupabasePenghuniToSync(row as Record<string, unknown>))
      );
    }

    setErrorMessage("");
    setData((fetchedData ?? []).map((row) => mapDbRowToUi(row as Record<string, unknown>)));
    setIsLoading(false);
    return true;
  };

  useEffect(() => {
    const fn = () => {
      if (localDemoMode) {
        setSandboxRev((n) => n + 1);
        return;
      }
      void (async () => {
        const { data: penData, error } = await supabase
          .from("penghuni")
          .select("status, lokasi_kos, unit_blok, no_kamar, sewa_kamar_paid, nama_lengkap, tgl_check_out");
        if (!error && penData) {
          setPenghuniCloudRows(
            penData.map((row) => mapSupabasePenghuniToSync(row as Record<string, unknown>))
          );
        }
      })();
    };
    if (typeof window === "undefined") return;
    window.addEventListener("secondroom-penghuni-reload", fn as EventListener);
    return () => window.removeEventListener("secondroom-penghuni-reload", fn as EventListener);
  }, [localDemoMode]);

  const handleRefreshKamar = async () => {
    const ok = await loadKamar();
    setSandboxRev((n) => n + 1);
    if (ok) {
      toast("Data kamar berhasil dimuat ulang.", "info");
    } else {
      toast("Gagal memuat data kamar. Periksa pesan di halaman.", "error");
    }
  };

  const resetForm = () => {
    if (localDemoMode) {
      const loc = buildLokasiSelectOptions(true, data, penghuniSandboxRows, sandboxReady)[0] ?? "";
      const unit = buildUnitSelectOptions(true, loc, data, penghuniSandboxRows, sandboxReady)[0] ?? "";
      setForm({
        lokasiKos: loc,
        unitBlok: unit,
        noKamar: "",
        status: "Available",
        keterangan: "",
      });
    } else {
      const loc = buildLokasiSelectOptions(false, data, penghuniSandboxRows, sandboxReady)[0] ?? "";
      const unit = buildUnitSelectOptions(false, loc, data, penghuniSandboxRows, sandboxReady)[0] ?? "";
      setForm({
        lokasiKos: loc,
        unitBlok: unit,
        noKamar: "",
        status: "Available",
        keterangan: "",
      });
    }
    setEditingId(null);
  };

  const openTambahKamarPanel = () => {
    resetForm();
    setInfoMessage("");
    setErrorMessage("");
    setShowKamarSidePanel(true);
  };

  const closeKamarSidePanel = () => {
    resetForm();
    setShowKamarSidePanel(false);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    setInfoMessage("");
    setErrorMessage("");

    const payload = {
      lokasi_kos: form.lokasiKos,
      unit_blok: form.unitBlok,
      no_kamar: form.noKamar,
      status: form.status,
      keterangan: form.keterangan,
    };

    if (!form.lokasiKos.trim() || !form.unitBlok.trim()) {
      const msg = "Lokasi dan unit/blok wajib diisi. Tambahkan Master Lokasi/Blok terlebih dahulu.";
      setErrorMessage(msg);
      toast(msg, "error");
      setIsSubmitting(false);
      return;
    }

    if (localDemoMode) {
      const row: KamarRow = {
        id: editingId ?? newSandboxId(),
        lokasiKos: form.lokasiKos,
        unitBlok: form.unitBlok,
        noKamar: form.noKamar,
        status: form.status,
        keterangan: form.keterangan,
        namaPenghuni: "-",
        tglCheckOut: "-",
      };
      const next = editingId
        ? data.map((r) => (r.id === editingId ? { ...row, id: editingId, namaPenghuni: r.namaPenghuni, tglCheckOut: r.tglCheckOut } : r))
        : [row, ...data];
      setData(next);
      writeSandboxJson(SB_KEY.kamar, next);
      toast(editingId ? "Data kamar berhasil diperbarui (demo lokal)." : "Data kamar berhasil disimpan (demo lokal).", "success");
      await loadKamar();
      resetForm();
      setShowKamarSidePanel(false);
      setIsSubmitting(false);
      return;
    }

    if (editingId) {
      const { error } = await supabase.from("kamar").update(payload).eq("id", editingId);
      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        setIsSubmitting(false);
        return;
      }
      toast("Data kamar berhasil diperbarui.", "success");
    } else {
      const { error } = await supabase.from("kamar").insert(payload);
      if (error) {
        setErrorMessage(error.message);
        toast(error.message, "error");
        setIsSubmitting(false);
        return;
      }
      toast("Data kamar berhasil disimpan.", "success");
    }

    await loadKamar();
    resetForm();
    setShowKamarSidePanel(false);
    setIsSubmitting(false);
  };

  const handleEdit = (row: KamarRow) => {
    setEditingId(row.id);
    const locOpts = buildLokasiSelectOptions(!!localDemoMode, data, penghuniSandboxRows, sandboxReady);
    const locFirst = locOpts[0] ?? "";
    const unitOpts = buildUnitSelectOptions(
      !!localDemoMode,
      row.lokasiKos || locFirst,
      data,
      penghuniSandboxRows,
      sandboxReady
    );
    setForm({
      lokasiKos: row.lokasiKos || locFirst,
      unitBlok: row.unitBlok || unitOpts[0] || "",
      noKamar: row.noKamar,
      status: row.status,
      keterangan: row.keterangan || "",
    });
    setInfoMessage("Mode edit kamar aktif.");
    setErrorMessage("");
    setShowKamarSidePanel(true);
  };

  const handleDelete = async (id: string): Promise<boolean> => {
    setInfoMessage("");
    setErrorMessage("");
    if (localDemoMode) {
      const next = data.filter((r) => r.id !== id);
      setData(next);
      writeSandboxJson(SB_KEY.kamar, next);
      if (editingId === id) resetForm();
      return true;
    }
    const { error } = await supabase.from("kamar").delete().eq("id", id);
    if (error) {
      setErrorMessage(error.message);
      toast(error.message, "error");
      return false;
    }
    if (editingId === id) {
      resetForm();
    }
    await loadKamar();
    return true;
  };

  const deleteKamarWithConfirm = async (room: KamarRow) => {
    const ok = await confirm({
      title: "Hapus data kamar?",
      message: `Yakin hapus kamar ${room.noKamar} (${room.lokasiKos} · ${room.unitBlok})?`,
      confirmLabel: "Ya, hapus",
      cancelLabel: "Batal",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info");
      return;
    }
    const deleted = await handleDelete(room.id);
    if (deleted) {
      toast("Data kamar berhasil dihapus.", "success");
    }
  };

  useEffect(() => {
    if (!showKamarSidePanel || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showKamarSidePanel]);

  return (
    <section className="mx-auto max-w-6xl space-y-6 pb-10">
      <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-6 shadow-[0_20px_50px_-35px_rgba(63,79,157,0.35)] dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.26em] text-[#9d7e55] dark:text-[#cfb089]">
              <Building2 size={14} className={iconTone.brand} />
              Grid Kamar
            </p>
            <SectionTitleWithIcon
              icon={Building2}
              title="Status Kamar"
              iconClassName={iconTone.info}
              className="mt-2 text-xl text-[#2c2218] dark:text-[#f5e8d4]"
            />
            <p className="mt-2 max-w-2xl text-sm text-[#7f6344] dark:text-[#b79a78]">
              Ringkasan per kamar (empat kolom pada layar lebar). Tambah atau edit lewat panel samping.
              {localDemoMode ? (
                <span className="mt-1 block text-xs text-[#a08058]">
                  Demo lokal: lokasi & blok dari Master (Lokasi/Blok), Kamar, dan Penghuni di browser.
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={openTambahKamarPanel}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-[#7f8fff] bg-[#6d32ff] px-3.5 py-0 text-[11px] font-semibold uppercase leading-none tracking-[0.1em] text-white shadow-sm transition hover:bg-[#3f4f9d] dark:border-[#8ea2ff] dark:bg-[#4d6dff] dark:hover:bg-[#6d32ff]"
            >
              <Plus size={14} className="shrink-0" aria-hidden />
              Tambah Kamar
            </button>
            <RefreshToolbarButton onRefresh={handleRefreshKamar} disabled={isLoading} />
          </div>
        </div>

        <div className="max-h-[min(56vh,520px)] overflow-y-auto pr-1">
          {isLoading ? (
            <p className="text-sm text-[#856948] dark:text-[#bca17f]">Memuat data kamar...</p>
          ) : (
            <>
              <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48]">
                    Filter Lokasi
                  </label>
                  <select
                    value={selectedLokasiFilter}
                    onChange={(event) => {
                      setSelectedLokasiFilter(event.target.value);
                      setSelectedUnitFilter("Semua Blok/Unit");
                      setSelectedStatusFilter("Semua");
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
                  <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48]">
                    Filter Blok/Unit
                  </label>
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
                <div className="sm:col-span-2 lg:col-span-1">
                  <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48]">
                    Filter Status Kamar
                  </label>
                  <select
                    value={selectedStatusFilter}
                    onChange={(event) =>
                      setSelectedStatusFilter(event.target.value as KamarStatusFilter)
                    }
                    className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
                  >
                    <option value="Semua">Semua status</option>
                    <option value="Available">Available</option>
                    <option value="Occupied">Occupied</option>
                    <option value="Maintenance">Maintenance</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5 md:grid-cols-3 lg:grid-cols-4">
                {filteredRooms.map((room) => {
                  const occupant =
                    room.status === "Occupied"
                      ? findPenghuniForKamarRoom(room, penghuniForKamarSyncList)
                      : null;
                  const checkoutMark = getOccupiedCheckoutVisual(occupant);
                  const coHighlight =
                    checkoutMark === "checkout_overdue_unpaid"
                      ? "font-semibold text-red-800 dark:text-red-200"
                      : checkoutMark === "checkout_today"
                        ? "font-semibold text-amber-900 dark:text-amber-200"
                        : checkoutMark === "checkout_soon"
                          ? "font-medium text-violet-900 dark:text-violet-200"
                          : "";

                  return (
                    <div
                      key={room.id}
                      className={`rounded-xl border p-2.5 sm:p-3 ${statusColors[room.status]}`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="min-w-0">
                          <p className="truncate text-[10px] uppercase tracking-[0.12em] text-current/80">
                            {room.lokasiKos}
                          </p>
                          <p className="truncate text-[10px] font-medium uppercase tracking-[0.1em] opacity-90">
                            {room.unitBlok}
                          </p>
                          <p className="mt-0.5 truncate text-sm font-semibold leading-tight">Kamar {room.noKamar}</p>
                        </div>
                        <StatusBadge status={room.status} className="shrink-0 scale-90 text-[10px]" />
                      </div>

                      <div className="mt-2 space-y-0.5 text-[10px] leading-snug sm:text-[11px]">
                        <p className="truncate">Penghuni: {room.status === "Occupied" ? room.namaPenghuni : "-"}</p>
                        <p className={`truncate ${coHighlight}`}>
                          CO: {room.status === "Occupied" ? room.tglCheckOut : "-"}
                        </p>
                        {checkoutMark === "checkout_today" ? (
                          <p className="inline-flex items-center gap-1 rounded-full bg-amber-500/25 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-500/20 dark:text-amber-100">
                            <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                            Check-out hari ini
                          </p>
                        ) : null}
                        {checkoutMark === "checkout_soon" ? (
                          <p className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-violet-950 dark:bg-violet-400/15 dark:text-violet-100">
                            <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                            Check-out ≤7 hari
                          </p>
                        ) : null}
                        {checkoutMark === "checkout_overdue_unpaid" ? (
                          <p className="inline-flex items-center gap-1 rounded-full bg-red-600/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-red-950 dark:bg-red-500/25 dark:text-red-100">
                            <AlertCircle className="h-3 w-3 shrink-0" aria-hidden />
                            Overdue check-out
                          </p>
                        ) : null}
                        {room.status !== "Occupied" && room.keterangan?.trim() ? (
                          <p className="line-clamp-2 text-current/90" title={room.keterangan}>
                            {room.keterangan}
                          </p>
                        ) : null}
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1">
                        <ActionButtonWithIcon
                          icon={Pencil}
                          onClick={() => handleEdit(room)}
                          label="Edit"
                          className="rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-[#1e293b] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        <ActionButtonWithIcon
                          icon={Trash2}
                          onClick={() => void deleteKamarWithConfirm(room)}
                          label="Hapus"
                          className="rounded-full bg-black/75 px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {filteredRooms.length === 0 ? (
                <p className="mt-3 text-sm text-[#856948] dark:text-[#bca17f]">
                  Tidak ada data kamar sesuai filter.
                </p>
              ) : null}
            </>
          )
          }
        </div>

        {!isLoading ? (
          <div className="mt-6 border-t border-[#eadcc9] pt-6 dark:border-[#3d2f22]">
            <div className="mb-3 flex items-center gap-2">
              <LayoutList size={16} className={iconTone.info} aria-hidden />
              <h3 className="text-sm font-semibold text-[#2d2217] dark:text-[#f6e9d5]">
                Ringkasan per lokasi dan blok/unit
              </h3>
            </div>
            <p className="mb-3 text-xs text-[#7f6344] dark:text-[#b79a78]">
              Blok/unit dan status mengikuti filter grid; lokasi ringkasan bisa diatur sendiri di bawah.
            </p>
            <div className="mb-4 max-w-md">
              <label className="mb-1 block text-xs uppercase tracking-[0.15em] text-[#8b6d48] dark:text-[#b79a78]">
                Filter lokasi (ringkasan)
              </label>
              <select
                value={ringkasanLokasiFilter}
                onChange={(event) => setRingkasanLokasiFilter(event.target.value)}
                className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#c09c70] dark:border-[#4d3925] dark:bg-[#2b2016]"
              >
                <option value="Semua Lokasi">Semua lokasi</option>
                {lokasiFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[#dcc7aa] dark:border-[#4d3925]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f8efe2] dark:bg-[#2b2016]">
                  <tr className="text-xs uppercase tracking-[0.12em] text-[#8f724d] dark:text-[#c8a97f]">
                    <th className="px-4 py-3 font-semibold">Lokasi</th>
                    <th className="px-4 py-3 font-semibold">Blok / Unit</th>
                    <th className="px-4 py-3 text-right font-semibold">Jumlah kamar</th>
                  </tr>
                </thead>
                <tbody>
                  {kamarAggregationRows.length === 0 ? (
                    <tr>
                      <td
                        className="px-4 py-4 text-[#856948] dark:text-[#bca17f]"
                        colSpan={3}
                      >
                        Tidak ada baris ringkasan (sesuaikan filter).
                      </td>
                    </tr>
                  ) : (
                    kamarAggregationRows.map((row) => (
                      <tr
                        key={`${row.lokasiKos}-${row.unitBlok}`}
                        className="border-t border-[#efe2d1] dark:border-[#33261b]"
                      >
                        <td className="px-4 py-2.5 text-[#2c2218] dark:text-[#f5e8d4]">{row.lokasiKos}</td>
                        <td className="px-4 py-2.5 text-[#2c2218] dark:text-[#f5e8d4]">{row.unitBlok}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums text-emerald-900 dark:text-emerald-200">
                          {row.jumlah}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {kamarAggregationRows.length > 0 ? (
                  <tfoot className="border-t-2 border-[#d4bc9a] bg-[#f0e4d4] dark:border-[#5c452d] dark:bg-[#2a1f16]">
                    <tr className="text-xs font-semibold uppercase tracking-[0.1em] text-[#4a3624] dark:text-[#e8d4bc]">
                      <td className="px-4 py-3" colSpan={2}>
                        Jumlah seluruh kamar (ringkasan: lokasi, blok/unit, status)
                      </td>
                      <td className="px-4 py-3 text-right text-base tabular-nums text-emerald-900 dark:text-emerald-200">
                        {kamarAggregationTotal}
                      </td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>
          </div>
        ) : null}
      </article>

      {showKamarSidePanel ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[200] cursor-default bg-black/45 backdrop-blur-[1px]"
            aria-label="Tutup panel form kamar"
            onClick={closeKamarSidePanel}
          />
          <aside
            className="fixed inset-y-0 right-0 z-[210] flex w-full max-w-md flex-col border-l border-[#d6ddff] bg-[#f7f8ff] shadow-[-16px_0_48px_-24px_rgba(40,57,120,0.45)] dark:border-[#424a80] dark:bg-[#1b1f3d]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="kamar-form-panel-title"
          >
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-6">
              <div className="mb-6 flex items-start justify-between gap-3">
                <div id="kamar-form-panel-title">
                  <p className="flex items-center gap-2 text-xs uppercase tracking-[0.28em] text-[#8b6d48] dark:text-[#cfb089]">
                    <Building2 size={14} className={iconTone.brand} />
                    Form Kamar
                  </p>
                  <SectionTitleWithIcon
                    icon={Building2}
                    title={editingId ? "Edit Kamar" : "Tambah Kamar"}
                    iconClassName={iconTone.info}
                    className="mt-2 text-2xl text-[#2c2218] dark:text-[#f5e8d4]"
                  />
                  <p className="mt-2 text-sm text-[#7f6344] dark:text-[#b79a78]">
                    {editingId
                      ? "Perbarui lokasi, unit, nomor kamar, status, atau keterangan."
                      : "Isi data kamar baru lalu simpan — baris akan muncul di grid."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeKamarSidePanel}
                  className="rounded-full p-2 text-[#6e5336] transition hover:bg-[#efe2d1] dark:text-[#d9bc95] dark:hover:bg-[#33261b]"
                  aria-label="Tutup form"
                >
                  <X size={22} />
                </button>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                      Lokasi
                    </label>
                    <select
                      value={form.lokasiKos}
                      onChange={(event) => {
                        const nextLok = event.target.value;
                        const units = buildUnitSelectOptions(
                          !!localDemoMode,
                          nextLok,
                          data,
                          penghuniSandboxRows,
                          sandboxReady
                        );
                        setForm((prev) => ({
                          ...prev,
                          lokasiKos: nextLok,
                          unitBlok: units.includes(prev.unitBlok) ? prev.unitBlok : units[0] ?? "",
                        }));
                      }}
                      className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                    >
                      {lokasiSelectOptions.length === 0 ? (
                        <option value="">Belum ada lokasi (isi Master Lokasi dulu)</option>
                      ) : null}
                      {lokasiSelectOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                      Unit / Blok
                    </label>
                    <select
                      value={form.unitBlok}
                      onChange={(event) => setForm((prev) => ({ ...prev, unitBlok: event.target.value }))}
                      className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                    >
                      {unitSelectOptions.length === 0 ? (
                        <option value="">Belum ada unit/blok</option>
                      ) : null}
                      {unitSelectOptions.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                      No. Kamar
                    </label>
                    <input
                      required
                      value={form.noKamar}
                      onChange={(event) => setForm((prev) => ({ ...prev, noKamar: event.target.value }))}
                      className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                      placeholder="Contoh: A-101"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                      Status
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setStatusMenuOpen((prev) => !prev)}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-2.5 text-sm outline-none focus:ring-2 ${statusColors[form.status]}`}
                      >
                        <StatusBadge status={form.status} />
                        <ChevronDown size={16} />
                      </button>
                      {statusMenuOpen ? (
                        <div className="absolute z-20 mt-2 w-full rounded-2xl border border-[#dcc7aa] bg-white p-2 shadow-lg dark:border-[#4d3925] dark:bg-[#2b2016]">
                          {statusOptions.map((statusOption) => (
                            <button
                              key={statusOption}
                              type="button"
                              onClick={() => {
                                setForm((prev) => ({ ...prev, status: statusOption }));
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
                    <label className="mb-1 block text-xs font-medium uppercase tracking-[0.18em] text-[#8b6d48]">
                      Keterangan
                    </label>
                    <textarea
                      rows={4}
                      value={form.keterangan}
                      onChange={(event) => setForm((prev) => ({ ...prev, keterangan: event.target.value }))}
                      className="w-full rounded-2xl border border-[#dcc7aa] bg-[#fffdf9] px-4 py-2.5 text-sm outline-none ring-[#c09c70] focus:ring-2 dark:border-[#4d3925] dark:bg-[#2b2016]"
                      placeholder="Catatan kondisi kamar..."
                    />
                  </div>
                </div>

                {(infoMessage || errorMessage) && (
                  <p
                    className={`rounded-xl px-3 py-2 text-sm ${
                      errorMessage
                        ? "border border-red-200 bg-red-50 text-red-600"
                        : "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {errorMessage || infoMessage}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <ActionButtonWithIcon
                    icon={Save}
                    type="submit"
                    disabled={isSubmitting}
                    iconClassName={iconTone.success}
                    label={isSubmitting ? "Menyimpan..." : editingId ? "Update Kamar" : "Simpan Kamar"}
                    className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-6 py-2.5 text-sm font-semibold tracking-[0.15em] text-[#eef3ff] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                  />
                  <ActionButtonWithIcon
                    icon={X}
                    type="button"
                    onClick={closeKamarSidePanel}
                    label={editingId ? "Batal edit" : "Tutup"}
                    iconClassName={iconTone.warning}
                    className="rounded-full border border-[#c8d3ff] px-6 py-2.5 text-sm font-semibold text-[#4f61aa] transition hover:bg-[#eef2ff] dark:border-[#424a80] dark:text-[#dbe3ff] dark:hover:bg-[#232a4d]"
                  />
                </div>
              </form>
            </div>
          </aside>
        </>
      ) : null}
    </section>
  );
}
