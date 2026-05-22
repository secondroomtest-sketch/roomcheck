import type { Session, User } from "@supabase/supabase-js";
import { getSharedSupabaseClient } from "@/lib/supabase-browser";
import { isSupabaseFetchFailure } from "@/lib/supabase-connectivity";

/** Hindari panggilan auth ganda saat banyak useEffect jalan bersamaan. */
let sessionInflight: Promise<Session | null> | null = null;
let userInflight: Promise<User | null> | null = null;

export async function getSupabaseSessionSafe(): Promise<Session | null> {
  const client = getSharedSupabaseClient();
  if (!client) return null;
  if (!sessionInflight) {
    sessionInflight = client.auth
      .getSession()
      .then(({ data }) => data.session ?? null)
      .catch((e) => {
        if (!isSupabaseFetchFailure(e)) throw e;
        return null;
      })
      .finally(() => {
        sessionInflight = null;
      });
  }
  return sessionInflight;
}

export async function getSupabaseUserSafe(): Promise<User | null> {
  const client = getSharedSupabaseClient();
  if (!client) return null;
  if (!userInflight) {
    userInflight = client.auth
      .getUser()
      .then(({ data }) => data.user ?? null)
      .catch((e) => {
        if (!isSupabaseFetchFailure(e)) throw e;
        return null;
      })
      .finally(() => {
        userInflight = null;
      });
  }
  return userInflight;
}

export async function refreshSupabaseSessionSafe(): Promise<Session | null> {
  const client = getSharedSupabaseClient();
  if (!client) return null;
  try {
    const { data, error } = await client.auth.refreshSession();
    if (error) return (await getSupabaseSessionSafe()) ?? null;
    return data.session ?? null;
  } catch (e) {
    if (isSupabaseFetchFailure(e)) return null;
    throw e;
  }
}
