import { createClient } from "@supabase/supabase-js";
import KamarPageClient, { KamarRow } from "@/components/kamar-page-client";
import type { PenghuniForKamarSync } from "@/lib/kamar-penghuni-sync";

function mapDbRowToUi(row: Record<string, unknown>): KamarRow {
  const statusRaw = String(row.status ?? "Available");
  const status = statusRaw === "Occupied" || statusRaw === "Maintenance" ? statusRaw : "Available";

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

function mapPenghuniToKamarSync(row: Record<string, unknown>): PenghuniForKamarSync {
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

export default async function KamarPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let initialData: KamarRow[] = [];
  let initialPenghuniForSync: PenghuniForKamarSync[] = [];

  if (supabaseUrl && supabaseAnonKey) {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const [{ data }, { data: penData }] = await Promise.all([
      client.from("kamar").select("*").order("no_kamar", { ascending: true }),
      client
        .from("penghuni")
        .select("status, lokasi_kos, unit_blok, no_kamar, sewa_kamar_paid, nama_lengkap, tgl_check_out"),
    ]);
    initialData = (data ?? []).map((row) => mapDbRowToUi(row as Record<string, unknown>));
    initialPenghuniForSync = (penData ?? []).map((row) => mapPenghuniToKamarSync(row as Record<string, unknown>));
  }

  return <KamarPageClient initialData={initialData} initialPenghuniForSync={initialPenghuniForSync} />;
}
