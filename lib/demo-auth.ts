"use client";

import { SB_KEY, readSandboxJson, writeSandboxJson } from "@/lib/sandbox-storage";

export type DemoProfileSession = {
  id: string;
  nama: string;
  email: string;
  role: "super_admin" | "owner" | "staff" | "supervisor" | "manager";
  aksesLokasi: string[];
  aksesBlok: string[];
};

export function readDemoProfileSession(): DemoProfileSession | null {
  const raw = readSandboxJson<Partial<DemoProfileSession> | null>(SB_KEY.profile, null);
  if (!raw?.id) return null;
  const role = String(raw.role ?? "staff").toLowerCase();
  const allowed = new Set(["super_admin", "owner", "staff", "supervisor", "manager"]);
  return {
    id: String(raw.id),
    nama: String(raw.nama ?? "").trim() || "User Demo",
    email: String(raw.email ?? "").trim(),
    role: (allowed.has(role) ? role : "staff") as DemoProfileSession["role"],
    aksesLokasi: Array.isArray(raw.aksesLokasi) ? raw.aksesLokasi.map(String) : [],
    aksesBlok: Array.isArray(raw.aksesBlok) ? raw.aksesBlok.map(String) : [],
  };
}

export function writeDemoProfileSession(session: DemoProfileSession | null): void {
  if (session) {
    writeSandboxJson(SB_KEY.profile, session);
    return;
  }
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(SB_KEY.profile);
    window.dispatchEvent(new CustomEvent("secondroom-sandbox-updated", { detail: { key: SB_KEY.profile } }));
  }
}
