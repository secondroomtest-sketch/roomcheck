"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/libsupabaseClient";
import {
  Building2,
  HandCoins,
  History,
  Pencil,
  RefreshCcw,
  Save,
  Settings2,
  Trash2,
  Users,
} from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import RefreshToolbarButton from "@/components/ui/refresh-toolbar-button";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import StatusBadge from "@/components/ui/status-badge";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY, newSandboxId } from "@/lib/sandbox-storage";
import { readDemoProfileSession } from "@/lib/demo-auth";
import { normalizeUserProfileRole } from "@/lib/user-profile-role";
import { loginDisplayPrimary } from "@/lib/internal-auth-email";
import { useSupabaseSessionHydrated } from "@/components/supabase-session-ready";
import { useCloudDataResyncTick } from "@/components/cloud-resync-hook";
import type { PengeluaranScope } from "@/lib/pengeluaran-scope";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";
import { FINANCE_POS_SEWA_KAMAR } from "@/lib/penghuni-finance-payment-sync";
import {
  pageFieldClass,
  pageLabelClass,
  pageSectionClass,
  pageTabStripClass,
} from "@/lib/ui-page-layout";

type MasterTab = "finance" | "lokasi" | "user";
export type UserRole = "super_admin" | "owner" | "staff" | "supervisor" | "manager";
type FinanceType =
  | "Pemasukan kos"
  | "Pemasukan manajemen"
  | "Pengeluaran kos"
  | "Pengeluaran manajemen";

function isPengeluaranTipe(tipe: FinanceType): boolean {
  return tipe.startsWith("Pengeluaran");
}

function pengeluaranScopeForFinanceTipe(tipe: FinanceType): PengeluaranScope | null {
  if (!isPengeluaranTipe(tipe)) return null;
  return tipe.includes("manajemen") ? "manajemen" : "kos";
}

function isPemasukanTipe(tipe: FinanceType): boolean {
  return tipe.startsWith("Pemasukan");
}

type PemasukanScope = "kos" | "manajemen";
type PemasukanKind = "sewa_kamar" | "booking_fee" | "lain";

function classifyPemasukanKindByPos(namaPosRaw: unknown): PemasukanKind {
  const pos = String(namaPosRaw ?? "").trim().toLowerCase();
  if (pos === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase()) return "sewa_kamar";
  if (pos === "booking fee") return "booking_fee";
  return "lain";
}

function pemasukanScopeForFinanceTipe(tipe: FinanceType): PemasukanScope | null {
  if (!isPemasukanTipe(tipe)) return null;
  return tipe.includes("manajemen") ? "manajemen" : "kos";
}

function pemasukanKindForFinanceTipe(tipe: FinanceType): PemasukanKind | null {
  if (!isPemasukanTipe(tipe)) return null;
  if (tipe.includes("kos")) return "sewa_kamar";
  return "lain";
}

function normalizeFinanceTipe(raw: unknown, scopeRaw: unknown, namaPosRaw: unknown): FinanceType {
  const t = String(raw ?? "").trim().toLowerCase();
  if (t === "pemasukan manajemen") return "Pemasukan manajemen";
  if (t === "pemasukan kos") return "Pemasukan kos";
  if (t === "pemasukan") {
    // Backward compat: data lama "Pemasukan" dibagi berdasar nama POS.
    const kind = classifyPemasukanKindByPos(namaPosRaw);
    if (kind === "sewa_kamar" || kind === "booking_fee") return "Pemasukan kos";
    return "Pemasukan manajemen";
  }
  if (t === "pengeluaran manajemen") return "Pengeluaran manajemen";
  if (t === "pengeluaran kos") return "Pengeluaran kos";
  if (t === "pengeluaran") {
    const sp = normalizePengeluaranScope(scopeRaw);
    return sp === "manajemen" ? "Pengeluaran manajemen" : "Pengeluaran kos";
  }
  if (t.startsWith("pengeluaran")) return "Pengeluaran kos";
  if (t.startsWith("pemasukan")) return "Pemasukan manajemen";
  return "Pemasukan manajemen";
}

export type FinanceKategoriRow = {
  id: string;
  tipe: FinanceType;
  namaPos: string;
  /** Hanya untuk tipe Pengeluaran — membagi P&L kos vs manajemen. */
  pengeluaranScope?: PengeluaranScope;
};

export type LokasiRow = {
  id: string;
  namaLokasi: string;
};

export type BlokRow = {
  id: string;
  lokasiId: string;
  namaBlok: string;
};

export type UserProfileRow = {
  id: string;
  nama: string;
  email: string;
  /** Untuk akun baru: login pendek di Supabase Auth disimpan sebagai email sintesis `username@{domain}` */
  username?: string;
  noHp: string;
  role: UserRole;
  aksesLokasi: string[];
  aksesBlok: string[];
  /** Khusus demo lokal agar akun master user dapat dipakai login demo. */
  demoPassword?: string;
};

export type PasswordChangeLogRow = {
  id: string;
  subjectUserId: string;
  actorUserId: string | null;
  source: string;
  detail: string;
  createdAt: string;
};

type MasterSandboxBlob = {
  financeData: FinanceKategoriRow[];
  lokasiData: LokasiRow[];
  blokData: BlokRow[];
  usersData: UserProfileRow[];
};

const DEMO_SEED_LOKASI: LokasiRow[] = [
  { id: "sb-lok-jakarta-selatan", namaLokasi: "Jakarta Selatan" },
  { id: "sb-lok-bandung", namaLokasi: "Bandung" },
];

const DEMO_SEED_BLOK: BlokRow[] = [
  { id: "sb-blk-jaksel-a", lokasiId: "sb-lok-jakarta-selatan", namaBlok: "Blok A" },
  { id: "sb-blk-jaksel-b", lokasiId: "sb-lok-jakarta-selatan", namaBlok: "Blok B" },
  { id: "sb-blk-bandung-a", lokasiId: "sb-lok-bandung", namaBlok: "Blok A" },
];

function withDemoMasterSeed(blob: MasterSandboxBlob): MasterSandboxBlob {
  const lokasi = blob.lokasiData.length > 0 ? blob.lokasiData : DEMO_SEED_LOKASI;
  const existingLokasiIds = new Set(lokasi.map((l) => l.id));
  const blok =
    blob.blokData.length > 0
      ? blob.blokData
      : DEMO_SEED_BLOK.filter((b) => existingLokasiIds.has(b.lokasiId));
  return {
    ...blob,
    lokasiData: lokasi,
    blokData: blok,
  };
}

export default function MasterPageClient({
  initialFinanceKategori,
  initialLokasi,
  initialBlok,
  initialUsers,
}: {
  initialFinanceKategori: FinanceKategoriRow[];
  initialLokasi: LokasiRow[];
  initialBlok: BlokRow[];
  initialUsers: UserProfileRow[];
}) {
  const sessionHydrated = useSupabaseSessionHydrated();
  const cloudSyncTick = useCloudDataResyncTick();
  const { localDemoMode } = useSandboxMode();
  const { toast, confirm } = useAppFeedback();
  const [activeTab, setActiveTab] = useState<MasterTab>("finance");
  const [financeData, setFinanceData] = useState(initialFinanceKategori);
  const [lokasiData, setLokasiData] = useState(initialLokasi);
  const [blokData, setBlokData] = useState(initialBlok);
  const [usersData, setUsersData] = useState(initialUsers);
  const [passwordLogRows, setPasswordLogRows] = useState<PasswordChangeLogRow[]>([]);

  const userNameById = useMemo(() => new Map(usersData.map((u) => [u.id, u.nama])), [usersData]);

  const [financeForm, setFinanceForm] = useState<{
    tipe: FinanceType;
    namaPos: string;
  }>({
    tipe: "Pemasukan manajemen",
    namaPos: "",
  });
  const [lokasiForm, setLokasiForm] = useState({ namaLokasi: "" });
  const [blokForm, setBlokForm] = useState({
    lokasiId: initialLokasi[0]?.id ?? "",
    namaBlok: "",
  });
  const [editingFinanceId, setEditingFinanceId] = useState<string | null>(null);
  const [editingLokasiId, setEditingLokasiId] = useState<string | null>(null);
  const [editingBlokId, setEditingBlokId] = useState<string | null>(null);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<UserRole>("staff");
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState({
    nama: "",
    username: "",
    noHp: "",
    password: "",
    role: "manager" as UserRole,
    aksesLokasi: [] as string[],
    aksesBlok: [] as string[],
  });

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const persistMasterFull = (f: FinanceKategoriRow[], l: LokasiRow[], b: BlokRow[], u: UserProfileRow[]) => {
    writeSandboxJson(SB_KEY.master, { financeData: f, lokasiData: l, blokData: b, usersData: u });
    if (localDemoMode && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("secondroom-master-sandbox-updated"));
    }
  };

  useEffect(() => {
    if (!localDemoMode) return;
    const m = readSandboxJson<MasterSandboxBlob | null>(SB_KEY.master, null);
    if (m) {
      const seeded = withDemoMasterSeed(m);
      const normalizedFin = seeded.financeData.map((r) => ({
        ...r,
        pengeluaranScope:
          isPengeluaranTipe(r.tipe) ? normalizePengeluaranScope(r.pengeluaranScope) : undefined,
      }));
      const finScopeMigrated = seeded.financeData.some(
        (r, i) =>
          isPengeluaranTipe(r.tipe) &&
          normalizedFin[i]?.pengeluaranScope !== r.pengeluaranScope
      );
      setFinanceData(normalizedFin);
      setLokasiData(seeded.lokasiData);
      setBlokData(seeded.blokData);
      setUsersData(seeded.usersData);
      if (
        seeded.lokasiData.length !== m.lokasiData.length ||
        seeded.blokData.length !== m.blokData.length ||
        finScopeMigrated
      ) {
        persistMasterFull(normalizedFin, seeded.lokasiData, seeded.blokData, seeded.usersData);
      }
      const firstLok = seeded.lokasiData[0]?.id;
      if (firstLok) {
        setBlokForm((prev) => ({ ...prev, lokasiId: firstLok }));
      }
    } else {
      const seeded = withDemoMasterSeed({
        financeData: initialFinanceKategori,
        lokasiData: initialLokasi,
        blokData: initialBlok,
        usersData: initialUsers,
      });
      const normalizedFin = seeded.financeData.map((r) => ({
        ...r,
        pengeluaranScope:
          isPengeluaranTipe(r.tipe) ? normalizePengeluaranScope(r.pengeluaranScope) : undefined,
      }));
      setFinanceData(normalizedFin);
      setLokasiData(seeded.lokasiData);
      setBlokData(seeded.blokData);
      setUsersData(seeded.usersData);
      persistMasterFull(normalizedFin, seeded.lokasiData, seeded.blokData, seeded.usersData);
      setBlokForm((prev) => ({ ...prev, lokasiId: seeded.lokasiData[0]?.id ?? prev.lokasiId }));
    }
  }, [localDemoMode, initialFinanceKategori, initialLokasi, initialBlok, initialUsers]);

  const tabBtnClass = (tab: MasterTab) =>
    `w-full rounded-full px-4 py-2.5 text-left text-[0.65rem] font-semibold tracking-[0.1em] transition sm:inline-block sm:w-auto sm:py-2 sm:text-center sm:text-xs sm:tracking-[0.14em] ${
      activeTab === tab
        ? "bg-gradient-to-r from-[#60482f] to-[#8f734f] text-[#f8ebd7]"
        : "bg-[#f2e4d0] text-[#6b5236] hover:bg-[#e8d6be] dark:bg-[#2c2117] dark:text-[#d7bb95] dark:hover:bg-[#3a2c1f]"
    }`;

  const resetMessages = () => {
    setErrorMessage("");
    setSuccessMessage("");
  };

  useEffect(() => {
    if (localDemoMode) {
      const demo = readDemoProfileSession();
      setCurrentUserId(demo?.id ?? null);
      setCurrentUserRole(normalizeUserProfileRole(demo?.role) as UserRole);
      return;
    }
    if (!sessionHydrated) return;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      setCurrentUserId(user?.id ?? null);
      if (!user) {
        setCurrentUserRole("staff");
        return;
      }
      const { data } = await supabase.from("user_profiles").select("role").eq("id", user.id).maybeSingle();
      const role = normalizeUserProfileRole((data as Record<string, unknown> | null)?.role);
      setCurrentUserRole(role as UserRole);
    })();
  }, [localDemoMode, sessionHydrated, cloudSyncTick]);

  const canManageMaster = currentUserRole === "super_admin" || currentUserRole === "manager";
  const canSuperAdminMaster = currentUserRole === "super_admin";
  /** Cloud: pembuatan/penghapusan user dan password → Super Admin API saja */
  const canMutateMasterUsersCloud = currentUserRole === "super_admin" && !localDemoMode;
  const canMutateMasterUsersSandbox = localDemoMode && canManageMaster;
  const canMutateMasterUsers = canMutateMasterUsersCloud || canMutateMasterUsersSandbox;

  const userMenuAccessLabel = useMemo(() => {
    if (userForm.role === "owner") return "Dashboard saja";
    if (userForm.role === "supervisor" || userForm.role === "staff")
      return "Dashboard, Penghuni, Kamar, Finance, Laporan (tanpa Master)";
    return "Semua menu (termasuk Master)";
  }, [userForm.role]);

  const resetUserForm = () => {
    setEditingUserId(null);
    setUserForm({
      nama: "",
      username: "",
      noHp: "",
      password: "",
      role: "manager",
      aksesLokasi: [],
      aksesBlok: [],
    });
  };

  const blokOptionsForUserForm = useMemo(() => {
    const pickLokasi = userForm.role === "owner" || userForm.role === "staff";
    if (pickLokasi && userForm.aksesLokasi.length > 0) {
      return blokData.filter((b) => userForm.aksesLokasi.includes(b.lokasiId));
    }
    return blokData;
  }, [blokData, userForm.role, userForm.aksesLokasi]);

  const callMasterUsersApi = async (
    method: string,
    body?: Record<string, unknown>,
    deleteId?: string
  ) => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error("Sesi habis. Silakan login ulang.");
    }
    const url =
      method === "DELETE" && deleteId
        ? `/api/master/users?id=${encodeURIComponent(deleteId)}`
        : "/api/master/users";
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: body && method !== "DELETE" ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      throw new Error(json.error || "Permintaan gagal.");
    }
    return json;
  };

  const refreshAll = async (): Promise<boolean> => {
    setIsLoading(true);
    if (localDemoMode) {
      setPasswordLogRows([]);
      const m = readSandboxJson<MasterSandboxBlob | null>(SB_KEY.master, null);
      if (m) {
        setFinanceData(
          m.financeData.map((r) => ({
            ...r,
            pengeluaranScope:
              isPengeluaranTipe(r.tipe) ? normalizePengeluaranScope(r.pengeluaranScope) : undefined,
          }))
        );
        setLokasiData(m.lokasiData);
        setBlokData(m.blokData);
        setUsersData(m.usersData);
      }
      setIsLoading(false);
      return true;
    }
    const [financeRes, lokasiRes, blokRes, usersRes, pwdLogRes] = await Promise.all([
      supabase.from("finance_kategori").select("*").order("created_at", { ascending: false }),
      supabase.from("master_lokasi").select("*").order("created_at", { ascending: false }),
      supabase.from("master_blok").select("*").order("created_at", { ascending: false }),
      supabase.from("user_profiles").select("*").order("created_at", { ascending: false }),
      supabase
        .from("password_change_log")
        .select("id, subject_user_id, actor_user_id, source, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (financeRes.error || lokasiRes.error || blokRes.error || usersRes.error) {
      setPasswordLogRows([]);
      setErrorMessage(
        financeRes.error?.message ||
          lokasiRes.error?.message ||
          blokRes.error?.message ||
          usersRes.error?.message ||
          "Gagal refresh data master."
      );
      setIsLoading(false);
      return false;
    }

    if (!pwdLogRes.error && pwdLogRes.data) {
      setPasswordLogRows(
        pwdLogRes.data.map((raw) => {
          const row = raw as Record<string, unknown>;
          const ca = row.created_at;
          const created =
            typeof ca === "string"
              ? ca
              : ca && typeof ca === "object" && "toISOString" in (ca as Date)
                ? (ca as Date).toISOString()
                : String(ca ?? "");
          return {
            id: String(row.id ?? ""),
            subjectUserId: String(row.subject_user_id ?? ""),
            actorUserId: row.actor_user_id != null ? String(row.actor_user_id) : null,
            source: String(row.source ?? ""),
            detail: String(row.detail ?? ""),
            createdAt: created,
          };
        })
      );
    } else {
      setPasswordLogRows([]);
    }

    setFinanceData(
      (financeRes.data ?? []).map((row) => {
        const rec = row as Record<string, unknown>;
        const tipe = normalizeFinanceTipe(rec.tipe, rec.pengeluaran_scope, rec.nama_pos ?? rec.pos ?? rec.nama);
        return {
          id: String(rec.id ?? ""),
          tipe,
          namaPos:
            String(rec.nama_pos ?? "") ||
            String(rec.pos ?? "") ||
            String(rec.nama ?? ""),
          pengeluaranScope:
            isPengeluaranTipe(tipe) ? normalizePengeluaranScope(rec.pengeluaran_scope) : undefined,
        };
      })
    );

    const lokasiMapped = (lokasiRes.data ?? []).map((row) => ({
      id: String((row as Record<string, unknown>).id ?? ""),
      namaLokasi:
        String((row as Record<string, unknown>).nama_lokasi ?? "") ||
        String((row as Record<string, unknown>).nama ?? ""),
    }));

    setLokasiData(lokasiMapped);

    setBlokForm((prev) => {
      const stillValid = lokasiMapped.some((l) => l.id === prev.lokasiId);
      if (stillValid) return prev;
      const first = lokasiMapped[0]?.id ?? "";
      return first ? { ...prev, lokasiId: first } : prev;
    });

    setBlokData(
      (blokRes.data ?? []).map((row) => ({
        id: String((row as Record<string, unknown>).id ?? ""),
        lokasiId: String((row as Record<string, unknown>).lokasi_id ?? ""),
        namaBlok:
          String((row as Record<string, unknown>).nama_blok ?? "") ||
          String((row as Record<string, unknown>).nama ?? ""),
      }))
    );

    setUsersData(
      (usersRes.data ?? []).map((row) => {
        const record = row as Record<string, unknown>;
        const rawRole = String(record.role ?? "staff").toLowerCase();
        const allowed = new Set(["super_admin", "owner", "staff", "supervisor", "manager"]);
        const role = (allowed.has(rawRole) ? rawRole : "staff") as UserRole;

        const aksesLokasiRaw = record.akses_lokasi;
        const aksesBlokRaw = record.akses_blok;

        return {
          id: String(record.id ?? ""),
          nama:
            String(record.full_name ?? "") ||
            String(record.nama ?? "") ||
            String(record.name ?? "Unknown User"),
          email: String(record.email ?? "-"),
          username:
            typeof record.username === "string" && record.username.trim() ?
              String(record.username).trim()
            : undefined,
          noHp: String(record.no_hp ?? "") || String(record.noHp ?? "") || "",
          role,
          aksesLokasi: Array.isArray(aksesLokasiRaw)
            ? aksesLokasiRaw.map((item) => String(item))
            : [],
          aksesBlok: Array.isArray(aksesBlokRaw) ? aksesBlokRaw.map((item) => String(item)) : [],
        };
      })
    );

    setIsLoading(false);
    return true;
  };

  useEffect(() => {
    if (localDemoMode) return;
    void refreshAll();
  }, [localDemoMode]);

  const submitFinanceKategori = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsLoading(true);

    const trimmedPos = financeForm.namaPos.trim();
    const pemasukanKindByPos = classifyPemasukanKindByPos(trimmedPos);
    if (
      financeForm.tipe === "Pemasukan kos" &&
      pemasukanKindByPos !== "sewa_kamar" &&
      pemasukanKindByPos !== "booking_fee"
    ) {
      const msg = 'Pemasukan kos hanya untuk POS "Sewa kamar" atau "Booking fee". POS lainnya gunakan tipe Pemasukan manajemen.';
      setErrorMessage(msg);
      toast(msg, "error");
      setIsLoading(false);
      return;
    }
    const resolvedPengeluaranScope = pengeluaranScopeForFinanceTipe(financeForm.tipe);
    const resolvedPemasukanScope = pemasukanScopeForFinanceTipe(financeForm.tipe);
    const resolvedPemasukanKind =
      financeForm.tipe === "Pemasukan kos" ? pemasukanKindByPos : pemasukanKindForFinanceTipe(financeForm.tipe);
    const payload = {
      tipe: financeForm.tipe,
      nama_pos: trimmedPos,
      pengeluaran_scope: resolvedPengeluaranScope,
      pemasukan_scope: resolvedPemasukanScope,
      pemasukan_kind: resolvedPemasukanKind,
    };

    if (localDemoMode) {
      const nextRow: FinanceKategoriRow = {
        id: editingFinanceId ?? newSandboxId(),
        tipe: financeForm.tipe,
        namaPos: trimmedPos || "(Tanpa nama)",
        pengeluaranScope: resolvedPengeluaranScope ?? undefined,
      };
      const nextFinance = editingFinanceId
        ? financeData.map((r) => (r.id === editingFinanceId ? nextRow : r))
        : [nextRow, ...financeData];
      setFinanceData(nextFinance);
      persistMasterFull(nextFinance, lokasiData, blokData, usersData);
      setFinanceForm({ tipe: "Pemasukan manajemen", namaPos: "" });
      setEditingFinanceId(null);
      setSuccessMessage("Finance master berhasil disimpan.");
      toast("Data finance master berhasil disimpan.", "success");
      setIsLoading(false);
      return;
    }

    const result = editingFinanceId
      ? await supabase.from("finance_kategori").update(payload).eq("id", editingFinanceId)
      : await supabase.from("finance_kategori").insert(payload);

    if (result.error) {
      setErrorMessage(result.error.message);
      toast(result.error.message, "error");
      setIsLoading(false);
      return;
    }

    setFinanceForm({ tipe: "Pemasukan manajemen", namaPos: "" });
    setEditingFinanceId(null);
    setSuccessMessage("Finance master data berhasil disimpan.");
    toast("Data finance master berhasil disimpan.", "success");
    await refreshAll();
  };

  const submitLokasi = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsLoading(true);

    if (localDemoMode) {
      if (editingLokasiId) {
        const nextL = lokasiData.map((r) =>
          r.id === editingLokasiId ? { ...r, namaLokasi: lokasiForm.namaLokasi } : r
        );
        setLokasiData(nextL);
        persistMasterFull(financeData, nextL, blokData, usersData);
      } else {
        const nid = newSandboxId();
        const nextL = [...lokasiData, { id: nid, namaLokasi: lokasiForm.namaLokasi }];
        setLokasiData(nextL);
        setBlokForm((prev) => ({ ...prev, lokasiId: nid }));
        persistMasterFull(financeData, nextL, blokData, usersData);
      }
      setLokasiForm({ namaLokasi: "" });
      setEditingLokasiId(null);
      setSuccessMessage("Master lokasi berhasil disimpan.");
      toast("Master lokasi berhasil disimpan.", "success");
      setIsLoading(false);
      return;
    }

    const result = editingLokasiId
      ? await supabase
          .from("master_lokasi")
          .update({ nama_lokasi: lokasiForm.namaLokasi })
          .eq("id", editingLokasiId)
      : await supabase.from("master_lokasi").insert({ nama_lokasi: lokasiForm.namaLokasi });

    if (result.error) {
      setErrorMessage(result.error.message);
      toast(result.error.message, "error");
      setIsLoading(false);
      return;
    }

    setLokasiForm({ namaLokasi: "" });
    setEditingLokasiId(null);
    setSuccessMessage("Master lokasi berhasil disimpan.");
    toast("Master lokasi berhasil disimpan.", "success");
    await refreshAll();
  };

  const submitBlok = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsLoading(true);

    const payload = {
      lokasi_id: blokForm.lokasiId,
      nama_blok: blokForm.namaBlok,
    };

    if (localDemoMode) {
      const nextB = editingBlokId
        ? blokData.map((r) =>
            r.id === editingBlokId
              ? { ...r, lokasiId: blokForm.lokasiId, namaBlok: blokForm.namaBlok }
              : r
          )
        : [...blokData, { id: newSandboxId(), lokasiId: blokForm.lokasiId, namaBlok: blokForm.namaBlok }];
      setBlokData(nextB);
      persistMasterFull(financeData, lokasiData, nextB, usersData);
      setBlokForm((prev) => ({ ...prev, namaBlok: "" }));
      setEditingBlokId(null);
      setSuccessMessage("Master blok/unit berhasil disimpan.");
      toast("Master blok/unit berhasil disimpan.", "success");
      setIsLoading(false);
      return;
    }

    const result = editingBlokId
      ? await supabase.from("master_blok").update(payload).eq("id", editingBlokId)
      : await supabase.from("master_blok").insert(payload);

    if (result.error) {
      setErrorMessage(result.error.message);
      toast(result.error.message, "error");
      setIsLoading(false);
      return;
    }

    setBlokForm((prev) => ({ ...prev, namaBlok: "" }));
    setEditingBlokId(null);
    setSuccessMessage("Master blok/unit berhasil disimpan.");
    toast("Master blok/unit berhasil disimpan.", "success");
    await refreshAll();
  };

  const deleteRow = async (
    table: "finance_kategori" | "master_lokasi" | "master_blok",
    id: string
  ): Promise<boolean> => {
    resetMessages();
    setIsLoading(true);
    if (localDemoMode) {
      if (table === "finance_kategori") {
        const nextF = financeData.filter((r) => r.id !== id);
        setFinanceData(nextF);
        persistMasterFull(nextF, lokasiData, blokData, usersData);
      } else if (table === "master_lokasi") {
        const nextL = lokasiData.filter((r) => r.id !== id);
        const removedBlokIds = new Set(blokData.filter((b) => b.lokasiId === id).map((b) => b.id));
        const nextB = blokData.filter((b) => b.lokasiId !== id);
        const nextU = usersData.map((u) => ({
          ...u,
          aksesLokasi: u.aksesLokasi.filter((x) => x !== id),
          aksesBlok: u.aksesBlok.filter((bid) => !removedBlokIds.has(bid)),
        }));
        setLokasiData(nextL);
        setBlokData(nextB);
        setUsersData(nextU);
        persistMasterFull(financeData, nextL, nextB, nextU);
        setBlokForm((prev) => ({ ...prev, lokasiId: nextL[0]?.id ?? "" }));
      } else {
        const nextB = blokData.filter((r) => r.id !== id);
        const nextU = usersData.map((u) => ({
          ...u,
          aksesBlok: u.aksesBlok.filter((bid) => bid !== id),
        }));
        setBlokData(nextB);
        setUsersData(nextU);
        persistMasterFull(financeData, lokasiData, nextB, nextU);
      }
      setIsLoading(false);
      return true;
    }
    const result = await supabase.from(table).delete().eq("id", id);
    if (result.error) {
      setErrorMessage(result.error.message);
      toast(result.error.message, "error");
      setIsLoading(false);
      return false;
    }
    await refreshAll();
    return true;
  };

  const handleMasterRefresh = async () => {
    const ok = await refreshAll();
    if (ok) {
      toast("Data master berhasil dimuat ulang.", "info");
    } else {
      toast("Gagal memuat ulang. Periksa pesan di halaman.", "error");
    }
  };

  const confirmAndDeleteMasterRow = async (
    table: "finance_kategori" | "master_lokasi" | "master_blok",
    id: string,
    label: string
  ) => {
    const titles: Record<typeof table, string> = {
      finance_kategori: "Hapus POS finance?",
      master_lokasi: "Hapus lokasi kos?",
      master_blok: "Hapus blok / unit?",
    };
    const ok = await confirm({
      title: titles[table],
      message: `Anda akan menghapus "${label}".`,
      confirmLabel: "Ya, hapus",
      cancelLabel: "Batal",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info");
      return;
    }
    const success = await deleteRow(table, id);
    if (success) {
      toast("Data master berhasil dihapus.", "success");
    }
  };

  const toggleUserFormLokasi = (lokasiId: string) => {
    setUserForm((prev) => {
      const has = prev.aksesLokasi.includes(lokasiId);
      const aksesLokasi = has ? prev.aksesLokasi.filter((x) => x !== lokasiId) : [...prev.aksesLokasi, lokasiId];
      const aksesBlok =
        prev.role === "owner" || prev.role === "staff"
          ? prev.aksesBlok.filter((bid) => {
              const b = blokData.find((x) => x.id === bid);
              return b && aksesLokasi.includes(b.lokasiId);
            })
          : prev.aksesBlok;
      return { ...prev, aksesLokasi, aksesBlok };
    });
  };

  const toggleUserFormBlok = (blokId: string) => {
    setUserForm((prev) => {
      const has = prev.aksesBlok.includes(blokId);
      const aksesBlok = has ? prev.aksesBlok.filter((x) => x !== blokId) : [...prev.aksesBlok, blokId];
      return { ...prev, aksesBlok };
    });
  };

  const loadUserIntoForm = (row: UserProfileRow) => {
    setEditingUserId(row.id);
    const allLokasi = lokasiData.map((l) => l.id);
    const lokasiForForm =
      row.role === "supervisor" || row.role === "manager"
        ? allLokasi
        : row.aksesLokasi;
    setUserForm({
      nama: row.nama,
      username: loginDisplayPrimary({ username: row.username, email: row.email }),
      noHp: row.noHp,
      password: "",
      role: row.role,
      aksesLokasi: lokasiForForm,
      aksesBlok: row.aksesBlok,
    });
  };

  const submitUserMaster = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    setIsLoading(true);
    try {
      if (!editingUserId && userForm.password.length < 6) {
        const msg = "Password minimal 6 karakter.";
        setErrorMessage(msg);
        toast(msg, "error");
        setIsLoading(false);
        return;
      }
      if (editingUserId && userForm.password.length > 0 && userForm.password.length < 6) {
        const msg = "Password baru minimal 6 karakter (atau kosongkan).";
        setErrorMessage(msg);
        toast(msg, "error");
        setIsLoading(false);
        return;
      }

      if (userForm.role !== "super_admin") {
        if (userForm.aksesBlok.length === 0) {
          const msg = "Pilih minimal satu blok/unit.";
          setErrorMessage(msg);
          toast(msg, "error");
          setIsLoading(false);
          return;
        }
        if (
          (userForm.role === "owner" || userForm.role === "staff") &&
          userForm.aksesLokasi.length === 0
        ) {
          const msg = "Owner atau Staff wajib memilih minimal satu lokasi.";
          setErrorMessage(msg);
          toast(msg, "error");
          setIsLoading(false);
          return;
        }
      }

      const passwordOutbound =
        localDemoMode ? userForm.password : editingUserId && !canSuperAdminMaster ? "" : userForm.password;

      const payload = {
        nama: userForm.nama.trim(),
        username: userForm.username.trim(),
        noHp: userForm.noHp.trim(),
        password: passwordOutbound,
        role: userForm.role,
        aksesLokasi: userForm.aksesLokasi,
        aksesBlok: userForm.aksesBlok,
      };

      if (localDemoMode) {
        const sandboxEmailFromLogin = (rawLogin: string) => {
          const t = rawLogin.trim();
          if (t.includes("@")) return { email: t.toLowerCase(), username: undefined as string | undefined };
          const u = t
            .replace(/\s+/g, "_")
            .toLowerCase()
            .replace(/[^a-z0-9._-]/g, "");
          return { email: `${u || "user"}@sandbox.demo`, username: u || undefined };
        };
        const allLokasiIds = lokasiData.map((l) => l.id);
        const aksesLokasi =
          userForm.role === "supervisor" || userForm.role === "manager"
            ? allLokasiIds
            : userForm.aksesLokasi;
        if (editingUserId) {
          const nextU = usersData.map((u) => {
            if (u.id !== editingUserId) return u;
            if (u.role === "super_admin") {
              return { ...u, nama: payload.nama, email: payload.username.trim().toLowerCase(), noHp: payload.noHp };
            }
            const sb = sandboxEmailFromLogin(payload.username);
            return {
              ...u,
              nama: payload.nama,
              email: sb.email,
              username: sb.username,
              noHp: payload.noHp,
              role: userForm.role,
              aksesLokasi,
              aksesBlok: userForm.aksesBlok,
              demoPassword: payload.password || u.demoPassword || "",
            };
          });
          setUsersData(nextU);
          persistMasterFull(financeData, lokasiData, blokData, nextU);
          setSuccessMessage("Data user diperbarui.");
          toast("Data user berhasil diperbarui.", "success");
        } else {
          const sb =
            userForm.role === "super_admin"
              ? { email: payload.username.trim().toLowerCase(), username: undefined as string | undefined }
              : sandboxEmailFromLogin(payload.username);
          const newRow: UserProfileRow = {
            id: newSandboxId(),
            nama: payload.nama,
            email: sb.email,
            ...(sb.username ? { username: sb.username } : {}),
            noHp: payload.noHp,
            role: userForm.role,
            aksesLokasi,
            aksesBlok: userForm.aksesBlok,
            demoPassword: payload.password,
          };
          const nextU = [newRow, ...usersData];
          setUsersData(nextU);
          persistMasterFull(financeData, lokasiData, blokData, nextU);
          setSuccessMessage("User baru ditambahkan.");
          toast("User baru berhasil ditambahkan.", "success");
        }
        resetUserForm();
        setIsLoading(false);
        return;
      }

      if (editingUserId) {
        await callMasterUsersApi("PATCH", { ...payload, id: editingUserId });
        setSuccessMessage("Data user berhasil diperbarui.");
        toast("Data user berhasil diperbarui.", "success");
      } else {
        await callMasterUsersApi("POST", payload);
        setSuccessMessage("User baru berhasil ditambahkan.");
        toast("User baru berhasil ditambahkan.", "success");
      }
      resetUserForm();
      await refreshAll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan user.";
      setErrorMessage(msg);
      toast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  const deleteUserMaster = async (row: UserProfileRow) => {
    const ok = await confirm({
      title: "Hapus user?",
      message: `Hapus "${row.nama}" beserta akun loginnya? Tindakan ini permanen di mode cloud.`,
      confirmLabel: "Ya, hapus",
      cancelLabel: "Batal",
      destructive: true,
    });
    if (!ok) {
      toast("Penghapusan dibatalkan.", "info");
      return;
    }
    resetMessages();
    setIsLoading(true);
    try {
      if (localDemoMode) {
        const nextU = usersData.filter((u) => u.id !== row.id);
        setUsersData(nextU);
        persistMasterFull(financeData, lokasiData, blokData, nextU);
        setSuccessMessage("User dihapus.");
        if (editingUserId === row.id) {
          resetUserForm();
        }
        toast("User berhasil dihapus.", "success");
        setIsLoading(false);
        return;
      }
      await callMasterUsersApi("DELETE", undefined, row.id);
      setSuccessMessage("User berhasil dihapus.");
      if (editingUserId === row.id) {
        resetUserForm();
      }
      await refreshAll();
      toast("User berhasil dihapus.", "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Gagal menghapus user.";
      setErrorMessage(msg);
      toast(msg, "error");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="mx-auto min-w-0 max-w-full space-y-5 pb-4">
      <div className={pageTabStripClass}>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={() => setActiveTab("finance")} className={tabBtnClass("finance")}>
            <span className="inline-flex items-center gap-1"><HandCoins size={12} className={iconTone.brand} />Finance Master Data</span>
          </button>
          <button type="button" onClick={() => setActiveTab("lokasi")} className={tabBtnClass("lokasi")}>
            <span className="inline-flex items-center gap-1"><Building2 size={12} className={iconTone.brand} />Lokasi Kos</span>
          </button>
          <button type="button" onClick={() => setActiveTab("user")} className={tabBtnClass("user")}>
            <span className="inline-flex items-center gap-1"><Users size={12} className={iconTone.brand} />Management User</span>
          </button>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
          {errorMessage}
        </p>
      ) : null}
      {successMessage ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {successMessage}
        </p>
      ) : null}
      {null}

      {activeTab === "finance" ? (
        <div className="flex min-w-0 flex-col gap-5">
          <article className={`min-w-0 ${pageSectionClass}`}>
            <SectionTitleWithIcon
              icon={HandCoins}
              title="Form Finance Kategori"
              iconClassName={iconTone.info}
            />
            <form className="mt-4 space-y-4" onSubmit={submitFinanceKategori}>
              <div>
                <label className={pageLabelClass}>Tipe</label>
                <select
                  value={financeForm.tipe}
                  onChange={(event) => {
                    const tipe = event.target.value as FinanceType;
                    setFinanceForm((prev) => ({ ...prev, tipe }));
                  }}
                  className={pageFieldClass}
                >
                  <option value="Pemasukan kos">Pemasukan kos</option>
                  <option value="Pemasukan manajemen">Pemasukan manajemen</option>
                  <option value="Pengeluaran kos">Pengeluaran kos</option>
                  <option value="Pengeluaran manajemen">Pengeluaran manajemen</option>
                </select>
              </div>
              <div>
                <label className={pageLabelClass}>Nama POS</label>
                <input
                  required
                  value={financeForm.namaPos}
                  onChange={(event) =>
                    setFinanceForm((prev) => ({ ...prev, namaPos: event.target.value }))
                  }
                  className={pageFieldClass}
                  placeholder="Contoh: Sewa Bulanan"
                />
              </div>
              {isPengeluaranTipe(financeForm.tipe) ? (
                <p className="mt-1 text-[11px] leading-snug text-[#6b6f8a] dark:text-[#a8add4]">
                  Tipe ini otomatis menentukan lingkup P&amp;L. Untuk pemasukan kos, gunakan POS "Sewa kamar" atau
                  "Booking fee"; POS pemasukan lainnya masuk pemasukan manajemen.
                </p>
              ) : null}
              <ActionButtonWithIcon
                icon={Save}
                type="submit"
                disabled={isLoading || !canManageMaster}
                label={editingFinanceId ? "Update POS" : "Simpan POS"}
                iconClassName={iconTone.success}
                className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-6 py-2.5 text-sm font-semibold text-[#eef3ff] disabled:opacity-70"
              />
            </form>
          </article>

          <article className={`flex min-w-0 flex-col ${pageSectionClass}`}>
            <SectionTitleWithIcon
              icon={Settings2}
              title="List Finance Kategori"
              iconClassName={iconTone.brand}
              className="mb-2 shrink-0"
            />
            <p className="mb-3 shrink-0 text-xs leading-relaxed text-[#5d6fc0] dark:text-[#a8b5e8]">
              Di HP: kartu per baris. Di tablet ke atas: tabel.
            </p>
            <div className="space-y-3 md:hidden">
              {financeData.map((row) => (
                <article
                  key={row.id}
                  className="rounded-2xl border border-[#d6ddff] bg-[#f7f8ff]/90 p-4 dark:border-[#424a80] dark:bg-[#1b1f3d]/90"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <StatusBadge status={row.tipe} />
                    <span className="text-xs text-[#4b4f6b] dark:text-[#b8bdda]">
                      {isPengeluaranTipe(row.tipe)
                        ? pengeluaranScopeForFinanceTipe(row.tipe) === "manajemen"
                          ? "Manajemen"
                          : "Kos"
                        : isPemasukanTipe(row.tipe)
                          ? pemasukanScopeForFinanceTipe(row.tipe) === "kos"
                            ? "Kos"
                            : "Manajemen"
                          : "—"}
                    </span>
                  </div>
                  <p className="mt-3 break-words text-sm font-medium text-[#1f1b42] dark:text-[#dbe3ff]">
                    {row.namaPos}
                  </p>
                  {canManageMaster ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <ActionButtonWithIcon
                        icon={Pencil}
                        onClick={() => {
                          setFinanceForm({
                            tipe: normalizeFinanceTipe(row.tipe, row.pengeluaranScope, row.namaPos),
                            namaPos: row.namaPos,
                          });
                          setEditingFinanceId(row.id);
                        }}
                        label="Edit"
                        className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                      />
                      <ActionButtonWithIcon
                        icon={Trash2}
                        onClick={() =>
                          void confirmAndDeleteMasterRow("finance_kategori", row.id, row.namaPos)
                        }
                        label="Hapus"
                        className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                      />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            <div className="hidden min-w-0 overflow-x-auto rounded-2xl border border-[#d6ddff] md:block dark:border-[#424a80]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f7f8ff] dark:bg-[#1b1f3d]">
                  <tr className="text-xs uppercase tracking-[0.12em] text-[#5d6fc0]">
                    <th className="px-3 py-2.5">Tipe</th>
                    <th className="px-3 py-2.5">Nama POS</th>
                    <th className="px-3 py-2.5">Lingkup</th>
                    <th className="px-3 py-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {financeData.map((row) => (
                    <tr key={row.id} className="border-t border-[#d6ddff] dark:border-[#424a80]">
                      <td className="max-w-[min(12rem,50vw)] px-3 py-2.5 align-top">
                        <StatusBadge status={row.tipe} />
                      </td>
                      <td className="max-w-[min(16rem,55vw)] px-3 py-2.5 align-top break-words">{row.namaPos}</td>
                      <td className="px-3 py-2.5 text-xs text-[#4b4f6b] dark:text-[#b8bdda]">
                        {isPengeluaranTipe(row.tipe)
                          ? pengeluaranScopeForFinanceTipe(row.tipe) === "manajemen"
                            ? "Manajemen"
                            : "Kos"
                          : isPemasukanTipe(row.tipe)
                            ? pemasukanScopeForFinanceTipe(row.tipe) === "kos"
                              ? "Kos"
                              : "Manajemen"
                            : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 align-top">
                        {canManageMaster ? (
                          <div className="flex flex-wrap gap-2">
                            <ActionButtonWithIcon
                              icon={Pencil}
                              onClick={() => {
                                setFinanceForm({
                                  tipe: normalizeFinanceTipe(row.tipe, row.pengeluaranScope, row.namaPos),
                                  namaPos: row.namaPos,
                                });
                                setEditingFinanceId(row.id);
                              }}
                              label="Edit"
                              className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                            />
                            <ActionButtonWithIcon
                              icon={Trash2}
                              onClick={() =>
                                void confirmAndDeleteMasterRow("finance_kategori", row.id, row.namaPos)
                              }
                              label="Hapus"
                              className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                            />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 shrink-0 text-[11px] leading-snug text-[#6b6f8a] dark:text-[#8b92b8]">
              Baris mengikuti pengaturan di atas; gunakan scroll halaman jika daftar POS panjang.
            </p>
          </article>
        </div>
      ) : null}

      {activeTab === "lokasi" ? (
        <div className="flex min-w-0 flex-col gap-5">
          <article className={`min-w-0 ${pageSectionClass}`}>
            <SectionTitleWithIcon
              icon={Building2}
              title="Master Lokasi"
              iconClassName={iconTone.info}
            />
            <form className="mt-4 space-y-4" onSubmit={submitLokasi}>
              <input
                required
                value={lokasiForm.namaLokasi}
                onChange={(event) => setLokasiForm({ namaLokasi: event.target.value })}
                className={pageFieldClass}
                placeholder="Nama lokasi kos"
              />
              <ActionButtonWithIcon
                icon={Save}
                type="submit"
                disabled={!canManageMaster}
                label={editingLokasiId ? "Update Lokasi" : "Simpan Lokasi"}
                iconClassName={iconTone.success}
                className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-6 py-2.5 text-sm font-semibold text-[#eef3ff]"
              />
            </form>

            <h3 className="mt-6 mb-2 font-semibold">Daftar Lokasi</h3>
            <div className="space-y-2">
              {lokasiData.map((row) => (
                <div
                  key={row.id}
                  className="flex flex-col gap-2 rounded-xl border border-[#d6ddff] px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-[#424a80]"
                >
                  <span className="min-w-0 break-words">{row.namaLokasi}</span>
                  {canManageMaster ? (
                  <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                    <ActionButtonWithIcon
                      icon={Pencil}
                      onClick={() => {
                        setLokasiForm({ namaLokasi: row.namaLokasi });
                        setEditingLokasiId(row.id);
                      }}
                      label="Edit"
                      className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                    />
                    <ActionButtonWithIcon
                      icon={Trash2}
                      onClick={() =>
                        void confirmAndDeleteMasterRow("master_lokasi", row.id, row.namaLokasi)
                      }
                      label="Hapus"
                      className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                    />
                  </div>
                  ) : null}
                </div>
              ))}
            </div>
          </article>

          <article className={`min-w-0 ${pageSectionClass}`}>
            <SectionTitleWithIcon
              icon={Building2}
              title="Master Blok / Unit"
              iconClassName={iconTone.info}
            />
            <form className="mt-4 space-y-4" onSubmit={submitBlok}>
              <select
                value={blokForm.lokasiId}
                onChange={(event) => setBlokForm((prev) => ({ ...prev, lokasiId: event.target.value }))}
                className={pageFieldClass}
              >
                {lokasiData.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.namaLokasi}
                  </option>
                ))}
              </select>
              <input
                required
                value={blokForm.namaBlok}
                onChange={(event) => setBlokForm((prev) => ({ ...prev, namaBlok: event.target.value }))}
                className={pageFieldClass}
                placeholder="Nama blok / unit"
              />
              <ActionButtonWithIcon
                icon={Save}
                type="submit"
                disabled={!canManageMaster}
                label={editingBlokId ? "Update Blok" : "Simpan Blok"}
                iconClassName={iconTone.success}
                className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-6 py-2.5 text-sm font-semibold text-[#eef3ff]"
              />
            </form>

            <h3 className="mt-6 mb-2 font-semibold">Daftar Blok / Unit</h3>
            <div className="space-y-2">
              {blokData.map((row) => {
                const lokasi = lokasiData.find((loc) => loc.id === row.lokasiId)?.namaLokasi ?? "-";
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-2 rounded-xl border border-[#e4d3bd] px-3 py-2 sm:flex-row sm:items-center sm:justify-between dark:border-[#3d2f22]"
                  >
                    <span className="min-w-0 break-words">
                      {row.namaBlok} ({lokasi})
                    </span>
                    {canManageMaster ? (
                    <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
                      <ActionButtonWithIcon
                        icon={Pencil}
                        onClick={() => {
                          setBlokForm({ lokasiId: row.lokasiId, namaBlok: row.namaBlok });
                          setEditingBlokId(row.id);
                        }}
                        label="Edit"
                        className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                      />
                      <ActionButtonWithIcon
                        icon={Trash2}
                        onClick={() =>
                          void confirmAndDeleteMasterRow("master_blok", row.id, row.namaBlok)
                        }
                        label="Hapus"
                        className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                      />
                    </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      ) : null}

      {activeTab === "user" ? (
        <>
        <div className="flex min-w-0 flex-col gap-5">
          <article className={`min-w-0 ${pageSectionClass}`}>
            <SectionTitleWithIcon
              icon={Users}
              title={editingUserId ? "Edit User" : "Tambah User"}
              iconClassName={iconTone.info}
              className="mb-1"
            />
            <p className="mb-4 text-xs leading-relaxed text-[#5d6fc0] dark:text-[#dbe3ff]">
              {localDemoMode ? (
                <>
                  Sandbox: Anda dapat menguji user seperti biasa secara lokal. Di mode cloud,{" "}
                  <strong>hanya Super Admin</strong> yang dapat menambah, menghapus, mengubah user, serta mengedit
                  password dari Master (API diblok untuk role lain).
                </>
              ) : (
                <>
                  Di mode cloud, <strong>hanya Super Admin</strong> yang dapat menambah, menghapus, mengubah user, serta
                  mengatur password dari sini.
                </>
              )}
            </p>
            <form className="min-w-0 space-y-4" onSubmit={submitUserMaster}>
              <div>
                <label className={pageLabelClass}>Nama</label>
                <input
                  required
                  value={userForm.nama}
                  onChange={(e) => setUserForm((p) => ({ ...p, nama: e.target.value }))}
                  className={pageFieldClass}
                  placeholder="Nama lengkap"
                />
              </div>
              <div>
                <label className={pageLabelClass}>
                  {editingUserId && userForm.role === "super_admin" ? "Email login" : "Username login"}
                </label>
                <input
                  required
                  type="text"
                  autoComplete={editingUserId && userForm.role === "super_admin" ? "email" : "username"}
                  value={userForm.username}
                  onChange={(e) => setUserForm((p) => ({ ...p, username: e.target.value }))}
                  className={pageFieldClass}
                  placeholder={
                    editingUserId && userForm.role === "super_admin" ?
                      "superadmin@gmail.com"
                    : "budiono_kasir (tanpa @ — huruf kecil / angka / . _ -)"
                  }
                />
              </div>
              <div>
                <label className={pageLabelClass}>No. HP</label>
                <input
                  value={userForm.noHp}
                  onChange={(e) => setUserForm((p) => ({ ...p, noHp: e.target.value }))}
                  className={pageFieldClass}
                  placeholder="08…"
                />
              </div>
              <div>
                <label className={pageLabelClass}>Password</label>
                {editingUserId && !canSuperAdminMaster && !localDemoMode ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    Edit password pengguna tidak tersedia untuk role Anda — hanya Super Admin. Minta pemilik mengubah
                    di Master atau gunakan tautan &quot;Lupa Password&quot; di halaman login.
                  </p>
                ) : null}
                <input
                  type="password"
                  required={Boolean(!editingUserId)}
                  disabled={Boolean(editingUserId && !canSuperAdminMaster && !localDemoMode)}
                  value={editingUserId && !canSuperAdminMaster && !localDemoMode ? "" : userForm.password}
                  onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))}
                  className={`mt-2 ${pageFieldClass} disabled:cursor-not-allowed disabled:bg-[#ebefff] disabled:text-[#7a8499] dark:disabled:bg-[#141828]`}
                  placeholder={
                    editingUserId && canSuperAdminMaster
                      ? "Kosongkan jika tidak diubah"
                      : editingUserId
                        ? "—"
                        : "Minimal 6 karakter"
                  }
                />
              </div>

              {userForm.role !== "super_admin" ? (
                <>
                  <div>
                    <label className={pageLabelClass}>Role</label>
                    <select
                      value={userForm.role}
                      onChange={(e) => {
                        const role = e.target.value as UserRole;
                        setUserForm((p) => ({
                          ...p,
                          role,
                          aksesLokasi: role === "owner" || role === "staff" ? p.aksesLokasi : [],
                          aksesBlok:
                            role === "owner" || role === "staff"
                              ? p.aksesBlok.filter((bid) => {
                                  const b = blokData.find((x) => x.id === bid);
                                  return b && p.aksesLokasi.includes(b.lokasiId);
                                })
                              : p.aksesBlok,
                        }));
                      }}
                      className={pageFieldClass}
                    >
                      <option value="owner">Owner</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </select>
                  </div>
                  <div>
                    <label className={pageLabelClass}>Hak menu akses</label>
                    <input
                      value={userMenuAccessLabel}
                      readOnly
                      className={`${pageFieldClass} bg-[#eef2ff] text-[#4f61aa] dark:text-[#dbe3ff]`}
                    />
                  </div>

                  {userForm.role === "owner" || userForm.role === "staff" ? (
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8a6b45]">Hak akses lokasi</p>
                      <p className="mb-2 text-xs text-[#a08058]">Pilih satu atau lebih lokasi yang boleh diakses.</p>
                      <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[#e4d3bd] p-2 pb-3 dark:border-[#3d2f22]">
                        {lokasiData.map((loc) => (
                          <label key={loc.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={userForm.aksesLokasi.includes(loc.id)}
                              onChange={() => toggleUserFormLokasi(loc.id)}
                            />
                            {loc.namaLokasi}
                          </label>
                        ))}
                      </div>
                      <p className="mt-2 text-[11px] leading-snug text-[#a08058] dark:text-[#c4a574]">
                        Kotak lokasi bisa digulir vertikal jika banyak entri — teks di atas kotak tidak terpotong.
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-xl border border-[#e4d3bd] bg-[#fbf4ea] px-3 py-2 text-sm dark:border-[#3d2f22] dark:bg-[#2b2016]">
                      <span className="font-medium text-[#6b5236] dark:text-[#d7bb95]">Hak akses lokasi:</span> semua
                      lokasi (otomatis untuk Supervisor / Manager).
                    </div>
                  )}

                  <div>
                    <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8a6b45]">Hak akses blok / unit</p>
                    <p className="mb-2 text-xs text-[#a08058]">
                      {userForm.role === "owner" || userForm.role === "staff"
                        ? "Hanya blok pada lokasi terpilih yang ditampilkan."
                        : "Pilih blok/unit yang boleh diakses (boleh lebih dari satu)."}
                    </p>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-[#e4d3bd] p-2 pb-3 dark:border-[#3d2f22]">
                      {blokOptionsForUserForm.length === 0 ? (
                        <p className="text-xs text-[#a08058]">
                          {userForm.role === "owner" || userForm.role === "staff"
                            ? "Pilih minimal satu lokasi untuk memilih blok."
                            : "Belum ada data blok."}
                        </p>
                      ) : (
                        blokOptionsForUserForm.map((blk) => {
                          const lokasiNama =
                            lokasiData.find((l) => l.id === blk.lokasiId)?.namaLokasi ?? "";
                          return (
                            <label key={blk.id} className="flex items-center gap-2 text-sm">
                              <input
                                type="checkbox"
                                checked={userForm.aksesBlok.includes(blk.id)}
                                onChange={() => toggleUserFormBlok(blk.id)}
                              />
                              {blk.namaBlok}
                              <span className="text-xs text-[#a08058]">({lokasiNama})</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                    <p className="mt-2 text-[11px] leading-snug text-[#a08058] dark:text-[#c4a574]">
                      Gulir di dalam kotak untuk daftar blok panjang; petunjuk di atas tetap terlihat.
                    </p>
                  </div>
                </>
              ) : (
                <p className="rounded-xl border border-[#d6ddff] bg-[#f7f8ff] px-3 py-2 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]">
                  Akun Super Admin: role dan scope akses tidak diubah dari form ini.
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <ActionButtonWithIcon
                  icon={Save}
                  type="submit"
                  disabled={isLoading || !canMutateMasterUsers}
                  label={editingUserId ? "Simpan Perubahan" : "Simpan User"}
                  iconClassName={iconTone.success}
                  className="rounded-full bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-6 py-2.5 text-sm font-semibold text-[#eef3ff] disabled:opacity-70"
                />
                {editingUserId ? (
                  <ActionButtonWithIcon
                    icon={RefreshCcw}
                    type="button"
                    onClick={() => resetUserForm()}
                    disabled={isLoading}
                    label="Batal edit"
                    iconClassName={iconTone.info}
                    className="rounded-full border border-[#c8d3ff] px-5 py-2 text-xs font-semibold text-[#4f61aa] dark:border-[#424a80] dark:text-[#dbe3ff]"
                  />
                ) : null}
              </div>
            </form>
          </article>

          <article className={`flex min-w-0 flex-col ${pageSectionClass}`}>
            <SectionTitleWithIcon
              icon={Users}
              title="Daftar User"
              iconClassName={iconTone.brand}
              className="mb-2 shrink-0"
            />
            <p className="mb-3 shrink-0 text-xs leading-relaxed text-[#5d6fc0] dark:text-[#a8b5e8]">
              Di HP: kartu per pengguna. Di layar lebar: tabel.
            </p>
            <div className="space-y-3 md:hidden">
              {usersData.map((row) => {
                const isSuper = row.role === "super_admin";
                const canEdit = canMutateMasterUsers && (!isSuper || row.id === currentUserId);
                const canDelete = canMutateMasterUsers && !isSuper && row.id !== currentUserId;
                return (
                  <article
                    key={row.id}
                    className="rounded-2xl border border-[#d6ddff] bg-[#f7f8ff]/90 p-4 dark:border-[#424a80] dark:bg-[#1b1f3d]/90"
                  >
                    <p className="font-semibold text-[#1f1b42] dark:text-[#dbe3ff]">{row.nama}</p>
                    <p className="mt-1 break-all font-mono text-[0.7rem] text-[#4f61aa] dark:text-[#a8b5e8]">
                      {loginDisplayPrimary(row)}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[#5d6fc0] dark:text-[#a8b5e8]">
                      <span>HP: {row.noHp || "—"}</span>
                      <StatusBadge status={row.role} />
                    </div>
                    {canEdit || canDelete ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canEdit ? (
                          <ActionButtonWithIcon
                            icon={Pencil}
                            onClick={() => {
                              resetMessages();
                              loadUserIntoForm(row);
                            }}
                            label="Edit"
                            className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                          />
                        ) : null}
                        {canDelete ? (
                          <ActionButtonWithIcon
                            icon={Trash2}
                            onClick={() => void deleteUserMaster(row)}
                            label="Hapus"
                            className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
            <div className="hidden min-w-0 overflow-x-auto rounded-2xl border border-[#d6ddff] md:block dark:border-[#424a80]">
              <table className="min-w-full table-fixed text-left text-sm">
                <thead className="bg-[#f7f8ff] dark:bg-[#1b1f3d]">
                  <tr className="text-xs uppercase tracking-[0.12em] text-[#5d6fc0]">
                    <th className="w-[18%] px-3 py-2.5">Nama</th>
                    <th className="w-[28%] px-3 py-2.5">Username / Login</th>
                    <th className="w-[14%] px-3 py-2.5">HP</th>
                    <th className="w-[14%] px-3 py-2.5">Role</th>
                    <th className="px-3 py-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.map((row) => {
                    const isSuper = row.role === "super_admin";
                    const canEdit =
                      canMutateMasterUsers && (!isSuper || row.id === currentUserId);
                    const canDelete = canMutateMasterUsers && !isSuper && row.id !== currentUserId;
                    return (
                      <tr key={row.id} className="border-t border-[#d6ddff] dark:border-[#424a80]">
                        <td className="px-3 py-2.5 align-top font-medium break-words">{row.nama}</td>
                        <td className="px-3 py-2.5 align-top font-mono text-[0.7rem] break-all">{loginDisplayPrimary(row)}</td>
                        <td className="px-3 py-2.5 align-top text-xs break-words">{row.noHp || "—"}</td>
                        <td className="px-3 py-2.5 align-top">
                          <StatusBadge status={row.role} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 align-top">
                          <div className="flex flex-wrap gap-2">
                            {canEdit ? (
                              <ActionButtonWithIcon
                                icon={Pencil}
                                onClick={() => {
                                  resetMessages();
                                  loadUserIntoForm(row);
                                }}
                                label="Edit"
                                className="rounded-full bg-blue-500 px-3 py-1 text-xs font-semibold text-white"
                              />
                            ) : null}
                            {canDelete ? (
                              <ActionButtonWithIcon
                                icon={Trash2}
                                onClick={() => void deleteUserMaster(row)}
                                label="Hapus"
                                className="rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white"
                              />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-3 shrink-0 text-[11px] leading-snug text-[#6b6f8a] dark:text-[#8b92b8]">
              Banyak user: di desktop gunakan tabel; di HP gunakan kartu di atas.
            </p>
          </article>
        </div>

          <article className={`mt-5 min-w-0 ${pageSectionClass}`}>
            <SectionTitleWithIcon
              icon={History}
              title="Log perubahan password"
              iconClassName={iconTone.brand}
              className="mb-2 shrink-0"
            />
            <p className="mb-4 text-xs leading-relaxed text-[#5d6fc0] dark:text-[#dbe3ff]">
              Hanya teks audit: waktu, pengguna bersangkutan, sumber, dan keterangan. Nilai password tidak pernah dicatat.
              Sumber <strong>forgot_email</strong>: password baru dibuat sistem lalu dikirim ke inbox; sumber{" "}
              <strong>admin_master</strong>: pembaruan lewat formulir oleh Super Admin.
            </p>
            {localDemoMode ? (
              <p className="rounded-xl border border-[#eadcc9] bg-[#faf6ef] px-3 py-2 text-xs text-[#7f6344] dark:border-[#3d3228] dark:bg-[#261c14] dark:text-[#d4bc94]">
                Mode sandbox: log password tidak tersedia. Aktifkan koneksi Supabase untuk mencatat perubahan.
              </p>
            ) : !canMutateMasterUsersCloud && !localDemoMode ? (
              <p className="rounded-xl border border-[#eadcc9] px-3 py-2 text-xs text-[#7f6344]">
                Log ini hanya tersedia untuk Super Admin pada mode cloud.
              </p>
            ) : passwordLogRows.length === 0 ? (
              <p className="text-xs text-[#a08058]">
                Belum ada entri atau tabel audit belum dimigrasi — jalankan skrip SQL <code className="text-[0.65rem]">password_change_log</code> dari{" "}
                <code className="text-[0.65rem]">supabase/sync_frontend_schema.sql</code> (dan policies di{" "}
                <code className="text-[0.65rem]">strict_production_rls.sql</code>).
              </p>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {passwordLogRows.map((log) => {
                    const waktu =
                      log.createdAt && Number.isFinite(Date.parse(log.createdAt))
                        ? new Date(log.createdAt).toLocaleString("id-ID")
                        : log.createdAt || "—";
                    const sid = log.subjectUserId;
                    const shortId = sid.length > 12 ? `${sid.slice(0, 8)}…` : sid;
                    const subjek = userNameById.get(log.subjectUserId) ?? shortId;
                    return (
                      <article
                        key={log.id}
                        className="rounded-2xl border border-[#d6ddff] bg-[#f7f8ff]/90 p-4 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]/90"
                      >
                        <p className="text-xs font-medium text-[#5d6fc0] dark:text-[#a8b5e8]">{waktu}</p>
                        <p className="mt-2 break-words text-[#1f1b42] dark:text-[#dbe3ff]">{subjek}</p>
                        <div className="mt-2">
                          <StatusBadge status={log.source} />
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-[#4a3624] dark:text-[#e8d4bc]">
                          {log.detail}
                        </p>
                      </article>
                    );
                  })}
                </div>
                <div className="hidden min-w-0 overflow-x-auto rounded-2xl border border-[#d6ddff] md:block dark:border-[#424a80]">
                  <table className="min-w-[min(100%,52rem)] text-left text-sm">
                    <thead className="bg-[#f7f8ff] dark:bg-[#1b1f3d]">
                      <tr className="text-[0.65rem] uppercase tracking-[0.12em] text-[#5d6fc0]">
                        <th className="whitespace-nowrap px-3 py-2">Waktu</th>
                        <th className="min-w-[7rem] px-3 py-2">Pengguna</th>
                        <th className="min-w-[6rem] px-3 py-2">Sumber</th>
                        <th className="min-w-[12rem] px-3 py-2">Keterangan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {passwordLogRows.map((log) => {
                        const waktu =
                          log.createdAt && Number.isFinite(Date.parse(log.createdAt))
                            ? new Date(log.createdAt).toLocaleString("id-ID")
                            : log.createdAt || "—";
                        const sid = log.subjectUserId;
                        const shortId = sid.length > 12 ? `${sid.slice(0, 8)}…` : sid;
                        const subjek = userNameById.get(log.subjectUserId) ?? shortId;
                        return (
                          <tr key={log.id} className="border-t border-[#e6eaf8] dark:border-[#2f355f]">
                            <td className="whitespace-nowrap px-3 py-2 align-top text-xs">{waktu}</td>
                            <td className="px-3 py-2 align-top text-xs break-words">{subjek}</td>
                            <td className="px-3 py-2 align-top">
                              <StatusBadge status={log.source} />
                            </td>
                            <td className="px-3 py-2 align-top text-xs text-[#4a3624] dark:text-[#e8d4bc] break-words">
                              {log.detail}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-[11px] leading-snug text-[#6b6f8a] dark:text-[#8b92b8]">
                  Paragraf penjelasan di atas tidak berada di dalam frame scroll — gunakan scroll halaman untuk melihat
                  seluruh log; teks keterangan di dalam sel dibungkus agar tidak terpotong horizontal.
                </p>
              </>
            )}
          </article>
        </>
      ) : null}

      <RefreshToolbarButton
        onRefresh={handleMasterRefresh}
        disabled={isLoading}
        label={isLoading ? "Memuat…" : "Refresh"}
      />
    </section>
  );
}
