import Link from "next/link";

export default function Home() {
  return (
    <main className="safe-page-landing flex min-h-[100dvh] min-h-screen flex-col items-center justify-center gap-8 bg-[#f5f6ff] text-[#1f1b42]">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          RoomCheck
        </h1>
        <p className="mt-2 max-w-md text-sm text-[#5f72c2]">
          Kontrol aplikasi Anda — lanjut ke login atau langsung dashboard jika sudah
          masuk.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-4">
        <Link
          href="/login"
          className="rounded-2xl bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-6 py-3 text-sm font-medium text-[#eef3ff] shadow-[0_12px_30px_-18px_rgba(77,109,255,0.45)] transition hover:opacity-95"
        >
          Login
        </Link>
        <Link
          href="/dashboard"
          className="rounded-2xl border border-[#c8d3ff] bg-white px-6 py-3 text-sm font-medium text-[#3f4f9d] shadow-sm transition hover:bg-[#eef2ff]"
        >
          Dashboard
        </Link>
      </div>
    </main>
  );
}
