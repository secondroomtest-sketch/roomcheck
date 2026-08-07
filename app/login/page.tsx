"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { credentialToSupabaseLoginEmail } from "@/lib/internal-auth-email";
import { supabaseErrorMessageIndonesia } from "@/lib/supabase-connectivity";
import { ChevronDown, ChevronUp, Eye, EyeOff, MessageCircle } from "lucide-react";

/** 081338387417 → format wa.me (tanpa +) */
const WHATSAPP_ADMIN_WA_ME = "6281338387417";

function buildPasswordRequestWhatsAppUrl(loginHint: string): string {
  const hint = loginHint.trim();
  const text = hint
    ? `Halo Admin, saya lupa password untuk akun: ${hint}. Mohon bantu memberikan informasi password. Terima kasih.`
    : `Halo Admin, saya lupa password. Mohon bantu memberikan informasi password. Terima kasih.`;
  return `https://wa.me/${WHATSAPP_ADMIN_WA_ME}?text=${encodeURIComponent(text)}`;
}

export default function LoginPage() {
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [showForgotPanel, setShowForgotPanel] = useState(false);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    const supabase = getBrowserSupabase();
    if (!supabase) {
      setErrorMessage(
        "Konfigurasi Supabase tidak lengkap. Pasang NEXT_PUBLIC_SUPABASE_URL dan NEXT_PUBLIC_SUPABASE_ANON_KEY di .env.local lalu jalankan ulang dev server.",
      );
      setIsSubmitting(false);
      return;
    }

    let error: Error | { message: string } | null = null;
    try {
      const out = await supabase.auth.signInWithPassword({
        email: credentialToSupabaseLoginEmail(credential),
        password,
      });
      error = out.error;
    } catch (e) {
      error = { message: supabaseErrorMessageIndonesia(e, "Login gagal.") };
    }

    if (error) {
      setErrorMessage("message" in error ? error.message : "Login gagal.");
      setIsSubmitting(false);
      return;
    }

    // Hard navigation: menghindari client transition yang macet jika kompilasi route berat/Turbopack error.
    window.location.assign("/dashboard");
  };

  const openPasswordRequestWhatsApp = () => {
    const url = buildPasswordRequestWhatsAppUrl(credential);
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <main className="safe-page-auth relative flex min-h-[100dvh] min-h-screen items-center justify-center overflow-hidden bg-[#1a1340] text-[#1f1b42]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_18%,rgba(167,139,250,0.38),transparent_46%),radial-gradient(circle_at_88%_12%,rgba(59,130,246,0.3),transparent_42%),radial-gradient(circle_at_76%_82%,rgba(109,40,217,0.32),transparent_48%),radial-gradient(circle_at_24%_78%,rgba(37,99,235,0.22),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-70 [background:linear-gradient(125deg,rgba(30,27,75,0.5)_0%,rgba(76,29,149,0.35)_28%,rgba(30,64,175,0.28)_58%,rgba(109,40,217,0.4)_100%)]" />

      <section className="relative w-full max-w-md rounded-[2rem] border border-[#d8defc]/85 bg-white/85 p-8 shadow-[0_25px_80px_-35px_rgba(63,79,157,0.45)] backdrop-blur-sm sm:p-10">
        <div className="mb-10 space-y-5 text-center">
          <div className="mx-auto flex w-full flex-col items-center justify-center px-4 pt-1">
            <Image
              src="/roomcheck-logo-transparent.png"
              alt="RoomCheck logo"
              width={280}
              height={116}
              priority
              unoptimized
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
          <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
            Silahkan login dengan akun anda.
          </p>
          <div className="space-y-2">
            <label
              htmlFor="credential"
              className="text-xs font-medium uppercase tracking-[0.2em] text-[#5d6fc0]"
            >
              Username / Email
            </label>
            <input
              id="credential"
              type="text"
              required
              autoComplete="username"
              placeholder="username_anda"
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
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                placeholder="Masukkan password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[#d5ddff] bg-[#f8f9ff] px-4 py-3 pr-11 text-sm text-[#1f1b42] outline-none ring-[#8ea2ff] transition focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#5d6fc0] transition hover:bg-[#e9eeff] hover:text-[#3f4f9d]"
                aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-flat inline-flex items-center gap-1 text-xs font-medium tracking-[0.15em] text-[#5d6fc0] underline decoration-[#9aaeff] underline-offset-4 transition hover:text-[#3f4f9d]"
              aria-expanded={showForgotPanel}
              onClick={() => setShowForgotPanel((p) => !p)}
            >
              Lupa Password
              {showForgotPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showForgotPanel ? (
            <div className="rounded-2xl border border-[#c8d3ff] bg-[#f4f7ff]/90 p-4 dark:border-[#424a80] dark:bg-[#1b1f3d]/80">
              <p className="mb-4 text-sm leading-relaxed text-[#1f1b42] dark:text-[#e2e8ff]">
                Untuk mengetahui password anda, silahkan klik tombol di bawah, anda akan diberikan informasi
                password anda melalui whatsapp
              </p>
              <button
                type="button"
                onClick={openPasswordRequestWhatsApp}
                className="btn-tactile inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(37,211,102,0.65)] transition hover:bg-[#20bd5a] focus:outline-none focus:ring-2 focus:ring-[#128C7E] focus:ring-offset-2"
              >
                <MessageCircle size={20} className="shrink-0" aria-hidden />
                Request Password via WhatsApp
              </button>
              {credential.trim() ? (
                <p className="mt-3 text-[0.65rem] leading-relaxed text-[#6f7dc2]">
                  Pesan WhatsApp akan menyertakan username/email yang Anda ketik di kolom login di atas.
                </p>
              ) : (
                <p className="mt-3 text-[0.65rem] leading-relaxed text-[#6f7dc2]">
                  Opsional: isi username atau email di kolom login agar admin tahu akun mana yang dimaksud.
                </p>
              )}
            </div>
          ) : null}

          {errorMessage ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="btn-tactile w-full rounded-full bg-gradient-to-r from-[#4d6dff] via-[#5e56ff] to-[#6d32ff] px-6 py-3 text-sm font-semibold tracking-[0.18em] text-[#eef3ff] shadow-[0_12px_35px_-15px_rgba(77,109,255,0.95)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Memproses..." : "Lihat Kos Saya"}
          </button>
        </form>
      </section>
    </main>
  );
}
