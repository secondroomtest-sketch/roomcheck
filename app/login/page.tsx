"use client";

import { FormEvent, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../libsupabaseClient";
import { SB_KEY, readSandboxJson } from "@/lib/sandbox-storage";
import { writeDemoProfileSession } from "@/lib/demo-auth";

const DEMO_MODE_STORAGE_KEY = "secondroom_local_demo_mode";

export default function LoginPage() {
  const router = useRouter();
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [demoModeActive, setDemoModeActive] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refreshMode = () => {
      setDemoModeActive((window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) ?? "true") === "true");
    };
    refreshMode();
    window.addEventListener("storage", refreshMode);
    return () => window.removeEventListener("storage", refreshMode);
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const demoMode =
      typeof window !== "undefined"
        ? (window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) ?? "true") === "true"
        : true;
    if (demoMode) {
      const blob = readSandboxJson<{ usersData?: Array<Record<string, unknown>> } | null>(
        SB_KEY.master,
        null
      );
      const users = blob?.usersData ?? [];
      const hit = users.find((u) => String(u.email ?? "").trim().toLowerCase() === credential.trim().toLowerCase());
      if (!hit) {
        setErrorMessage("Akun demo tidak ditemukan di Master > User.");
        setIsSubmitting(false);
        return;
      }
      const storedPass = String(hit.demoPassword ?? "");
      if (!storedPass || storedPass !== password) {
        setErrorMessage("Password demo tidak cocok.");
        setIsSubmitting(false);
        return;
      }
      writeDemoProfileSession({
        id: String(hit.id ?? ""),
        nama: String(hit.nama ?? "User Demo"),
        email: String(hit.email ?? ""),
        role: (String(hit.role ?? "staff").toLowerCase() || "staff") as
          | "super_admin"
          | "owner"
          | "staff"
          | "supervisor"
          | "manager",
        aksesLokasi: Array.isArray(hit.aksesLokasi) ? hit.aksesLokasi.map(String) : [],
        aksesBlok: Array.isArray(hit.aksesBlok) ? hit.aksesBlok.map(String) : [],
      });
      router.push("/dashboard");
      router.refresh();
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: credential.trim(),
      password,
    });

    if (error) {
      setErrorMessage(error.message);
      setIsSubmitting(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#f5f6ff] px-6 py-10 text-[#1f1b42]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(77,109,255,0.2),transparent_42%),radial-gradient(circle_at_85%_10%,rgba(109,50,255,0.14),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(77,109,255,0.2),transparent_38%)]" />

      <section className="relative w-full max-w-md rounded-[2rem] border border-[#d8defc]/85 bg-white/85 p-8 shadow-[0_25px_80px_-35px_rgba(63,79,157,0.45)] backdrop-blur-sm sm:p-10">
        <div className="mb-10 space-y-5 text-center">
          <div className="mx-auto flex w-full flex-col items-center justify-center px-4 pt-1">
            <Image
              src="/roomcheck-logo-transparent.png"
              alt="RoomCheck logo"
              width={280}
              height={116}
              priority
              className="h-auto w-[220px] object-contain sm:w-[250px]"
            />
          </div>
          <div>
            <p className="text-[0.7rem] uppercase tracking-[0.35em] text-[#6f7fc2]">
              Second Room
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#1f1b42]">
              Welcome Back
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#5d6fc0]">
              Kelola Cerdas Kos Berkelas
            </p>
          </div>
        </div>

        <form className="space-y-6" onSubmit={handleLogin}>
          {demoModeActive ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Mode demo aktif: login menggunakan data user dari Master lokal (browser), bukan Supabase cloud.
            </p>
          ) : (
            <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Mode cloud aktif: login menggunakan akun Supabase.
            </p>
          )}
          <div className="space-y-2">
            <label
              htmlFor="credential"
              className="text-xs font-medium uppercase tracking-[0.2em] text-[#5d6fc0]"
            >
              Username / Email
            </label>
            <input
              id="credential"
              type="email"
              required
              placeholder="nama@email.com"
              value={credential}
              onChange={(event) => setCredential(event.target.value)}
              className="w-full rounded-2xl border border-[#d5ddff] bg-[#f8f9ff] px-4 py-3 text-sm text-[#1f1b42] outline-none ring-[#8ea2ff] transition focus:ring-2"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-xs font-medium uppercase tracking-[0.2em] text-[#5d6fc0]"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              placeholder="Masukkan password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-[#d5ddff] bg-[#f8f9ff] px-4 py-3 text-sm text-[#1f1b42] outline-none ring-[#8ea2ff] transition focus:ring-2"
            />
          </div>

          <div className="flex justify-end">
            <Link
              href="#"
              className="text-xs font-medium tracking-[0.15em] text-[#5d6fc0] underline decoration-[#9aaeff] underline-offset-4 transition hover:text-[#3f4f9d]"
            >
              Lupa Password
            </Link>
          </div>

          {errorMessage ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-full bg-gradient-to-r from-[#4d6dff] via-[#5e56ff] to-[#6d32ff] px-6 py-3 text-sm font-semibold tracking-[0.18em] text-[#eef3ff] shadow-[0_12px_35px_-15px_rgba(77,109,255,0.95)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Memproses..." : "Lihat Kos Saya"}
          </button>
        </form>
      </section>
    </main>
  );
}
