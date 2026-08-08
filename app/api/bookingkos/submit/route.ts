import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  BOOKING_ALLOWED_MIME,
  BOOKING_MAX_FILE_BYTES,
  BOOKING_SOURCE_PUBLIC,
  BOOKING_UPLOADS_BUCKET,
  bookingFileExtension,
  isValidEmail,
  isValidWaDigits,
  normalizeEmail,
  normalizeWaDigits,
  todayIsoDateLocal,
} from "@/lib/bookingkos";

export const runtime = "nodejs";

function textField(form: FormData, key: string): string {
  return String(form.get(key) ?? "").trim();
}

function asFile(value: FormDataEntryValue | null): File | null {
  if (!value || typeof value === "string") return null;
  if (!(value instanceof File)) return null;
  if (!value.size) return null;
  return value;
}

function validateImageFile(file: File, label: string): string | null {
  const mime = (file.type || "").toLowerCase();
  if (!BOOKING_ALLOWED_MIME.has(mime)) {
    return `${label}: format tidak didukung. Gunakan JPG, PNG, WEBP, atau HEIC.`;
  }
  if (file.size > BOOKING_MAX_FILE_BYTES) {
    return `${label}: ukuran maksimal 5 MB.`;
  }
  return null;
}

async function uploadBookingImage(
  admin: ReturnType<typeof createSupabaseAdmin>,
  file: File,
  kind: "identitas" | "transfer"
): Promise<{ path: string } | { error: string }> {
  const mime = (file.type || "image/jpeg").toLowerCase();
  const ext = bookingFileExtension(mime, file.name);
  const day = todayIsoDateLocal();
  const path = `booking/${day}/${randomUUID()}-${kind}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error } = await admin.storage.from(BOOKING_UPLOADS_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (error) {
    return { error: `Gagal mengunggah ${kind === "identitas" ? "foto identitas" : "bukti transfer"}: ${error.message}` };
  }
  return { path };
}

async function removeUploaded(admin: ReturnType<typeof createSupabaseAdmin>, paths: string[]) {
  const clean = paths.filter(Boolean);
  if (!clean.length) return;
  await admin.storage.from(BOOKING_UPLOADS_BUCKET).remove(clean);
}

export async function POST(request: Request) {
  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Server belum siap. Pastikan SUPABASE_SERVICE_ROLE_KEY tersedia." },
      { status: 503 }
    );
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Body form tidak valid." }, { status: 400 });
  }

  const namaLengkap = textField(form, "namaLengkap");
  const emailRaw = textField(form, "email");
  const noWaRaw = textField(form, "noWa");
  const lokasiKos = textField(form, "lokasiKos");
  const unitBlok = textField(form, "unitBlok");
  const noKamar = textField(form, "noKamar");
  const periodeSewaRaw = textField(form, "periodeSewa");
  const tglCheckIn = textField(form, "tglCheckIn");
  const keterangan = textField(form, "keterangan");

  const fotoIdentitas = asFile(form.get("fotoIdentitas"));
  const buktiTransfer = asFile(form.get("buktiTransfer"));

  if (!namaLengkap) {
    return NextResponse.json({ error: "Nama lengkap wajib diisi." }, { status: 400 });
  }

  const email = normalizeEmail(emailRaw);
  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Email tidak valid." }, { status: 400 });
  }

  const noWaDigits = normalizeWaDigits(noWaRaw);
  if (!isValidWaDigits(noWaDigits)) {
    return NextResponse.json({ error: "Nomor WhatsApp tidak valid." }, { status: 400 });
  }

  if (!lokasiKos || !unitBlok) {
    return NextResponse.json({ error: "Lokasi kos dan unit/blok wajib dipilih." }, { status: 400 });
  }

  const periodeSewa = Math.max(1, Math.floor(Number(periodeSewaRaw) || 0));
  if (!Number.isFinite(periodeSewa) || periodeSewa < 1 || periodeSewa > 60) {
    return NextResponse.json({ error: "Periode sewa harus antara 1–60 bulan." }, { status: 400 });
  }

  if (!tglCheckIn || !/^\d{4}-\d{2}-\d{2}$/.test(tglCheckIn)) {
    return NextResponse.json({ error: "Rencana tanggal check-in wajib diisi." }, { status: 400 });
  }

  if (!fotoIdentitas) {
    return NextResponse.json({ error: "Foto identitas wajib diunggah." }, { status: 400 });
  }
  if (!buktiTransfer) {
    return NextResponse.json({ error: "Bukti transfer wajib diunggah." }, { status: 400 });
  }

  const idErr = validateImageFile(fotoIdentitas, "Foto identitas");
  if (idErr) return NextResponse.json({ error: idErr }, { status: 400 });
  const tfErr = validateImageFile(buktiTransfer, "Bukti transfer");
  if (tfErr) return NextResponse.json({ error: tfErr }, { status: 400 });

  const [{ data: lokasiRows, error: lokasiErr }, { data: blokRows, error: blokErr }] =
    await Promise.all([
      admin.from("master_lokasi").select("id, nama_lokasi"),
      admin.from("master_blok").select("lokasi_id, nama_blok"),
    ]);

  if (lokasiErr || blokErr) {
    return NextResponse.json(
      { error: lokasiErr?.message || blokErr?.message || "Gagal memvalidasi lokasi." },
      { status: 500 }
    );
  }

  const lokasiMatch = (lokasiRows ?? []).find(
    (r) =>
      String((r as { nama_lokasi?: unknown }).nama_lokasi ?? "")
        .trim()
        .toLowerCase() === lokasiKos.toLowerCase()
  );
  if (!lokasiMatch) {
    return NextResponse.json({ error: "Lokasi kos tidak ditemukan." }, { status: 400 });
  }

  const lokasiId = String((lokasiMatch as { id?: unknown }).id ?? "");
  const unitOk = (blokRows ?? []).some(
    (r) =>
      String((r as { lokasi_id?: unknown }).lokasi_id ?? "") === lokasiId &&
      String((r as { nama_blok?: unknown }).nama_blok ?? "")
        .trim()
        .toLowerCase() === unitBlok.toLowerCase()
  );
  if (!unitOk) {
    return NextResponse.json({ error: "Unit/blok tidak cocok dengan lokasi yang dipilih." }, { status: 400 });
  }

  const uploadedPaths: string[] = [];

  const idUpload = await uploadBookingImage(admin, fotoIdentitas, "identitas");
  if ("error" in idUpload) {
    return NextResponse.json({ error: idUpload.error }, { status: 500 });
  }
  uploadedPaths.push(idUpload.path);

  const tfUpload = await uploadBookingImage(admin, buktiTransfer, "transfer");
  if ("error" in tfUpload) {
    await removeUploaded(admin, uploadedPaths);
    return NextResponse.json({ error: tfUpload.error }, { status: 500 });
  }
  uploadedPaths.push(tfUpload.path);

  const lokasiCanonical = String((lokasiMatch as { nama_lokasi?: unknown }).nama_lokasi ?? lokasiKos).trim();
  const noteBits = [
    "Diajukan via form publik /bookingkos",
    keterangan ? `Catatan: ${keterangan}` : "",
  ].filter(Boolean);

  const payload = {
    nama_lengkap: namaLengkap,
    lokasi_kos: lokasiCanonical,
    unit_blok: unitBlok,
    no_kamar: noKamar || "-",
    periode_sewa_bulan: periodeSewa,
    tgl_check_in: tglCheckIn,
    tgl_check_out: null,
    sewa_cycle_start: null,
    sewa_cycle_end: null,
    harga_bulanan: 0,
    booking_fee: 0,
    deposit_kamar: 0,
    no_wa: noWaDigits,
    email,
    status: "Booking",
    keterangan: noteBits.join(" · "),
    sewa_kamar_paid: false,
    sewa_kamar_nota: null,
    booking_fee_paid: false,
    booking_fee_nota: null,
    deposit_kamar_paid: false,
    deposit_kamar_nota: null,
    foto_identitas_path: idUpload.path,
    bukti_transfer_path: tfUpload.path,
    booking_source: BOOKING_SOURCE_PUBLIC,
  };

  const { data: inserted, error: insertErr } = await admin
    .from("penghuni")
    .insert(payload)
    .select("id")
    .maybeSingle();

  if (insertErr) {
    await removeUploaded(admin, uploadedPaths);
    return NextResponse.json(
      { error: insertErr.message || "Gagal menyimpan data booking." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    id: inserted?.id ?? null,
    message: "Booking berhasil dikirim. Tim Second Room akan menghubungi Anda via WhatsApp.",
  });
}
