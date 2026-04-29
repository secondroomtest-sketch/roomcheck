import { createClient } from "@supabase/supabase-js";
import MasterPageClient, {
  BlokRow,
  FinanceKategoriRow,
  LokasiRow,
  UserProfileRow,
} from "@/components/master-page-client";

function mapFinanceKategori(row: Record<string, unknown>): FinanceKategoriRow {
  return {
    id: String(row.id ?? ""),
    tipe:
      String(row.tipe ?? "").toLowerCase() === "pengeluaran" ? "Pengeluaran" : "Pemasukan",
    namaPos:
      String(row.nama_pos ?? "") || String(row.pos ?? "") || String(row.nama ?? "") || "-",
  };
}

function mapLokasi(row: Record<string, unknown>): LokasiRow {
  return {
    id: String(row.id ?? ""),
    namaLokasi: String(row.nama_lokasi ?? "") || String(row.nama ?? "") || "-",
  };
}

function mapBlok(row: Record<string, unknown>): BlokRow {
  return {
    id: String(row.id ?? ""),
    lokasiId: String(row.lokasi_id ?? ""),
    namaBlok: String(row.nama_blok ?? "") || String(row.nama ?? "") || "-",
  };
}

function mapUser(row: Record<string, unknown>): UserProfileRow {
  const rawRole = String(row.role ?? "staff").toLowerCase();
  const allowed = new Set(["super_admin", "owner", "staff", "supervisor", "manager"]);
  const role = allowed.has(rawRole) ? rawRole : "staff";

  return {
    id: String(row.id ?? ""),
    nama:
      String(row.full_name ?? "") ||
      String(row.nama ?? "") ||
      String(row.name ?? "") ||
      "Unknown User",
    email: String(row.email ?? "-"),
    noHp: String(row.no_hp ?? "") || String(row.noHp ?? "") || "",
    role: role as UserProfileRow["role"],
    aksesLokasi: Array.isArray(row.akses_lokasi)
      ? row.akses_lokasi.map((item) => String(item))
      : [],
    aksesBlok: Array.isArray(row.akses_blok) ? row.akses_blok.map((item) => String(item)) : [],
  };
}

export default async function MasterPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let initialFinanceKategori: FinanceKategoriRow[] = [];
  let initialLokasi: LokasiRow[] = [];
  let initialBlok: BlokRow[] = [];
  let initialUsers: UserProfileRow[] = [];

  if (supabaseUrl && supabaseAnonKey) {
    const client = createClient(supabaseUrl, supabaseAnonKey);

    const [{ data: financeData }, { data: lokasiData }, { data: blokData }, { data: usersData }] =
      await Promise.all([
        client.from("finance_kategori").select("*").order("created_at", { ascending: false }),
        client.from("master_lokasi").select("*").order("created_at", { ascending: false }),
        client.from("master_blok").select("*").order("created_at", { ascending: false }),
        client.from("user_profiles").select("*").order("created_at", { ascending: false }),
      ]);

    initialFinanceKategori = (financeData ?? []).map((row) =>
      mapFinanceKategori(row as Record<string, unknown>)
    );
    initialLokasi = (lokasiData ?? []).map((row) => mapLokasi(row as Record<string, unknown>));
    initialBlok = (blokData ?? []).map((row) => mapBlok(row as Record<string, unknown>));
    initialUsers = (usersData ?? []).map((row) => mapUser(row as Record<string, unknown>));
  }

  return (
    <MasterPageClient
      initialFinanceKategori={initialFinanceKategori}
      initialLokasi={initialLokasi}
      initialBlok={initialBlok}
      initialUsers={initialUsers}
    />
  );
}
