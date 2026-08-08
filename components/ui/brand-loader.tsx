"use client";

import Image from "next/image";

type BrandLoaderSize = "sm" | "md" | "lg";

type BrandLoaderProps = {
  /** Teks di bawah logo, mis. "Memuat…" */
  label?: string;
  size?: BrandLoaderSize;
  /** inline = tanpa kartu; card = kartu lembut; overlay = fullscreen dim */
  variant?: "inline" | "card" | "overlay";
  className?: string;
};

const SIZE: Record<
  BrandLoaderSize,
  { wrap: string; mark: string; ring: string; px: number; label: string }
> = {
  sm: {
    wrap: "h-14 w-14",
    mark: "h-9 w-9",
    ring: "inset-[-4px]",
    px: 36,
    label: "text-[11px]",
  },
  md: {
    wrap: "h-20 w-20",
    mark: "h-12 w-12",
    ring: "inset-[-6px]",
    px: 48,
    label: "text-xs",
  },
  lg: {
    wrap: "h-28 w-28",
    mark: "h-[4.5rem] w-[4.5rem]",
    ring: "inset-[-8px]",
    px: 72,
    label: "text-sm",
  },
};

/**
 * Loading branded Second Room: logo bernapas + cincin lembut.
 */
export default function BrandLoader({
  label = "Memuat…",
  size = "md",
  variant = "inline",
  className = "",
}: BrandLoaderProps) {
  const s = SIZE[size];

  const core = (
    <div className={`flex flex-col items-center justify-center gap-3 ${className}`.trim()}>
      <div className={`brand-loader relative ${s.wrap}`} role="presentation">
        <span className={`brand-loader-ring brand-loader-ring--a absolute rounded-full ${s.ring}`} aria-hidden />
        <span className={`brand-loader-ring brand-loader-ring--b absolute rounded-full ${s.ring}`} aria-hidden />
        <div className="brand-loader-mark absolute inset-0 flex items-center justify-center">
          <div className={`relative ${s.mark}`}>
            <Image
              src="/second-room-loader-logo.png"
              alt=""
              width={s.px}
              height={s.px}
              className="h-full w-full object-contain"
              priority
            />
          </div>
        </div>
      </div>
      {label ? (
        <p
          className={`${s.label} font-semibold tracking-[0.04em] text-[#3f4f9d] dark:text-[#d6ddff]`}
        >
          {label}
        </p>
      ) : null}
    </div>
  );

  if (variant === "overlay") {
    return (
      <div
        className="fixed inset-0 z-[388] flex flex-col items-center justify-center bg-[#0f1020]/45 backdrop-blur-[2px] dark:bg-black/55"
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={label || "Memuat"}
      >
        <div className="flex flex-col items-center rounded-3xl border border-white/25 bg-white/92 px-9 py-8 shadow-xl dark:border-white/10 dark:bg-[#1c1f3a]/92">
          {core}
        </div>
      </div>
    );
  }

  if (variant === "card") {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-3xl border border-white/25 bg-white/92 px-8 py-7 shadow-xl dark:border-white/10 dark:bg-[#1c1f3a]/90"
        role="status"
        aria-busy="true"
        aria-live="polite"
        aria-label={label || "Memuat"}
      >
        {core}
      </div>
    );
  }

  return (
    <div role="status" aria-busy="true" aria-live="polite" aria-label={label || "Memuat"}>
      {core}
    </div>
  );
}
