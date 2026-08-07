"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Camera, CheckCircle2, ImagePlus, Loader2, Upload } from "lucide-react";
import { BOOKING_MAX_FILE_BYTES, type BookingLokasiOption } from "@/lib/bookingkos";

type FormState = {
  namaLengkap: string;
  email: string;
  noWa: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  periodeSewa: string;
  tglCheckIn: string;
  keterangan: string;
};

const initialForm: FormState = {
  namaLengkap: "",
  email: "",
  noWa: "",
  lokasiKos: "",
  unitBlok: "",
  noKamar: "",
  periodeSewa: "12",
  tglCheckIn: "",
  keterangan: "",
};

const fieldClass =
  "w-full min-h-[48px] rounded-xl border border-[#c8d0f5] bg-white px-3.5 py-3 text-base text-[#1f1b42] outline-none transition focus:border-[#5b6dff] focus:ring-2 focus:ring-[#5b6dff]/25";

function filePreviewUrl(file: File | null): string | null {
  if (!file) return null;
  try {
    return URL.createObjectURL(file);
  } catch {
    return null;
  }
}

function PhotoField({
  id,
  label,
  hint,
  file,
  onChange,
  error,
  preferCamera = false,
}: {
  id: string;
  label: string;
  hint: string;
  file: File | null;
  onChange: (file: File | null) => void;
  error?: string;
  /** true = prefer kamera belakang (identitas); false = izinkan galeri juga (bukti transfer). */
  preferCamera?: boolean;
}) {
  const preview = useMemo(() => filePreviewUrl(file), [file]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-[#1f1b42]">
        {label} <span className="text-[#6d32ff]">*</span>
      </label>
      <p className="text-xs leading-relaxed text-[#5d6fc0]">{hint}</p>
      <label
        htmlFor={id}
        className={`group relative flex min-h-[180px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed transition active:scale-[0.99] sm:min-h-[160px] ${
          error
            ? "border-[#f0a090] bg-[#fff5f0]"
            : "border-[#b8c2f0] bg-[#f3f5ff] hover:border-[#5b6dff] hover:bg-[#eef1ff]"
        }`}
      >
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`Preview ${label}`} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#dde3ff] text-[#4d6dff]">
              <ImagePlus className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-[#1f1b42]">Ketuk untuk unggah / foto</span>
            <span className="text-xs text-[#6f7fc2]">JPG, PNG, WEBP, HEIC · max 5 MB</span>
          </div>
        )}
        {preview ? (
          <span className="absolute inset-x-0 bottom-0 truncate bg-[#1a1340]/72 px-3 py-2.5 text-center text-xs font-medium text-white backdrop-blur-sm">
            Ketuk untuk ganti · {file?.name}
          </span>
        ) : null}
        <input
          id={id}
          name={id}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
          {...(preferCamera ? { capture: "environment" as const } : {})}
          className="sr-only"
          onChange={(e) => {
            const next = e.target.files?.[0] ?? null;
            if (next && next.size > BOOKING_MAX_FILE_BYTES) {
              onChange(null);
              e.target.value = "";
              window.alert(`${label}: ukuran maksimal 5 MB.`);
              return;
            }
            onChange(next);
          }}
        />
      </label>
      {error ? <p className="text-xs font-medium text-[#c2410c]">{error}</p> : null}
    </div>
  );
}

export default function BookingkosPageClient() {
  const [form, setForm] = useState<FormState>(initialForm);
  const [lokasiOptions, setLokasiOptions] = useState<BookingLokasiOption[]>([]);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState("");
  const [fotoIdentitas, setFotoIdentitas] = useState<File | null>(null);
  const [buktiTransfer, setBuktiTransfer] = useState<File | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const unitOptions = useMemo(() => {
    const found = lokasiOptions.find((l) => l.namaLokasi === form.lokasiKos);
    return found?.unitBlok ?? [];
  }, [lokasiOptions, form.lokasiKos]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setOptionsLoading(true);
      setOptionsError("");
      try {
        const res = await fetch("/api/bookingkos/options");
        const json = (await res.json()) as { lokasi?: BookingLokasiOption[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Gagal memuat lokasi.");
        if (cancelled) return;
        const list = json.lokasi ?? [];
        setLokasiOptions(list);
        if (list[0]) {
          setForm((prev) => ({
            ...prev,
            lokasiKos: prev.lokasiKos || list[0].namaLokasi,
            unitBlok: prev.unitBlok || list[0].unitBlok[0] || "",
          }));
        }
      } catch (e) {
        if (!cancelled) {
          setOptionsError(e instanceof Error ? e.message : "Gagal memuat lokasi.");
        }
      } finally {
        if (!cancelled) setOptionsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setField = (key: keyof FormState, value: string) => {
    setForm((prev) => {
      if (key === "lokasiKos") {
        const units = lokasiOptions.find((l) => l.namaLokasi === value)?.unitBlok ?? [];
        return {
          ...prev,
          lokasiKos: value,
          unitBlok: units.includes(prev.unitBlok) ? prev.unitBlok : units[0] ?? "",
        };
      }
      return { ...prev, [key]: value };
    });
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const validateClient = (): boolean => {
    const next: Record<string, string> = {};
    if (!form.namaLengkap.trim()) next.namaLengkap = "Wajib diisi";
    const email = form.email.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) next.email = "Email tidak valid";
    const wa = form.noWa.replace(/\D/g, "");
    if (wa.length < 9 || wa.length > 15) next.noWa = "Nomor WhatsApp tidak valid";
    if (!form.lokasiKos) next.lokasiKos = "Pilih lokasi";
    if (!form.unitBlok) next.unitBlok = "Pilih unit/blok";
    const periode = Math.floor(Number(form.periodeSewa) || 0);
    if (periode < 1 || periode > 60) next.periodeSewa = "1–60 bulan";
    if (!form.tglCheckIn) next.tglCheckIn = "Wajib diisi";
    if (!fotoIdentitas) next.fotoIdentitas = "Foto identitas wajib";
    else if (fotoIdentitas.size > BOOKING_MAX_FILE_BYTES) next.fotoIdentitas = "Maksimal 5 MB";
    if (!buktiTransfer) next.buktiTransfer = "Bukti transfer wajib";
    else if (buktiTransfer.size > BOOKING_MAX_FILE_BYTES) next.buktiTransfer = "Maksimal 5 MB";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError("");
    setSuccessMessage("");
    if (!validateClient() || !fotoIdentitas || !buktiTransfer) return;

    setIsSubmitting(true);
    try {
      const body = new FormData();
      body.set("namaLengkap", form.namaLengkap.trim());
      body.set("email", form.email.trim());
      body.set("noWa", form.noWa.trim());
      body.set("lokasiKos", form.lokasiKos);
      body.set("unitBlok", form.unitBlok);
      body.set("noKamar", form.noKamar.trim());
      body.set("periodeSewa", form.periodeSewa);
      body.set("tglCheckIn", form.tglCheckIn);
      body.set("keterangan", form.keterangan.trim());
      body.set("fotoIdentitas", fotoIdentitas);
      body.set("buktiTransfer", buktiTransfer);

      const res = await fetch("/api/bookingkos/submit", { method: "POST", body });
      const json = (await res.json()) as { error?: string; message?: string };
      if (!res.ok) throw new Error(json.error || "Gagal mengirim booking.");

      setSuccessMessage(json.message || "Booking berhasil dikirim.");
      setForm(initialForm);
      setFotoIdentitas(null);
      setBuktiTransfer(null);
      if (lokasiOptions[0]) {
        setForm({
          ...initialForm,
          lokasiKos: lokasiOptions[0].namaLokasi,
          unitBlok: lokasiOptions[0].unitBlok[0] || "",
        });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Gagal mengirim booking.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="bookingkos-page relative min-h-[100dvh] overflow-x-hidden bg-[#1a1340] text-[#1f1b42]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(167,139,250,0.42),transparent_46%),radial-gradient(circle_at_88%_10%,rgba(77,109,255,0.38),transparent_42%),radial-gradient(circle_at_78%_78%,rgba(109,40,217,0.34),transparent_48%),radial-gradient(circle_at_18%_82%,rgba(59,130,246,0.26),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-75 [background:linear-gradient(148deg,rgba(26,19,64,0.55)_0%,rgba(76,29,149,0.38)_30%,rgba(37,99,235,0.28)_62%,rgba(109,40,217,0.42)_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.22] [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2280%22 height=%2280%22 viewBox=%220 0 80 80%22%3E%3Cg fill=%22none%22 stroke=%22%23ffffff%22 stroke-opacity=%220.14%22%3E%3Cpath d=%22M0 40h80M40 0v80%22/%3E%3C/g%3E%3C/svg%3E')]" />

      <div className="relative mx-auto w-full max-w-3xl px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] sm:px-6 sm:pt-14">
        <header className="bookingkos-enter space-y-4 text-center sm:space-y-5">
          <div className="mx-auto flex justify-center">
            <div className="bookingkos-logo-neon relative">
              <Image
                src="/second-room-logo.png"
                alt="Second Room"
                width={280}
                height={238}
                priority
                unoptimized
                className="relative z-[1] h-auto w-[168px] object-contain sm:w-[240px]"
              />
            </div>
          </div>
          <div className="px-1">
            <h1 className="text-lg font-semibold tracking-tight text-[#e8ecff] sm:text-2xl">
              Formulir booking Kos Granada
            </h1>
            <p className="mx-auto mt-2 max-w-xl text-[15px] font-bold italic leading-snug text-[#d4dcff] sm:text-lg sm:leading-relaxed">
              Selamat! Kamu orang cerdas yang memilih kos berkelas
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#c5ceff] sm:text-base">
              Silahkan isi data formulir di bawah ini, team kami akan menghubungi anda
            </p>
          </div>
        </header>

        {successMessage ? (
          <div className="bookingkos-enter mt-8 flex items-start gap-3 rounded-2xl border border-[#9dcbb8] bg-[#e8f7ef] px-4 py-4 text-sm text-[#1f4d3c]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Terima kasih!</p>
              <p className="mt-1 leading-relaxed">{successMessage}</p>
            </div>
          </div>
        ) : null}

        <form
          onSubmit={handleSubmit}
          className="bookingkos-enter-delay mt-6 space-y-6 rounded-[1.5rem] border border-[#d8defc]/90 bg-white/90 p-4 shadow-[0_28px_70px_-35px_rgba(40,30,120,0.55)] backdrop-blur-sm sm:mt-8 sm:rounded-[1.75rem] sm:p-8"
        >
          <section className="space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5d6fc0]">Data diri</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="namaLengkap" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  Nama lengkap <span className="text-[#6d32ff]">*</span>
                </label>
                <input
                  id="namaLengkap"
                  value={form.namaLengkap}
                  onChange={(e) => setField("namaLengkap", e.target.value)}
                  className={fieldClass}
                  autoComplete="name"
                  required
                />
                {fieldErrors.namaLengkap ? (
                  <p className="mt-1 text-xs font-medium text-[#c2410c]">{fieldErrors.namaLengkap}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  Email <span className="text-[#6d32ff]">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  placeholder="nama@email.com"
                  autoComplete="email"
                  inputMode="email"
                  className={fieldClass}
                  required
                />
                {fieldErrors.email ? (
                  <p className="mt-1 text-xs font-medium text-[#c2410c]">{fieldErrors.email}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="noWa" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  No. WhatsApp <span className="text-[#6d32ff]">*</span>
                </label>
                <input
                  id="noWa"
                  value={form.noWa}
                  onChange={(e) => setField("noWa", e.target.value)}
                  placeholder="08xxxxxxxxxx"
                  inputMode="tel"
                  className={fieldClass}
                  required
                />
                {fieldErrors.noWa ? (
                  <p className="mt-1 text-xs font-medium text-[#c2410c]">{fieldErrors.noWa}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-[#e2e7ff] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5d6fc0]">Hunian</h2>
            {optionsLoading ? (
              <p className="flex items-center gap-2 text-sm text-[#5d6fc0]">
                <Loader2 className="h-4 w-4 animate-spin" /> Memuat lokasi…
              </p>
            ) : null}
            {optionsError ? <p className="text-sm font-medium text-[#c2410c]">{optionsError}</p> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="lokasiKos" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  Lokasi kos <span className="text-[#6d32ff]">*</span>
                </label>
                <select
                  id="lokasiKos"
                  value={form.lokasiKos}
                  onChange={(e) => setField("lokasiKos", e.target.value)}
                  className={fieldClass}
                  required
                  disabled={!lokasiOptions.length}
                >
                  {!lokasiOptions.length ? <option value="">Tidak ada lokasi</option> : null}
                  {lokasiOptions.map((l) => (
                    <option key={l.namaLokasi} value={l.namaLokasi}>
                      {l.namaLokasi}
                    </option>
                  ))}
                </select>
                {fieldErrors.lokasiKos ? (
                  <p className="mt-1 text-xs font-medium text-[#c2410c]">{fieldErrors.lokasiKos}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="unitBlok" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  Unit / blok <span className="text-[#6d32ff]">*</span>
                </label>
                <select
                  id="unitBlok"
                  value={form.unitBlok}
                  onChange={(e) => setField("unitBlok", e.target.value)}
                  className={fieldClass}
                  required
                  disabled={!unitOptions.length}
                >
                  {!unitOptions.length ? <option value="">Pilih lokasi dulu</option> : null}
                  {unitOptions.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                {fieldErrors.unitBlok ? (
                  <p className="mt-1 text-xs font-medium text-[#c2410c]">{fieldErrors.unitBlok}</p>
                ) : null}
              </div>
              <div>
                <label htmlFor="noKamar" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  No. kamar <span className="font-normal text-[#8a96c9]">(opsional)</span>
                </label>
                <input
                  id="noKamar"
                  value={form.noKamar}
                  onChange={(e) => setField("noKamar", e.target.value)}
                  placeholder="Jika sudah ada preferensi"
                  className={fieldClass}
                />
              </div>
              <div>
                <label htmlFor="periodeSewa" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  Periode sewa (bulan) <span className="text-[#6d32ff]">*</span>
                </label>
                <input
                  id="periodeSewa"
                  type="number"
                  min={1}
                  max={60}
                  value={form.periodeSewa}
                  onChange={(e) => setField("periodeSewa", e.target.value)}
                  className={fieldClass}
                  required
                />
                {fieldErrors.periodeSewa ? (
                  <p className="mt-1 text-xs font-medium text-[#c2410c]">{fieldErrors.periodeSewa}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="tglCheckIn" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  Rencana check-in <span className="text-[#6d32ff]">*</span>
                </label>
                <input
                  id="tglCheckIn"
                  type="date"
                  value={form.tglCheckIn}
                  onChange={(e) => setField("tglCheckIn", e.target.value)}
                  className={fieldClass}
                  required
                />
                {fieldErrors.tglCheckIn ? (
                  <p className="mt-1 text-xs font-medium text-[#c2410c]">{fieldErrors.tglCheckIn}</p>
                ) : null}
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="keterangan" className="mb-1.5 block text-sm font-medium text-[#1f1b42]">
                  Keterangan <span className="font-normal text-[#8a96c9]">(opsional)</span>
                </label>
                <textarea
                  id="keterangan"
                  value={form.keterangan}
                  onChange={(e) => setField("keterangan", e.target.value)}
                  rows={3}
                  placeholder="Catatan tambahan untuk admin"
                  className={`${fieldClass} resize-y`}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-[#e2e7ff] pt-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-[#5d6fc0]">Dokumen</h2>
            <div className="rounded-2xl border border-[#c5ceff] bg-gradient-to-br from-[#eef1ff] to-[#f4ecff] px-4 py-4 text-sm text-[#1f1b42]">
              <p className="font-semibold text-[#3f2f8a]">Info transfer</p>
              <p className="mt-2 leading-relaxed text-[#3a3f6e]">
                Silahkan lakukan transfer ke nomor rekening dibawah ini :
              </p>
              <dl className="mt-3 space-y-1.5 text-[13px] leading-relaxed sm:text-sm">
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="shrink-0 font-medium text-[#5d6fc0]">Nama Rekening :</dt>
                  <dd className="font-semibold text-[#1f1b42]">PT. KELOLA KAMAR SOLUSINDO</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="shrink-0 font-medium text-[#5d6fc0]">Nama Bank :</dt>
                  <dd className="font-semibold text-[#1f1b42]">BANK MANDIRI</dd>
                </div>
                <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
                  <dt className="shrink-0 font-medium text-[#5d6fc0]">Nomor Rekening :</dt>
                  <dd className="font-semibold tracking-wide text-[#1f1b42]">13300 3508 0043</dd>
                </div>
              </dl>
            </div>
            <div className="grid gap-5">
              <PhotoField
                id="fotoIdentitas"
                label="Foto identitas"
                hint="KTP / identitas resmi yang masih berlaku. Bisa foto langsung atau pilih dari galeri."
                file={fotoIdentitas}
                onChange={setFotoIdentitas}
                error={fieldErrors.fotoIdentitas}
                preferCamera
              />
              <PhotoField
                id="buktiTransfer"
                label="Bukti transfer"
                hint="Screenshot atau foto bukti pembayaran booking fee."
                file={buktiTransfer}
                onChange={setBuktiTransfer}
                error={fieldErrors.buktiTransfer}
              />
            </div>
          </section>

          {submitError ? (
            <p className="rounded-xl border border-[#f0b4a0] bg-[#fff1eb] px-3 py-2 text-sm font-medium text-[#9a3412]">
              {submitError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting || optionsLoading || Boolean(optionsError)}
            className="btn-tactile group inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4d6dff] to-[#6d32ff] px-5 py-3.5 text-base font-semibold text-white transition hover:from-[#3f5ef0] hover:to-[#5c28e0] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Mengirim…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 transition group-hover:-translate-y-0.5" />
                Kirim booking
                <Camera className="h-4 w-4 opacity-80" />
              </>
            )}
          </button>
        </form>

        <p className="mt-8 text-center text-xs text-[#b8c2f0]">
          Data Anda hanya digunakan untuk proses booking Second Room.
        </p>
      </div>
    </main>
  );
}
