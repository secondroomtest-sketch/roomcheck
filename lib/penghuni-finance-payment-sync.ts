import { normalizeNotaKey } from "@/lib/finance-nota-validation";

/** POS harus sama persis dengan yang disimpan dari halaman Penghuni (Finance + flag penghuni). */
export const FINANCE_POS_SEWA_KAMAR = "Sewa kamar";
/** Label POS deposit (lowercase) — dipakai form penghuni & transaksi baru. */
export const FINANCE_POS_DEPOSIT_KAMAR = "deposit kamar";
/** Nilai POS lama (sebelum penyesuaian label). */
export const FINANCE_POS_DEPOSIT_KAMAR_LEGACY = "Deposit kamar";
/** POS booking fee / DP sewa (label Master: "Booking fee"). */
export const FINANCE_POS_BOOKING_FEE = "Booking fee";

export function isDepositFinancePos(pos: string): boolean {
  const p = (pos ?? "").trim();
  return p === FINANCE_POS_DEPOSIT_KAMAR || p === FINANCE_POS_DEPOSIT_KAMAR_LEGACY;
}

export function isSewaKamarFinancePos(pos: string): boolean {
  return (pos ?? "").trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase();
}

/** POS booking fee (label Master: "Booking fee"). */
export function isBookingFeeFinancePos(pos: string): boolean {
  return (pos ?? "").trim().toLowerCase() === FINANCE_POS_BOOKING_FEE.trim().toLowerCase();
}

/** Jumlah baris finance dengan nota + jenis POS (sewa vs deposit vs booking fee) yang sama. */
export function countFinanceRowsWithSameNotaAndPosKind(
  rows: { noNota: string; pos: string }[],
  ref: { noNota: string; pos: string }
): number {
  const nk = normalizeNotaKey(ref.noNota);
  return rows.filter((r) => {
    if (normalizeNotaKey(r.noNota) !== nk) return false;
    if (isSewaKamarFinancePos(ref.pos)) return isSewaKamarFinancePos(r.pos);
    if (isBookingFeeFinancePos(ref.pos)) return isBookingFeeFinancePos(r.pos);
    return isDepositFinancePos(r.pos) && isDepositFinancePos(ref.pos);
  }).length;
}

type PenghuniPaymentSlice = {
  sewaKamarPaid?: boolean;
  sewaKamarNota?: string;
  depositKamarPaid?: boolean;
  depositKamarNota?: string;
  bookingFeePaid?: boolean;
  bookingFeeNota?: string;
};

/**
 * Status lunas hanya valid jika ada no. nota (sinkron dengan Finance).
 * Menormalisasi data lama / rusak: paid=true tanpa nota → diperlakukan belum lunas.
 */
export function sanitizePenghuniPaymentFlags<T extends PenghuniPaymentSlice>(row: T): T {
  const sewaNota = String(row.sewaKamarNota ?? "").trim();
  const depNota = String(row.depositKamarNota ?? "").trim();
  const bfNota = String(row.bookingFeeNota ?? "").trim();
  const next = { ...row };
  if (next.sewaKamarPaid && !sewaNota) {
    (next as T).sewaKamarPaid = false;
    (next as T).sewaKamarNota = "";
  }
  if (next.depositKamarPaid && !depNota) {
    (next as T).depositKamarPaid = false;
    (next as T).depositKamarNota = "";
  }
  if (next.bookingFeePaid && !bfNota) {
    (next as T).bookingFeePaid = false;
    (next as T).bookingFeeNota = "";
  }
  return next;
}

/** Setelah baris finance dihapus, cabut status lunas penghuni yang mengikat ke no. nota tersebut. */
export function clearPenghuniPaymentLinkedToFinanceRow<T extends PenghuniPaymentSlice>(
  rows: T[],
  deleted: { noNota: string; pos: string }
): T[] {
  const nota = (deleted.noNota ?? "").trim();
  if (!nota) return rows;
  if (
    !isSewaKamarFinancePos(deleted.pos) &&
    !isDepositFinancePos(deleted.pos) &&
    !isBookingFeeFinancePos(deleted.pos)
  ) {
    return rows;
  }
  return rows.map((p) => {
    if (isSewaKamarFinancePos(deleted.pos) && (p.sewaKamarNota ?? "").trim() === nota) {
      return { ...p, sewaKamarPaid: false, sewaKamarNota: "" };
    }
    if (isDepositFinancePos(deleted.pos) && (p.depositKamarNota ?? "").trim() === nota) {
      return { ...p, depositKamarPaid: false, depositKamarNota: "" };
    }
    if (isBookingFeeFinancePos(deleted.pos) && (p.bookingFeeNota ?? "").trim() === nota) {
      return { ...p, bookingFeePaid: false, bookingFeeNota: "" };
    }
    return p;
  });
}

/** Sisa sewa setelah DP booking fee (jika sudah lunas). */
export function remainingSewaAfterBookingFee(args: {
  hargaBulanan: number;
  periodeBulan: number;
  bookingFee: number;
  bookingFeePaid?: boolean;
}): number {
  const total = Math.max(0, args.hargaBulanan) * Math.max(0, args.periodeBulan);
  const credited = args.bookingFeePaid ? Math.max(0, args.bookingFee) : 0;
  return Math.max(0, total - credited);
}

/** Apakah deposit wajib dilunasi sebelum / agar bisa Stay. */
export function isDepositDueForStay(depositKamar: number, depositKamarPaid?: boolean): boolean {
  return Math.max(0, depositKamar) > 0 && !depositKamarPaid;
}

/** Booking bisa naik ke Stay jika sewa lunas dan deposit lunas (atau deposit 0). */
export function canPromoteBookingToStay(args: {
  sewaKamarPaid?: boolean;
  depositKamar: number;
  depositKamarPaid?: boolean;
}): boolean {
  if (!args.sewaKamarPaid) return false;
  if (Math.max(0, args.depositKamar) <= 0) return true;
  return Boolean(args.depositKamarPaid);
}
