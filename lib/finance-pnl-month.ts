import type { FinanceRow } from "@/components/finance-page-client";
import { loginDisplayPrimary, sanitizeLoginUsername } from "@/lib/internal-auth-email";

/** Login owner_beta: bulan P&L awal saat buka dashboard. */
export const OWNER_BETA_DEFAULT_PNL_MONTH = "2026-05";

/** YYYY-MM untuk agregasi P&L: `pelaporan_bulan` jika ada, selain itu dari `tanggal`. */
export function financeRowCalendarYm(f: FinanceRow): string {
  const pb = (f.pelaporanBulan ?? "").trim();
  if (pb.length >= 7) return pb.slice(0, 7);
  return (f.tanggal ?? "").trim().slice(0, 7);
}

export function defaultPnlCalendarYm(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Default bulan P&L owner per akun login (owner_beta → Mei 2026). */
export function resolveDefaultOwnerPnlMonth(profile?: {
  username?: string | null;
  email?: string | null;
} | null): string {
  const loginId = sanitizeLoginUsername(
    loginDisplayPrimary({ username: profile?.username, email: profile?.email })
  );
  if (loginId === "owner_beta") return OWNER_BETA_DEFAULT_PNL_MONTH;
  return defaultPnlCalendarYm();
}
