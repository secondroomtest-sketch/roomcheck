import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import type { BookingLokasiOption } from "@/lib/bookingkos";

/** Daftar lokasi + blok untuk dropdown form publik (via service role, lewati RLS). */
export async function GET() {
  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return NextResponse.json(
      { error: "Server belum siap. Pastikan SUPABASE_SERVICE_ROLE_KEY tersedia." },
      { status: 503 }
    );
  }

  const [{ data: lokasiData, error: lokasiErr }, { data: blokData, error: blokErr }] =
    await Promise.all([
      admin.from("master_lokasi").select("id, nama_lokasi").order("nama_lokasi", { ascending: true }),
      admin.from("master_blok").select("lokasi_id, nama_blok").order("nama_blok", { ascending: true }),
    ]);

  if (lokasiErr || blokErr) {
    return NextResponse.json(
      { error: lokasiErr?.message || blokErr?.message || "Gagal memuat master lokasi." },
      { status: 500 }
    );
  }

  const blokByLokasiId = new Map<string, string[]>();
  for (const row of blokData ?? []) {
    const lokasiId = String((row as { lokasi_id?: unknown }).lokasi_id ?? "");
    const namaBlok = String((row as { nama_blok?: unknown }).nama_blok ?? "").trim();
    if (!lokasiId || !namaBlok) continue;
    const list = blokByLokasiId.get(lokasiId) ?? [];
    if (!list.includes(namaBlok)) list.push(namaBlok);
    blokByLokasiId.set(lokasiId, list);
  }

  const lokasi: BookingLokasiOption[] = (lokasiData ?? [])
    .map((row) => {
      const id = String((row as { id?: unknown }).id ?? "");
      const namaLokasi = String((row as { nama_lokasi?: unknown }).nama_lokasi ?? "").trim();
      return {
        namaLokasi,
        unitBlok: blokByLokasiId.get(id) ?? [],
      };
    })
    .filter((item) => item.namaLokasi.length > 0);

  return NextResponse.json({ lokasi });
}
