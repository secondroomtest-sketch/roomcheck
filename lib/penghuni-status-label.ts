/** Label tampilan untuk status internal penghuni (DB tetap History/Booking/Stay). */
export function formatPenghuniStatusLabel(status: string | null | undefined): string {
  const s = String(status ?? "").trim();
  if (!s) return "—";
  if (s.toLowerCase() === "history") return "Penghuni Check Out";
  return s;
}
