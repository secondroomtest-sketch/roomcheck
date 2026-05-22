import { processLock } from "@supabase/auth-js";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

/**
 * Satu instance untuk seluruh app. Lazy: tidak ada `createClient` saat parse modul.
 *
 * Auth memakai processLock (antrian dalam tab) — menghindari error Web Locks
 * "another request stole it" saat banyak getSession/getUser/refreshSession paralel.
 */
export function getSharedSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) {
    return cached;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: {
      lock: processLock,
    },
  });
  return cached;
}

/** Untuk halaman login: jangan bikin client saat bundle di-eval di lingkungan tanpa window. */
export function getBrowserSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") {
    return null;
  }
  return getSharedSupabaseClient();
}
