"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/libsupabaseClient";
import { Building2, HandCoins, Pencil, RefreshCcw, Save, Settings2, Trash2, Users } from "lucide-react";
import { iconTone } from "@/lib/ui-accent";
import ActionButtonWithIcon from "@/components/ui/action-button-with-icon";
import RefreshToolbarButton from "@/components/ui/refresh-toolbar-button";
import SectionTitleWithIcon from "@/components/ui/section-title-with-icon";
import StatusBadge from "@/components/ui/status-badge";
import { useSandboxMode } from "@/components/sandbox-mode-provider";
import { useAppFeedback } from "@/components/app-feedback-provider";
import { readSandboxJson, writeSandboxJson, SB_KEY, newSandboxId } from "@/lib/sandbox-storage";
import { readDemoProfileSession } from "@/lib/demo-auth";

type MasterTab = "finance" | "lokasi" | "user";
export type UserRole = "super_admin" | "owner" | "staff" | "supervisor" | "manager";
type FinanceType = "Pemasukan" | "Pengeluaran";

export type FinanceKategoriRow = {
  id: string;
  tipe: FinanceType;
  namaPos: string;
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
  noHp: string;
  role: UserRole;
  aksesLokasi: string[];
  aksesBlok: string[];
  /** Khusus demo lokal agar akun master user dapat dipakai login demo. */
  demoPassword?: string;
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
  const { localDemoMode } = useSandboxMode();
  const { toast, confirm } = useAppFeedback();
  const [activeTab, setActiveTab] = useState<MasterTab>("finance");
  const [financeData, setFinanceData] = useState(initialFinanceKategori);
  const [lokasiData, setLokasiData] = useState(initialLokasi);
  const [blokData, setBlokData] = useState(initialBlok);
  const [usersData, setUsersData] = useState(initialUsers);

  const [financeForm, setFinanceForm] = useState<{ tipe: FinanceType; namaPos: string }>({
    tipe: "Pemasukan",
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
    email: "",
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
    if (!localDemoMode) {
      setFinanceData(initialFinanceKategori);
      setLokasiData(initialLokasi);
      setBlokData(initialBlok);
      setUsersData(initialUsers);
      setBlokForm((prev) => ({ ...prev, lokasiId: initialLokasi[0]?.id ?? prev.lokasiId }));
      return;
    }
    const m = readSandboxJson<MasterSandboxBlob | null>(SB_KEY.master, null);
    if (m) {
      const seeded = withDemoMasterSeed(m);
      setFinanceData(seeded.financeData);
      setLokasiData(seeded.lokasiData);
      setBlokData(seeded.blokData);
      setUsersData(seeded.usersData);
      if (
        seeded.lokasiData.length !== m.lokasiData.length ||
        seeded.blokData.length !== m.blokData.length
      ) {
        persistMasterFull(seeded.financeData, seeded.lokasiData, seeded.blokData, seeded.usersData);
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
      setFinanceData(seeded.financeData);
      setLokasiData(seeded.lokasiData);
      setBlokData(seeded.blokData);
      setUsersData(seeded.usersData);
      persistMasterFull(seeded.financeData, seeded.lokasiData, seeded.blokData, seeded.usersData);
      setBlokForm((prev) => ({ ...prev, lokasiId: seeded.lokasiData[0]?.id ?? prev.lokasiId }));
    }
  }, [localDemoMode, initialFinanceKategori, initialLokasi, initialBlok, initialUsers]);

  const tabBtnClass = (tab: MasterTab) =>
    `rounded-full px-4 py-2 text-xs font-semibold tracking-[0.14em] transition ${
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
      setCurrentUserRole((demo?.role ?? "staff") as UserRole);
      return;
    }
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
      const role = String((data as Record<string, unknown> | null)?.role ?? "staff").toLowerCase();
      const allowed = new Set(["super_admin", "owner", "staff", "supervisor", "manager"]);
      setCurrentUserRole((allowed.has(role) ? role : "staff") as UserRole);
    })();
  }, [localDemoMode]);

  const canManageMaster = currentUserRole === "super_admin" || currentUserRole === "manager";

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
      email: "",
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
      const m = readSandboxJson<MasterSandboxBlob | null>(SB_KEY.master, null);
      if (m) {
        setFinanceData(m.financeData);
        setLokasiData(m.lokasiData);
        setBlokData(m.blokData);
        setUsersData(m.usersData);
      }
      setIsLoading(false);
      return true;
    }
    const [financeRes, lokasiRes, blokRes, usersRes] = await Promise.all([
      supabase.from("finance_kategori").select("*").order("created_at", { ascending: false }),
      supabase.from("master_lokasi").select("*").order("created_at", { ascending: false }),
      supabase.from("master_blok").select("*").order("created_at", { ascending: false }),
      supabase.from("user_profiles").select("*").order("created_at", { ascending: false }),
    ]);

    if (financeRes.error || lokasiRes.error || blokRes.error || usersRes.error) {
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

    setFinanceData(
      (financeRes.data ?? []).map((row) => ({
        id: String((row as Record<string, unknown>).id ?? ""),
        tipe:
          String((row as Record<string, unknown>).tipe ?? "").toLowerCase() === "pengeluaran"
            ? "Pengeluaran"
            : "Pemasukan",
        namaPos:
          String((row as Record<string, unknown>).nama_pos ?? "") ||
          String((row as Record<string, unknown>).pos ?? "") ||
          String((row as Record<string, unknown>).nama ?? ""),
      }))
    );

    setLokasiData(
      (lokasiRes.data ?? []).map((row) => ({
        id: String((row as Record<string, unknown>).id ?? ""),
        namaLokasi:
          String((row as Record<string, unknown>).nama_lokasi ?? "") ||
          String((row as Record<string, unknown>).nama ?? ""),
      }))
    );

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

    const payload = {
      tipe: financeForm.tipe,
      nama_pos: financeForm.namaPos,
    };

    if (localDemoMode) {
      const nextFinance = editingFinanceId
        ? financeData.map((r) =>
            r.id === editingFinanceId ? { ...r, tipe: financeForm.tipe, namaPos: financeForm.namaPos } : r
          )
        : [{ id: newSandboxId(), tipe: financeForm.tipe, namaPos: financeForm.namaPos }, ...financeData];
      setFinanceData(nextFinance);
      persistMasterFull(nextFinance, lokasiData, blokData, usersData);
      setFinanceForm({ tipe: "Pemasukan", namaPos: "" });
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

    setFinanceForm({ tipe: "Pemasukan", namaPos: "" });
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
      email: row.email === "-" ? "" : row.email,
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

      const payload = {
        nama: userForm.nama.trim(),
        email: userForm.email.trim(),
        noHp: userForm.noHp.trim(),
        password: userForm.password,
        role: userForm.role,
        aksesLokasi: userForm.aksesLokasi,
        aksesBlok: userForm.aksesBlok,
      };

      if (localDemoMode) {
        const allLokasiIds = lokasiData.map((l) => l.id);
        const aksesLokasi =
          userForm.role === "supervisor" || userForm.role === "manager"
            ? allLokasiIds
            : userForm.aksesLokasi;
        if (editingUserId) {
          const nextU = usersData.map((u) => {
            if (u.id !== editingUserId) return u;
            if (u.role === "super_admin") {
              return { ...u, nama: payload.nama, email: payload.email, noHp: payload.noHp };
            }
            return {
              ...u,
              nama: payload.nama,
              email: payload.email,
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
          const newRow: UserProfileRow = {
            id: newSandboxId(),
            nama: payload.nama,
            email: payload.email,
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
    <section className="space-y-5">
      <div className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-4 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
        <div className="flex flex-wrap gap-2">
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
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
            <SectionTitleWithIcon
              icon={HandCoins}
              title="Form Finance Kategori"
              iconClassName={iconTone.info}
            />
            <form className="mt-4 space-y-4" onSubmit={submitFinanceKategori}>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">Tipe</label>
                <select
                  value={financeForm.tipe}
                  onChange={(event) =>
                    setFinanceForm((prev) => ({ ...prev, tipe: event.target.value as FinanceType }))
                  }
                  className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
                >
                  <option value="Pemasukan">Pemasukan</option>
                  <option value="Pengeluaran">Pengeluaran</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">Nama POS</label>
                <input
                  required
                  value={financeForm.namaPos}
                  onChange={(event) =>
                    setFinanceForm((prev) => ({ ...prev, namaPos: event.target.value }))
                  }
                  className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
                  placeholder="Contoh: Sewa Bulanan"
                />
              </div>
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

          <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
            <SectionTitleWithIcon
              icon={Settings2}
              title="List Finance Kategori"
              iconClassName={iconTone.brand}
              className="mb-3"
            />
            <div className="overflow-x-auto rounded-2xl border border-[#d6ddff] dark:border-[#424a80]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f7f8ff] dark:bg-[#1b1f3d]">
                  <tr className="text-xs uppercase tracking-[0.12em] text-[#5d6fc0]">
                    <th className="px-3 py-2.5">Tipe</th>
                    <th className="px-3 py-2.5">Nama POS</th>
                    <th className="px-3 py-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {financeData.map((row) => (
                    <tr key={row.id} className="border-t border-[#d6ddff] dark:border-[#424a80]">
                      <td className="px-3 py-2.5">
                        <StatusBadge status={row.tipe} />
                      </td>
                      <td className="px-3 py-2.5">{row.namaPos}</td>
                      <td className="px-3 py-2.5">
                        {canManageMaster ? (
                          <div className="flex gap-2">
                            <ActionButtonWithIcon
                              icon={Pencil}
                              onClick={() => {
                                setFinanceForm({ tipe: row.tipe, namaPos: row.namaPos });
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
          </article>
        </div>
      ) : null}

      {activeTab === "lokasi" ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
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
                className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
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
                <div key={row.id} className="flex items-center justify-between rounded-xl border border-[#d6ddff] px-3 py-2 dark:border-[#424a80]">
                  <span>{row.namaLokasi}</span>
                  {canManageMaster ? (
                  <div className="flex gap-2">
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

          <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
            <SectionTitleWithIcon
              icon={Building2}
              title="Master Blok / Unit"
              iconClassName={iconTone.info}
            />
            <form className="mt-4 space-y-4" onSubmit={submitBlok}>
              <select
                value={blokForm.lokasiId}
                onChange={(event) => setBlokForm((prev) => ({ ...prev, lokasiId: event.target.value }))}
                className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
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
                className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
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
                  <div key={row.id} className="flex items-center justify-between rounded-xl border border-[#e4d3bd] px-3 py-2 dark:border-[#3d2f22]">
                    <span>{row.namaBlok} ({lokasi})</span>
                    {canManageMaster ? (
                    <div className="flex gap-2">
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
        <div className="grid gap-5 lg:grid-cols-2">
          <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
            <SectionTitleWithIcon
              icon={Users}
              title={editingUserId ? "Edit User" : "Tambah User"}
              iconClassName={iconTone.info}
              className="mb-1"
            />
            <p className="mb-4 text-xs text-[#5d6fc0] dark:text-[#dbe3ff]">
              Hanya akun super_admin yang dapat menambah, mengubah, atau menghapus user. Tambahkan{" "}
              <code className="rounded bg-[#eef2ff] px-1 py-0.5 text-[0.65rem] dark:bg-[#1b1f3d]">
                SUPABASE_SERVICE_ROLE_KEY
              </code>{" "}
              di server agar pembuatan password berfungsi.
            </p>
            <form className="space-y-4" onSubmit={submitUserMaster}>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">Nama</label>
                <input
                  required
                  value={userForm.nama}
                  onChange={(e) => setUserForm((p) => ({ ...p, nama: e.target.value }))}
                  className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
                  placeholder="Nama lengkap"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">E-mail</label>
                <input
                  required
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
                  placeholder="email@domain.com"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">No. HP</label>
                <input
                  value={userForm.noHp}
                  onChange={(e) => setUserForm((p) => ({ ...p, noHp: e.target.value }))}
                  className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
                  placeholder="08…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">Password</label>
                <input
                  type="password"
                  required={!editingUserId}
                  value={userForm.password}
                  onChange={(e) => setUserForm((p) => ({ ...p, password: e.target.value }))}
                  className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
                  placeholder={editingUserId ? "Kosongkan jika tidak diubah" : "Minimal 6 karakter"}
                />
              </div>

              {userForm.role !== "super_admin" ? (
                <>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">Role</label>
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
                      className="w-full rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] px-4 py-2.5 text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]"
                    >
                      <option value="owner">Owner</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.16em] text-[#5d6fc0]">Hak menu akses</label>
                    <input
                      value={userMenuAccessLabel}
                      readOnly
                      className="w-full rounded-2xl border border-[#d6ddff] bg-[#eef2ff] px-4 py-2.5 text-sm text-[#4f61aa] dark:border-[#424a80] dark:bg-[#1b1f3d] dark:text-[#dbe3ff]"
                    />
                  </div>

                  {userForm.role === "owner" || userForm.role === "staff" ? (
                    <div>
                      <p className="mb-2 text-xs uppercase tracking-[0.16em] text-[#8a6b45]">Hak akses lokasi</p>
                      <p className="mb-2 text-xs text-[#a08058]">Pilih satu atau lebih lokasi yang boleh diakses.</p>
                      <div className="max-h-40 space-y-1 overflow-y-auto rounded-xl border border-[#e4d3bd] p-2 dark:border-[#3d2f22]">
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
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-[#e4d3bd] p-2 dark:border-[#3d2f22]">
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
                  disabled={isLoading || !canManageMaster}
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

          <article className="rounded-[2rem] border border-[#d8defc] bg-white/90 p-5 dark:border-[#424a80] dark:bg-[#1b1f3d]/95">
            <SectionTitleWithIcon
              icon={Users}
              title="Daftar User"
              iconClassName={iconTone.brand}
              className="mb-3"
            />
            <div className="overflow-x-auto rounded-2xl border border-[#d6ddff] dark:border-[#424a80]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#f7f8ff] dark:bg-[#1b1f3d]">
                  <tr className="text-xs uppercase tracking-[0.12em] text-[#5d6fc0]">
                    <th className="px-3 py-2.5">Nama</th>
                    <th className="px-3 py-2.5">Email</th>
                    <th className="px-3 py-2.5">HP</th>
                    <th className="px-3 py-2.5">Role</th>
                    <th className="px-3 py-2.5">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {usersData.map((row) => {
                    const isSuper = row.role === "super_admin";
                    const canEdit = canManageMaster && (!isSuper || row.id === currentUserId);
                    const canDelete = canManageMaster && !isSuper && row.id !== currentUserId;
                    return (
                      <tr key={row.id} className="border-t border-[#d6ddff] dark:border-[#424a80]">
                        <td className="px-3 py-2.5 font-medium">{row.nama}</td>
                        <td className="px-3 py-2.5 text-xs">{row.email}</td>
                        <td className="px-3 py-2.5 text-xs">{row.noHp || "—"}</td>
                        <td className="px-3 py-2.5">
                          <StatusBadge status={row.role} />
                        </td>
                        <td className="px-3 py-2.5">
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
          </article>
        </div>
      ) : null}

      <RefreshToolbarButton
        onRefresh={handleMasterRefresh}
        disabled={isLoading}
        label={isLoading ? "Memuat…" : "Refresh"}
      />
    </section>
  );
}
