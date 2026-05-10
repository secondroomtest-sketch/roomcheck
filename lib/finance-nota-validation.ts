/** Baris yang punya `id` + `noNota` (mis. FinanceRow). */
export type FinanceNotaRow = { id: string; noNota: string };

/**
 * Untuk cek duplikat: sandbox/demo boleh punya `paymentSplitGroupId`;
 * di cloud tanpa kolom DB, sibling pecahan sewa dikenali lewat kategori + POS.
 */
export type FinanceNotaCheckRow = FinanceNotaRow & {
  paymentSplitGroupId?: string;
  pos?: string;
  kategori?: string;
};

export type FinanceNotaDuplicateIncoming = Pick<FinanceNotaCheckRow, "pos" | "kategori">;

/** Pecahan multi-bulan dari halaman Penghuni: beberapa baris, nota sama. */
function isSewaSplitFamilyRow(r: Pick<FinanceNotaCheckRow, "pos" | "kategori">): boolean {
  return (
    String(r.kategori ?? "") === "Pemasukan" &&
    String(r.pos ?? "").trim().toLowerCase() === "sewa kamar"
  );
}

/** Kunci perbandingan duplikat no nota (trim + huruf kecil). */
export function normalizeNotaKey(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Escape `%` dan `_` agar `ilike` di PostgREST setara dengan kesetaraan string (bukan pola). */
export function escapeIlikeExact(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

export function findFinanceRowWithDuplicateNota(
  rows: FinanceNotaCheckRow[],
  nota: string,
  excludeId: string | null,
  incoming?: FinanceNotaDuplicateIncoming | null
): FinanceNotaCheckRow | undefined {
  const key = normalizeNotaKey(nota);
  if (!key) return undefined;
  const excludeGid =
    excludeId == null ? null : rows.find((r) => r.id === excludeId)?.paymentSplitGroupId?.trim() || null;
  const incomingSplit = incoming ? isSewaSplitFamilyRow(incoming) : false;

  return rows.find((r) => {
    if (normalizeNotaKey(r.noNota) !== key) return false;
    if (excludeId && r.id === excludeId) return false;
    if (excludeGid && (r.paymentSplitGroupId ?? "").trim() === excludeGid) return false;
    // Input baru: satu nota fisik tidak boleh bentrok dengan baris mana pun.
    if (excludeId == null) return true;
    const rowSplit = isSewaSplitFamilyRow(r);
    if (incomingSplit && rowSplit) return false;
    return true;
  });
}

export function financeNotaTakenMessage(notaTrimmed: string): string {
  return `Nomor nota "${notaTrimmed}" sudah terpakai. Hapus transaksi lama atau gunakan nomor lain.`;
}
