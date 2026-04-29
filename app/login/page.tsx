"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../libsupabaseClient";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [credential, setCredential] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

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
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#1a1340] px-6 py-10 text-[#1f1b42]">
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
            Login menggunakan akun Supabase.
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
