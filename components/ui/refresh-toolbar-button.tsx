"use client";

import { RefreshCcw } from "lucide-react";
import { iconTone } from "@/lib/ui-accent";

type RefreshToolbarButtonProps = {
  onRefresh: () => void | Promise<void>;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export default function RefreshToolbarButton({
  onRefresh,
  disabled = false,
  label = "Refresh",
  className = "",
}: RefreshToolbarButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onRefresh()}
      aria-label={label === "Refresh" ? "Muat ulang data" : label}
      className={`group relative z-[5] inline-flex items-center gap-2 rounded-full border border-[#c8d3ff] bg-[#f6f8ff] px-4 py-2 text-xs font-semibold tracking-[0.12em] text-[#3f4f9d] shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#9aaeff] hover:bg-[#eaf0ff] hover:text-[#2a3776] hover:shadow-md active:translate-y-0 disabled:pointer-events-none disabled:opacity-60 dark:border-[#3c4270] dark:bg-[#1a1f3a] dark:text-[#b9c7ff] dark:hover:border-[#697bc8] dark:hover:bg-[#232a4d] dark:hover:text-[#e2e8ff] ${className}`.trim()}
    >
      <RefreshCcw
        size={14}
        className={`shrink-0 transition-transform duration-500 ease-out group-hover:rotate-180 ${iconTone.info}`}
        aria-hidden
      />
      {label}
    </button>
  );
}
