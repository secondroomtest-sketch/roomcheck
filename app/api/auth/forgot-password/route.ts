import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { generateTemporaryPassword, sendForgotPasswordEmail } from "@/lib/send-forgot-password-email";

const SUCCESS_RESPONSE = NextResponse.json({
  ok: true,
  message: "Jika email terdaftar, password baru akan dikirim ke kotak masuk Anda.",
});

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Respons identik untuk menghindari enumerasi akun yang ada. */
export async function POST(request: Request) {
  let rawEmail = "";
  try {
    const body = (await request.json()) as { email?: unknown };
    rawEmail = normalizeEmail(body.email);
  } catch {
    return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
  }

  if (!rawEmail || !rawEmail.includes("@")) {
    return NextResponse.json({ error: "Mohon masukkan alamat email yang valid." }, { status: 400 });
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    return NextResponse.json(
      {
        error:
          "Pengiriman email belum dikonfigurasi (RESEND_API_KEY). Tambahkan di environment server. Lihat dokumentasi Resend atau hubungi pengelola aplikasi.",
      },
      { status: 503 }
    );
  }

  let admin;
  try {
    admin = createSupabaseAdmin();
  } catch {
    return NextResponse.json(
      {
        error: "Server tidak dapat memproses permintaan. Pastikan SUPABASE_SERVICE_ROLE_KEY tersedia.",
      },
      { status: 503 }
    );
  }

  const { data: profile, error: profileErr } = await admin
    .from("user_profiles")
    .select("id, email")
    .eq("email", rawEmail)
    .maybeSingle();

  if (profileErr || !profile?.id) {
    return SUCCESS_RESPONSE;
  }

  const userId = String((profile as { id: string }).id);

  const newPassword = generateTemporaryPassword();

  try {
    await sendForgotPasswordEmail(rawEmail, newPassword);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Gagal mengirim email.";
    console.warn("[forgot-password] kirim email gagal:", msg);
    return NextResponse.json(
      {
        error:
          "Gagal mengirim email untuk saat ini. Coba lagi nanti atau hubungi Super Admin (password Anda belum berubah).",
      },
      { status: 502 }
    );
  }

  const { error: authErr } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });

  if (authErr) {
    console.warn("[forgot-password] update auth gagal:", authErr.message);
    return NextResponse.json(
      {
        error: "Akun gagal diperbarui setelah pengiriman email; hubungi Super Admin atau coba lagi nanti.",
      },
      { status: 502 }
    );
  }

  const { error: logErr } = await admin.from("password_change_log").insert({
    subject_user_id: userId,
    actor_user_id: null,
    source: "forgot_email",
    detail:
      "Password baru digenerate secara otomatis dan dikirim ke email pemilik akun melalui Lupa Password.",
  });

  if (logErr) {
    console.warn("[password_change_log]", logErr.message);
  }

  return SUCCESS_RESPONSE;
}
