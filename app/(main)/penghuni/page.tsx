import { createClient } from "@supabase/supabase-js";
import PenghuniPageClient, { PenghuniRow } from "@/components/penghuni-page-client";
import { mapPenghuniDbRowToUi } from "@/lib/penghuni-map-db";
import type { KamarRow } from "@/components/kamar-page-client";

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

export default async function PenghuniPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  let initialData: PenghuniRow[] = [];
  let initialKamarRows: KamarRow[] = [];

  if (supabaseUrl && supabaseAnonKey) {
    const client = createClient(supabaseUrl, supabaseAnonKey);
    const { data } = await client
      .from("penghuni")
      .select("*")
      .order("created_at", { ascending: false });

    initialData = (data ?? [])
      .filter((row) => String((row as Record<string, unknown>).status ?? "").toLowerCase() !== "survey")
      .map((row) => mapPenghuniDbRowToUi(row as Record<string, unknown>));

    const { data: kamarData } = await client
      .from("kamar")
      .select("*")
      .order("no_kamar", { ascending: true });

    initialKamarRows = (kamarData ?? []).map((row) => mapKamarDbToUi(row as Record<string, unknown>));
  }

  return (
    <PenghuniPageClient initialData={initialData} initialKamarRows={initialKamarRows} />
  );
}
