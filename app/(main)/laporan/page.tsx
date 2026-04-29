import { createClient } from "@supabase/supabase-js";
import LaporanPageClient from "@/components/laporan-page-client";
import type { ReportFinanceRow, ReportKamarRow } from "@/lib/laporan-export-types";
import type { PenghuniRow, SurveyCalonRow } from "@/components/penghuni-page-client";
import { sanitizePenghuniPaymentFlags } from "@/lib/penghuni-finance-payment-sync";

type PenghuniLookup = {
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
};

function mapFinanceRow(
  row: Record<string, unknown>,
  penghuniLookupMap: Map<string, PenghuniLookup>
): ReportFinanceRow {
  const kategoriRaw = String(row.kategori ?? "Pemasukan");
  const kategori = kategoriRaw === "Pengeluaran" ? "Pengeluaran" : "Pemasukan";
  const namaPenghuni = String(row.nama_penghuni ?? "").trim();
  const penghuniData = penghuniLookupMap.get(namaPenghuni);

  return {
    id: String(row.id ?? ""),
    tanggal: String(row.tanggal ?? ""),
    kategori,
    nominal: Number(row.nominal ?? 0),
    lokasiKos: String(row.lokasi_kos ?? penghuniData?.lokasiKos ?? "Unknown"),
    unitBlok: String(row.unit_blok ?? penghuniData?.unitBlok ?? "Unknown"),
    pos: String(row.pos ?? ""),
  };
}

function mapKamarRow(row: Record<string, unknown>): ReportKamarRow {
  const statusRaw = String(row.status ?? "Available");
  const status =
    statusRaw === "Occupied" || statusRaw === "Maintenance" ? statusRaw : "Available";

  return {
    id: String(row.id ?? ""),
    status,
    lokasiKos: String(row.lokasi_kos ?? "Unknown"),
    unitBlok: String(row.unit_blok ?? "Unknown"),
  };
}

function mapDbRowToPenghuni(row: Record<string, unknown>): PenghuniRow {
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

function mapDbRowToSurvey(row: Record<string, unknown>): SurveyCalonRow {
  return {
    id: String(row.id ?? ""),
    namaLengkap: String(row.nama_lengkap ?? ""),
    lokasiKos: String(row.lokasi_kos ?? ""),
    unitBlok: String(row.unit_blok ?? ""),
    periodeSewa: String(row.periode_sewa_bulan ?? "12"),
    rencanaCheckIn: String(row.tgl_check_in ?? ""),
    negosiasiHarga: String(row.harga_bulanan ?? ""),
    noWa: String(row.no_wa ?? ""),
    keterangan: String(row.keterangan ?? ""),
    createdAt: row.created_at ? String(row.created_at) : undefined,
  };
}

export default async function LaporanPage() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let financeRows: ReportFinanceRow[] = [];
  let kamarRows: ReportKamarRow[] = [];
  let penghuniRows: PenghuniRow[] = [];
  let surveyRows: SurveyCalonRow[] = [];
  let availableLokasi: string[] = [];
  let availableUnit: string[] = [];

  if (supabaseUrl && supabaseAnonKey) {
    const client = createClient(supabaseUrl, supabaseAnonKey);

    const [{ data: rawFinanceRows }, { data: rawKamarRows }, { data: rawPenghuniRows }] =
      await Promise.all([
        client.from("finance").select("*"),
        client.from("kamar").select("*"),
        client.from("penghuni").select("*"),
      ]);

    const penghuniLookupMap = new Map<string, PenghuniLookup>();
    (rawPenghuniRows ?? []).forEach((row) => {
      const record = row as Record<string, unknown>;
      const nama = String(record.nama_lengkap ?? "").trim();
      if (!nama) {
        return;
      }

      penghuniLookupMap.set(nama, {
        namaLengkap: nama,
        lokasiKos: String(record.lokasi_kos ?? "Unknown"),
        unitBlok: String(record.unit_blok ?? "Unknown"),
      });
    });

    financeRows = (rawFinanceRows ?? []).map((row) =>
      mapFinanceRow(row as Record<string, unknown>, penghuniLookupMap)
    );
    kamarRows = (rawKamarRows ?? []).map((row) => mapKamarRow(row as Record<string, unknown>));
    const allPenghuni = (rawPenghuniRows ?? []) as Array<Record<string, unknown>>;
    penghuniRows = allPenghuni
      .filter((row) => String(row.status ?? "").toLowerCase() !== "survey")
      .map((row) => mapDbRowToPenghuni(row));
    surveyRows = allPenghuni
      .filter((row) => String(row.status ?? "").toLowerCase() === "survey")
      .map((row) => mapDbRowToSurvey(row));

    const lokasiSet = new Set<string>();
    const unitSet = new Set<string>();

    financeRows.forEach((row) => {
      if (row.lokasiKos && row.lokasiKos !== "Unknown") {
        lokasiSet.add(row.lokasiKos);
      }
      if (row.unitBlok && row.unitBlok !== "Unknown") {
        unitSet.add(row.unitBlok);
      }
    });

    kamarRows.forEach((row) => {
      if (row.lokasiKos && row.lokasiKos !== "Unknown") {
        lokasiSet.add(row.lokasiKos);
      }
      if (row.unitBlok && row.unitBlok !== "Unknown") {
        unitSet.add(row.unitBlok);
      }
    });

    availableLokasi = Array.from(lokasiSet).sort((a, b) => a.localeCompare(b));
    availableUnit = Array.from(unitSet).sort((a, b) => a.localeCompare(b));
  }

  return (
    <LaporanPageClient
      financeRows={financeRows}
      kamarRows={kamarRows}
      penghuniRows={penghuniRows}
      surveyRows={surveyRows}
      availableLokasi={availableLokasi}
      availableUnit={availableUnit}
    />
  );
}
