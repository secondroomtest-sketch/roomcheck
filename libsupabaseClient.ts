import type { SupabaseClient } from "@supabase/supabase-js";
import { getSharedSupabaseClient } from "@/lib/supabase-browser";

function missingEnvError(): Error {
  return new Error(
    "Supabase environment variables are missing. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

/**
 * Lazy proxy: client dibuat pada akses pertama (bukan saat import), agar route ringan tidak memicu auth recovery dulu.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getSharedSupabaseClient();
    if (!client) {
      throw missingEnvError();
    }
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(client) : value;
  },
});
