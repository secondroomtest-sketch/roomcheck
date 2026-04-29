/** Baris yang punya `id` + `noNota` (mis. FinanceRow). */
export type FinanceNotaRow = { id: string; noNota: string };

/** Untuk cek duplikat: baris pecahan sewa boleh nota sama jika `paymentSplitGroupId` sama. */
export type FinanceNotaCheckRow = FinanceNotaRow & { paymentSplitGroupId?: string };

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
  excludeId: string | null
): FinanceNotaCheckRow | undefined {
  const key = normalizeNotaKey(nota);
  if (!key) return undefined;
  const excludeGid =
    excludeId == null ? null : rows.find((r) => r.id === excludeId)?.paymentSplitGroupId?.trim() || null;
  return rows.find((r) => {
    if (normalizeNotaKey(r.noNota) !== key) return false;
    if (excludeId && r.id === excludeId) return false;
    if (excludeGid && (r.paymentSplitGroupId ?? "").trim() === excludeGid) return false;
    return true;
  });
}

export function financeNotaTakenMessage(notaTrimmed: string): string {
  return `Nomor nota "${notaTrimmed}" sudah terpakai. Hapus transaksi lama atau gunakan nomor lain.`;
}
