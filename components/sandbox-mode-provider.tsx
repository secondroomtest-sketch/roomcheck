"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "secondroom_local_demo_mode";

type SandboxModeContextValue = {
  /** true = input disimpan di browser saja, tidak ke Supabase */
  localDemoMode: boolean;
  setLocalDemoMode: (value: boolean) => void;
};

const SandboxModeContext = createContext<SandboxModeContextValue | null>(null);

export function SandboxModeProvider({ children }: { children: React.ReactNode }) {
  const [localDemoMode, setLocalDemoModeState] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const next = stored === null ? true : stored === "true";
    setLocalDemoModeState(next);
  }, []);

  const setLocalDemoMode = useCallback((value: boolean) => {
    setLocalDemoModeState(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(value));
    }
  }, []);

  const value = useMemo(
    () => ({
      localDemoMode,
      setLocalDemoMode,
    }),
    [localDemoMode, setLocalDemoMode]
  );

  return <SandboxModeContext.Provider value={value}>{children}</SandboxModeContext.Provider>;
}

export function useSandboxMode() {
  const ctx = useContext(SandboxModeContext);
  if (!ctx) {
    throw new Error("useSandboxMode must be used inside SandboxModeProvider");
  }
  return ctx;
}
