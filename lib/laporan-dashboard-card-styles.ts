/** Warna kartu ringkasan (HTML inline + Tailwind di tab cetak) — urutan mengikuti `buildLaporanExportPayloadV1`. */
export const LAPORAN_CARD_SURFACE_CLASSES = [
  "border-[#93c5fd] bg-[#eff6ff]",
  "border-[#6ee7b7] bg-[#ecfdf5]",
  "border-[#fcd34d] bg-[#fffbeb]",
  "border-[#c4b5fd] bg-[#f5f3ff]",
  "border-[#d4b896] bg-[#fdf8f0]",
] as const;

/** Inline style untuk dokumen HTML unduhan (tanpa Tailwind). */
export const LAPORAN_CARD_SURFACE_STYLES_HTML = [
  "background:#eff6ff;border:1px solid #93c5fd;border-radius:12px;padding:12px 14px;flex:1 1 160px;min-width:140px;",
  "background:#ecfdf5;border:1px solid #6ee7b7;border-radius:12px;padding:12px 14px;flex:1 1 160px;min-width:140px;",
  "background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;padding:12px 14px;flex:1 1 160px;min-width:140px;",
  "background:#f5f3ff;border:1px solid #c4b5fd;border-radius:12px;padding:12px 14px;flex:1 1 160px;min-width:140px;",
  "background:#fdf8f0;border:1px solid #d4b896;border-radius:12px;padding:12px 14px;flex:1 1 160px;min-width:140px;",
] as const;
