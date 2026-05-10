import { createClient } from "@supabase/supabase-js";
import FinancePageClient, { FinancePosOption, FinanceRow } from "@/components/finance-page-client";
import { pelaporanBulanIsoFromDbRecord } from "@/lib/finance-pelaporan-bulan-from-db";
import { normalizePengeluaranScope } from "@/lib/pengeluaran-scope";

function mapFinanceRow(row: Record<string, unknown>): FinanceRow {
  const kategoriRaw = String(row.kategori ?? "Pemasukan");
  const kategori = kategoriRaw === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";

  return {
    id: String(row.id ?? ""),
    noNota: String(row.no_nota ?? ""),
    kategori,
    pos: String(row.pos ?? ""),
    pengeluaranScope:
      kategori === "Pengeluaran" ? normalizePengeluaranScope(row.pengeluaran_scope) : null,
    pemasukanScope:
      kategori === "Pemasukan"
        ? (normalizePengeluaranScope(row.pemasukan_scope) as "kos" | "manajemen")
        : null,
    pemasukanKind:
      kategori === "Pemasukan"
        ? (String(row.pemasukan_kind ?? "").trim().toLowerCase() as "sewa_kamar" | "booking_fee" | "lain")
        : null,
    tanggal: String(row.tanggal ?? ""),
    namaPenghuni: String(row.nama_penghuni ?? ""),
    lokasiKos: String(row.lokasi_kos ?? ""),
    unitBlok: String(row.unit_blok ?? ""),
    nominal: String(row.nominal ?? ""),
    keterangan: String(row.keterangan ?? ""),
    pelaporanBulan: pelaporanBulanIsoFromDbRecord(row),
    paymentSplitGroupId: row.payment_split_group_id ? String(row.payment_split_group_id) : undefined,
    updatedAt: row.updated_at
      ? String(row.updated_at)
      : row.created_at
        ? String(row.created_at)
        : undefined,
  };
}

function mapPosRow(row: Record<string, unknown>): FinancePosOption {
  const label =
    String(row.nama_pos ?? "") ||
    String(row.pos ?? "") ||
    String(row.nama ?? "") ||
    String(row.kategori ?? "");
  const tipeRaw = String(row.tipe ?? "Pemasukan").trim().toLowerCase();
  const tipe = tipeRaw.startsWith("pengeluaran") ? "Pengeluaran" : "Pemasukan";
  const scopeByTipe =
    tipeRaw === "pengeluaran manajemen"
      ? "manajemen"
      : tipeRaw === "pengeluaran kos" || tipeRaw === "pengeluaran"
        ? "kos"
        : null;

  return {
    id: String(row.id ?? label),
    label,
    tipe,
    pengeluaranScope:
      tipe === "Pengeluaran"
        ? normalizePengeluaranScope(scopeByTipe ?? row.pengeluaran_scope)
        : undefined,
    pemasukanScope:
      tipe === "Pemasukan"
        ? ((tipeRaw === "pemasukan kos" ? "kos" : "manajemen") as "kos" | "manajemen")
        : undefined,
    pemasukanKind:
      tipe === "Pemasukan"
        ? ((tipeRaw === "pemasukan kos" &&
            String(label).trim().toLowerCase() === "booking fee"
            ? "booking_fee"
            : tipeRaw === "pemasukan kos" &&
                String(label).trim().toLowerCase() === "sewa kamar"
              ? "sewa_kamar"
              : "lain") as "sewa_kamar" | "booking_fee" | "lain")
        : undefined,
  };
}

export default async function FinancePage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let initialFinanceData: FinanceRow[] = [];
  let posOptions: FinancePosOption[] = [];

  if (supabaseUrl && supabaseAnonKey) {
    const client = createClient(supabaseUrl, supabaseAnonKey);

    const [{ data: financeRows }, { data: posRows }] = await Promise.all([
      client.from("finance").select("*").order("updated_at", { ascending: false }),
      client.from("finance_kategori").select("*"),
    ]);

    initialFinanceData = (financeRows ?? []).map((row) => mapFinanceRow(row as Record<string, unknown>));
    posOptions = (posRows ?? [])
      .map((row) => mapPosRow(row as Record<string, unknown>))
      .filter((item) => item.label);
  }

  return <FinancePageClient initialFinanceData={initialFinanceData} posOptions={posOptions} />;
}
