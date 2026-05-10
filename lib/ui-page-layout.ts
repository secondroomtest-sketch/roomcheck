/**
 * Token layout halaman (mobile-first) — satu bahasa visual antar Laporan, Master, Finance, Kamar, Profile.
 * Biru: section & field dashboard. Coklat (`*Warm*`): Finance (kost) & Profile — tetap pola tap 46px + font 16px di HP.
 */

export const pageSectionClass =
  "rounded-2xl border border-[#d8defc] bg-white/90 p-3.5 shadow-[0_1px_4px_-2px_rgba(47,74,157,0.14)] dark:border-[#424a80] dark:bg-[#1b1f3d]/95 dark:shadow-none sm:p-4 md:p-5";

/** Tab strip / toolbar ringkas */
export const pageTabStripClass =
  "rounded-2xl border border-[#d8defc] bg-white/90 p-3 shadow-[0_1px_4px_-2px_rgba(47,74,157,0.14)] dark:border-[#424a80] dark:bg-[#1b1f3d]/95 dark:shadow-none sm:p-4";

/** Blok utama “hero” (Finance, Kamar, Profile) */
export const pageHeroSectionClass =
  "rounded-2xl border border-[#d8defc] bg-white/90 p-4 shadow-[0_20px_50px_-35px_rgba(63,79,157,0.35)] dark:border-[#424a80] dark:bg-[#1b1f3d]/95 dark:shadow-none sm:rounded-[2rem] sm:p-6";

export const pageSectionTitleClass =
  "mb-3 text-[0.9375rem] font-semibold leading-snug tracking-tight text-[#1f1b42] sm:mb-4 sm:text-lg dark:text-[#dbe3ff]";

export const pageFieldClass =
  "min-h-[46px] w-full touch-manipulation rounded-xl border border-[#d6ddff] bg-[#f7f8ff] px-3.5 py-3 text-[16px] leading-normal outline-none transition focus:border-[#8ea2ff]/80 focus:ring-2 focus:ring-[#8ea2ff]/35 sm:min-h-[42px] sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm dark:border-[#424a80] dark:bg-[#1b1f3d]";

export const pageLabelClass =
  "mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-[#5d6fc0] sm:mb-1 sm:text-xs sm:tracking-[0.18em] dark:text-[#a8b5e8]";

/** Tema kost (coklat) — Finance, Profile, filter riwayat Finance. */
export const pageLabelWarmClass =
  "mb-1.5 block text-[11px] font-medium uppercase tracking-[0.16em] text-[#8b6d48] sm:mb-1 sm:text-xs sm:tracking-[0.18em] dark:text-[#cfb089]";

export const pageFieldWarmClass =
  "min-h-[46px] w-full touch-manipulation rounded-xl border border-[#dcc7aa] bg-[#fffdf9] px-3.5 py-3 text-[16px] leading-normal outline-none transition focus:border-[#c09c70] focus:ring-2 focus:ring-[#c09c70]/35 sm:min-h-[42px] sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm dark:border-[#4d3925] dark:bg-[#2b2016]";

export const pageTextareaWarmClass =
  "min-h-[7.25rem] w-full resize-y touch-manipulation rounded-xl border border-[#dcc7aa] bg-[#fffdf9] px-3.5 py-3 text-[16px] leading-normal outline-none transition focus:border-[#c09c70] focus:ring-2 focus:ring-[#c09c70]/35 sm:min-h-[6rem] sm:rounded-2xl sm:px-4 sm:py-2.5 sm:text-sm dark:border-[#4d3925] dark:bg-[#2b2016]";

/** Opsi radio / pill pilihan di form warm */
export const pageWarmChoiceClass =
  "inline-flex min-h-[46px] cursor-pointer items-center gap-2 rounded-xl border border-[#dcc7aa] bg-[#fffdf9] px-3.5 py-3 text-[15px] leading-normal touch-manipulation transition focus-within:ring-2 focus-within:ring-[#c09c70]/35 sm:min-h-0 sm:rounded-2xl sm:px-3 sm:py-2 sm:text-sm dark:border-[#4d3925] dark:bg-[#2b2016]";
