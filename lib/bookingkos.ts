/** Shared booking publik (/bookingkos) — storage & validasi. */

export type BookingLokasiOption = {
  namaLokasi: string;
  unitBlok: string[];
};

export const BOOKING_UPLOADS_BUCKET = "booking-uploads";
export const BOOKING_SOURCE_PUBLIC = "public_form";
export const BOOKING_MAX_FILE_BYTES = 5 * 1024 * 1024;

export const BOOKING_ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function bookingFileExtension(mime: string, fileName: string): string {
  const fromMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
  };
  if (fromMime[mime]) return fromMime[mime];
  const m = String(fileName).match(/\.([a-zA-Z0-9]+)$/);
  return (m?.[1] ?? "jpg").toLowerCase();
}

export function normalizeWaDigits(raw: string): string {
  return String(raw ?? "").replace(/\D/g, "");
}

export function isValidWaDigits(digits: string): boolean {
  return digits.length >= 9 && digits.length <= 15;
}

export function normalizeEmail(raw: string): string {
  return String(raw ?? "").trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  if (!email || email.length > 254) return false;
  // sederhana & praktis untuk form publik
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function todayIsoDateLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
