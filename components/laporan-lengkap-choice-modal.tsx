"use client";

import { Building2, X } from "lucide-react";
import type { LaporanFokusCetak } from "@/lib/laporan-cetak-filters";

export default function LaporanLengkapChoiceModal({
  open,
  busy,
  onClose,
  onPick,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onPick: (fokus: LaporanFokusCetak) => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[420] flex items-end justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[#121327]/50 backdrop-blur-[2px]"
        aria-label="Tutup dialog jenis laporan"
        disabled={busy}
        onClick={onClose}
      />
      <div
        className="relative z-[1] w-full max-w-md rounded-2xl border border-[#d6ddff] bg-[#f7f8ff] p-5 shadow-2xl dark:border-[#424a80] dark:bg-[#1b1f3d]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="laporan-choice-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              id="laporan-choice-title"
              className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#6374c9] dark:text-[#aab7f0]"
            >
              Laporkan seperti apa?
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[#1f1b42] dark:text-[#dbe3ff]">
              Tab baru akan terbuka. Pilih struktur neraca yang ingin Anda fokuskan (kamar kos vs bisnis manajemen).
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="shrink-0 rounded-full border border-transparent p-2 text-[#5261aa] hover:border-[#c9d6ff] hover:bg-[#eef2ff] disabled:opacity-60 dark:text-[#b8c7ff]"
            aria-label="Tutup"
          >
            <X size={18} aria-hidden />
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick("kos")}
            className="flex min-h-[5.75rem] flex-col items-start justify-between rounded-xl border border-[#b8c4ff] bg-white px-4 py-3.5 text-left text-sm transition hover:bg-[#f0f3ff] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#5560a8] dark:bg-[#232c58] dark:hover:bg-[#2b3668]"
          >
            <Building2 size={22} strokeWidth={1.85} className="text-[#245c3a]" aria-hidden />
            <span>
              <span className="block font-semibold text-[#16301f] dark:text-emerald-200">Laporan Kos</span>
              <span className="mt-1 block text-[11px] font-normal leading-snug text-[#5c6778] dark:text-[#aab7dc]">
                Sewa/booking dan pengeluaran operasional kost per filter saat ini
              </span>
            </span>
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick("manajemen")}
            className="flex min-h-[5.75rem] flex-col items-start justify-between rounded-xl border border-[#d4b8ff] bg-gradient-to-br from-[#f7f5ff] to-[#eef2ff] px-4 py-3.5 text-left text-sm transition hover:brightness-[1.02] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#5c4a8a] dark:from-[#2a2548] dark:to-[#252b58]"
          >
            <span
              className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-[#4d6dff] to-[#6d32ff]"
              aria-hidden
            >
              <span className="text-[10px] font-bold text-white">M</span>
            </span>
            <span>
              <span className="block font-semibold text-[#3b2f6b] dark:text-[#e4dcff]">Laporan Manajemen</span>
              <span className="mt-1 block text-[11px] font-normal leading-snug text-[#5f5c78] dark:text-[#bcb8e8]">
                Pemasukan di luar sewa kamar serta pengeluaran lingkup manajemen (IPL, fee, dll.)
              </span>
            </span>
          </button>
        </div>

        {busy ? (
          <p className="mt-4 flex items-center justify-center gap-2 text-center text-[12px] text-[#4f61aa] dark:text-[#c5d1ff]">
            <span
              className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#4d6dff]/40 border-t-[#6d32ff]"
              aria-hidden
            />
            Menyiapkan laporan…
          </p>
        ) : null}
      </div>
    </div>
  );
}
