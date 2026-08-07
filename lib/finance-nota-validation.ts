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

/** Maksimal digit angka setelah prefiks SR. */
export const SR_NOTA_MAX_DIGITS = 4;

/** Ambil hanya angka setelah prefiks SR, dibatasi maksimal 4 digit. */
export function sanitizeSrNotaDigits(raw: string): string {
  return String(raw ?? "")
    .replace(/\D/g, "")
    .slice(0, SR_NOTA_MAX_DIGITS);
}

export function formatSrNotaFromDigits(digits: string): string {
  const d = sanitizeSrNotaDigits(digits);
  return d ? `SR${d}` : "";
}

export function isValidSrNotaDigits(digits: string): boolean {
  const d = sanitizeSrNotaDigits(digits);
  return d.length > 0 && d.length <= SR_NOTA_MAX_DIGITS;
}

export function srNotaDigitsInvalidMessage(): string {
  return `Nomor nota setelah SR maksimal ${SR_NOTA_MAX_DIGITS} digit angka.`;
}

type LastUsedSrNotaRow = { noNota?: string | null; no_nota?: string | null };

/** Nota SR dengan nilai numerik tertinggi dari daftar baris finance. */
export function findLastUsedSrNota(rows: LastUsedSrNotaRow[]): string | null {
  let bestNum = -1;
  let bestFormatted = "";
  for (const r of rows) {
    const raw = String(r.noNota ?? r.no_nota ?? "").trim();
    if (!/^sr/i.test(raw)) continue;
    const digits = sanitizeSrNotaDigits(raw.replace(/^sr/i, ""));
    if (!digits) continue;
    const n = Number.parseInt(digits, 10);
    if (!Number.isFinite(n)) continue;
    if (n > bestNum) {
      bestNum = n;
      bestFormatted = formatSrNotaFromDigits(digits);
    }
  }
  return bestFormatted || null;
}

const SR_NOTA_MAX_VALUE = 10 ** SR_NOTA_MAX_DIGITS - 1;

/**
 * Digit berikutnya setelah nota terakhir (tanpa prefiks SR).
 * Contoh: SR0026 → "0027". Jika belum ada → "0001".
 */
export function suggestNextSrNotaDigitsFromLast(lastUsed: string | null | undefined): string {
  const raw = String(lastUsed ?? "").trim();
  if (!raw || !/^sr/i.test(raw)) {
    return "0001";
  }
  const digits = sanitizeSrNotaDigits(raw.replace(/^sr/i, ""));
  if (!digits) return "0001";
  const current = Number.parseInt(digits, 10);
  if (!Number.isFinite(current) || current < 0) return "0001";
  const next = current + 1;
  if (next > SR_NOTA_MAX_VALUE) {
    return String(SR_NOTA_MAX_VALUE).padStart(SR_NOTA_MAX_DIGITS, "0");
  }
  const width = Math.min(SR_NOTA_MAX_DIGITS, Math.max(digits.length, 1));
  return String(next).padStart(width, "0");
}

/** Digit no. nota berikutnya dari daftar baris finance. */
export function suggestNextSrNotaDigits(rows: LastUsedSrNotaRow[]): string {
  return suggestNextSrNotaDigitsFromLast(findLastUsedSrNota(rows));
}
