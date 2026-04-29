import { normalizeNotaKey } from "@/lib/finance-nota-validation";

/** POS harus sama persis dengan yang disimpan dari halaman Penghuni (Finance + flag penghuni). */
export const FINANCE_POS_SEWA_KAMAR = "Sewa kamar";
/** Label POS deposit (lowercase) — dipakai form penghuni & transaksi baru. */
export const FINANCE_POS_DEPOSIT_KAMAR = "deposit kamar";
/** Nilai POS lama (sebelum penyesuaian label). */
export const FINANCE_POS_DEPOSIT_KAMAR_LEGACY = "Deposit kamar";

export function isDepositFinancePos(pos: string): boolean {
  const p = (pos ?? "").trim();
  return p === FINANCE_POS_DEPOSIT_KAMAR || p === FINANCE_POS_DEPOSIT_KAMAR_LEGACY;
}

export function isSewaKamarFinancePos(pos: string): boolean {
  return (pos ?? "").trim().toLowerCase() === FINANCE_POS_SEWA_KAMAR.trim().toLowerCase();
}

/** Jumlah baris finance dengan nota + jenis POS (sewa vs deposit) yang sama — untuk pecahan sewa multi-baris. */
export function countFinanceRowsWithSameNotaAndPosKind(
  rows: { noNota: string; pos: string }[],
  ref: { noNota: string; pos: string }
): number {
  const nk = normalizeNotaKey(ref.noNota);
  return rows.filter((r) => {
    if (normalizeNotaKey(r.noNota) !== nk) return false;
    if (isSewaKamarFinancePos(ref.pos)) return isSewaKamarFinancePos(r.pos);
    return isDepositFinancePos(r.pos) && isDepositFinancePos(ref.pos);
  }).length;
}

type PenghuniPaymentSlice = {
  sewaKamarPaid?: boolean;
  sewaKamarNota?: string;
  depositKamarPaid?: boolean;
  depositKamarNota?: string;
};

/**
 * Status lunas hanya valid jika ada no. nota (sinkron dengan Finance).
 * Menormalisasi data lama / rusak: paid=true tanpa nota → diperlakukan belum lunas.
 */
export function sanitizePenghuniPaymentFlags<T extends PenghuniPaymentSlice>(row: T): T {
  const sewaNota = String(row.sewaKamarNota ?? "").trim();
  const depNota = String(row.depositKamarNota ?? "").trim();
  const next = { ...row };
  if (next.sewaKamarPaid && !sewaNota) {
    (next as T).sewaKamarPaid = false;
    (next as T).sewaKamarNota = "";
  }
  if (next.depositKamarPaid && !depNota) {
    (next as T).depositKamarPaid = false;
    (next as T).depositKamarNota = "";
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
  if (!isSewaKamarFinancePos(deleted.pos) && !isDepositFinancePos(deleted.pos)) {
    return rows;
  }
  return rows.map((p) => {
    if (isSewaKamarFinancePos(deleted.pos) && (p.sewaKamarNota ?? "").trim() === nota) {
      return { ...p, sewaKamarPaid: false, sewaKamarNota: "" };
    }
    if (isDepositFinancePos(deleted.pos) && (p.depositKamarNota ?? "").trim() === nota) {
      return { ...p, depositKamarPaid: false, depositKamarNota: "" };
    }
    return p;
  });
}
