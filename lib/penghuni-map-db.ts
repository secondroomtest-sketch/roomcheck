import { sanitizePenghuniPaymentFlags } from "@/lib/penghuni-finance-payment-sync";
import type { PenghuniRow } from "@/components/penghuni-page-client";

export function mapPenghuniStatusFromDb(raw: unknown): PenghuniRow["status"] {
  const s = String(raw ?? "Booking").trim().toLowerCase();
  if (s === "stay") return "Stay";
  if (s === "history") return "History";
  return "Booking";
}

/** Satu mapper DB → UI untuk SSR dan client load. */
export function mapPenghuniDbRowToUi(row: Record<string, unknown>): PenghuniRow {
  const status = mapPenghuniStatusFromDb(row.status);

  const mapped: PenghuniRow = {
    id: String(row.id ?? ""),
    namaLengkap: String(row.nama_lengkap ?? ""),
    lokasiKos: String(row.lokasi_kos ?? ""),
    unitBlok: String(row.unit_blok ?? ""),
    noKamar: String(row.no_kamar ?? ""),
    periodeSewa: String(row.periode_sewa_bulan ?? ""),
    tglCheckIn: String(row.tgl_check_in ?? ""),
    tglCheckOut: String(row.tgl_check_out ?? ""),
    sewaCycleStart: String(row.sewa_cycle_start ?? ""),
    sewaCycleEnd: String(row.sewa_cycle_end ?? ""),
    hargaBulanan: String(row.harga_bulanan ?? ""),
    bookingFee: String(row.booking_fee ?? ""),
    depositKamar: String(row.deposit_kamar ?? ""),
    noWa: String(row.no_wa ?? ""),
    email: String(row.email ?? ""),
    status,
    keterangan: String(row.keterangan ?? ""),
    sewaKamarPaid: Boolean(row.sewa_kamar_paid),
    sewaKamarNota: String(row.sewa_kamar_nota ?? ""),
    bookingFeePaid: Boolean(row.booking_fee_paid),
    bookingFeeNota: String(row.booking_fee_nota ?? ""),
    depositKamarPaid: Boolean(row.deposit_kamar_paid),
    depositKamarNota: String(row.deposit_kamar_nota ?? ""),
    fotoIdentitasPath: String(row.foto_identitas_path ?? ""),
    buktiTransferPath: String(row.bukti_transfer_path ?? ""),
    bookingSource: String(row.booking_source ?? ""),
    createdAt: row.created_at ? String(row.created_at) : null,
  };
  return sanitizePenghuniPaymentFlags(mapped);
}
