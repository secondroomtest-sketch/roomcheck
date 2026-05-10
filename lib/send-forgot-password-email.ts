/** Kirim password sementara lewat Resend — butuh RESEND_API_KEY di environment server. */

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Password acak untuk login; distribusi seragam atas alfabet pendek aman pragmatis untuk akun aplikasi internal. */
export function generateTemporaryPassword(length = 14): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export async function sendForgotPasswordEmail(
  to: string,
  temporaryPassword: string
): Promise<void> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.RESEND_FROM_EMAIL?.trim() ||
    process.env.SECONDROOM_MAIL_FROM?.trim() ||
    "";

  if (!key) {
    throw new Error("RESEND_API_KEY belum diset untuk mengirim email.");
  }

  const safeTo = escapeHtml(to);
  const safePw = escapeHtml(temporaryPassword);
  const fromHeader =
    from || "RoomCheck Login <onboarding@resend.dev>";

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromHeader,
      to: [to],
      subject: "Password masuk aplikasi Anda",
      html: `<div style="font-family:system-ui,sans-serif;line-height:1.5;max-width:480px;">
  <p>Halo,</p>
  <p>Anda meminta kata sandi lewat tautan &quot;Lupa Password&quot;. Gunakan kata sandi sementara di bawah ini untuk login:</p>
  <p style="font-size:1.1rem;font-weight:700;background:#f4f7ff;padding:12px 16px;border-radius:12px;">${safePw}</p>
  <p style="font-size:0.85rem;color:#555;">Akun email: ${safeTo}</p>
  <p style="font-size:0.85rem;color:#555;">Mohon hapus email ini setelah login. Mengganti kata sandi lewat formulir aplikasi dilakukan oleh <strong>Super Admin</strong> saja.</p>
</div>`,
      text: `Kata sandi sementara Second Room Anda: ${temporaryPassword}\n\nEmail akun: ${to}\nHapus email ini setelah login.`,
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    message?: string;
    name?: string;
  };

  if (!res.ok) {
    throw new Error(json.message || `Email gagal terkirim (HTTP ${res.status}).`);
  }
}
