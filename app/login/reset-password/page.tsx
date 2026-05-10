import { redirect } from "next/navigation";

/** Alur sekarang adalah email berisi password (bukan tautan ini). Pertahankan rute untuk link lama dari email. */
export default function LegacyResetRedirectPage() {
  redirect("/login");
}
