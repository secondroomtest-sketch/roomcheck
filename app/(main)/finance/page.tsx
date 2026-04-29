import { createClient } from "@supabase/supabase-js";
import FinancePageClient, { FinancePosOption, FinanceRow } from "@/components/finance-page-client";

function mapFinanceRow(row: Record<string, unknown>): FinanceRow {
  const kategoriRaw = String(row.kategori ?? "Pemasukan");
  const kategori = kategoriRaw === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";

  const pb = row.pelaporan_bulan;
  const pelaporanBulan =
    typeof pb === "string"
      ? pb.slice(0, 10)
      : pb && typeof pb === "object" && "toISOString" in (pb as Date)
        ? (pb as Date).toISOString().slice(0, 10)
        : pb
          ? String(pb).slice(0, 10)
          : "";

  return {
    id: String(row.id ?? ""),
    noNota: String(row.no_nota ?? ""),
    kategori,
    pos: String(row.pos ?? ""),
    tanggal: String(row.tanggal ?? ""),
    namaPenghuni: String(row.nama_penghuni ?? ""),
    lokasiKos: String(row.lokasi_kos ?? ""),
    unitBlok: String(row.unit_blok ?? ""),
    nominal: String(row.nominal ?? ""),
    keterangan: String(row.keterangan ?? ""),
    pelaporanBulan: pelaporanBulan || undefined,
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
  const tipeRaw = String(row.tipe ?? "Pemasukan");
  const tipe = tipeRaw === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";

  return {
    id: String(row.id ?? label),
    label,
    tipe,
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
