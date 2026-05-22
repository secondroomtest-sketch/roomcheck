/** Pesan untuk error jaringan Supabase (fetch gagal / host tidak ada). */
export const SUPABASE_UNREACHABLE_MESSAGE =
  "Tidak dapat terhubung ke Supabase. Periksa NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local (harus dari Project Settings → API di dashboard Supabase), lalu restart dev server (npm run dev). Pastikan proyek Supabase aktif dan tidak dihapus.";

export function isSupabaseFetchFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
}

export function supabaseErrorMessageIndonesia(error: unknown, fallback?: string): string {
  if (isSupabaseFetchFailure(error)) return SUPABASE_UNREACHABLE_MESSAGE;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback ?? "Terjadi kesalahan saat menghubungi Supabase.";
}

/** Satu pengecekan health — gagal jika URL salah, proyek tidak ada, atau jaringan terblokir. */
export async function checkSupabaseReachable(): Promise<{ ok: true } | { ok: false; message: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return {
      ok: false,
      message:
        "Variabel Supabase belum diset. Tambahkan NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local, lalu jalankan ulang npm run dev.",
    };
  }
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      method: "GET",
      headers: { apikey: key },
    });
    if (!res.ok) {
      return {
        ok: false,
        message: `Supabase merespons error (${res.status}). Periksa URL proyek dan kunci anon di .env.local.`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: SUPABASE_UNREACHABLE_MESSAGE };
  }
}
