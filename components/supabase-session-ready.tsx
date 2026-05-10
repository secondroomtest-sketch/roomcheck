"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getSharedSupabaseClient } from "@/lib/supabase-browser";

const ReadyContext = createContext(false);

/** true setelah JWT restore dari storage pertama kali atau event auth berubah. */
export function SupabaseSessionHydratedProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const client = getSharedSupabaseClient();
    if (!client) {
      setReady(true);
      return;
    }
    let active = true;
    void client.auth.getSession().then(() => {
      if (active) setReady(true);
    });
    const { data: sub } = client.auth.onAuthStateChange(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return <ReadyContext.Provider value={ready}>{children}</ReadyContext.Provider>;
}

/** Refetch pemakaian fetch cloud setelah satu tick auth benar‑benar terpasang. */
export function useSupabaseSessionHydrated(): boolean {
  return useContext(ReadyContext);
}
