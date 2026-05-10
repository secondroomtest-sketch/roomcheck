/**
 * Normalisasi bulan laporan (YYYY-MM-DD) dari baris finance Supabase.
 * Jika kolom `pelaporan_bulan` belum ada di DB, pakai tanggal transaksi.
 */
export function pelaporanBulanIsoFromDbRecord(rec: Record<string, unknown>): string | undefined {
  const pb = rec.pelaporan_bulan;
  let raw = "";
  if (typeof pb === "string") raw = pb.trim().slice(0, 10);
  else if (pb && typeof pb === "object" && "toISOString" in (pb as Date))
    raw = (pb as Date).toISOString().slice(0, 10);
  else if (pb != null) raw = String(pb).trim().slice(0, 10);

  const fromCol = normalizeYmOrYmd(raw);
  if (fromCol) return fromCol;

  const tglRaw = String(rec.tanggal ?? "").trim().slice(0, 10);
  return normalizeYmOrYmd(tglRaw);
}

function normalizeYmOrYmd(s: string): string | undefined {
  const t = s.trim();
  if (t.length >= 10) return t.slice(0, 10);
  if (t.length === 7) return `${t}-01`;
  return undefined;
}
