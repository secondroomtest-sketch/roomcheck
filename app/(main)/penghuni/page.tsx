import { createClient } from "@supabase/supabase-js";
import PenghuniPageClient, { PenghuniRow } from "@/components/penghuni-page-client";
import { sanitizePenghuniPaymentFlags } from "@/lib/penghuni-finance-payment-sync";
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

function mapDbRowToUi(row: Record<string, unknown>): PenghuniRow {
  const statusRaw = String(row.status ?? "Booking");
  const status: PenghuniRow["status"] = statusRaw === "Stay" ? "Stay" : "Booking";

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

    initialData = (data ?? []).map((row) => mapDbRowToUi(row as Record<string, unknown>));

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
