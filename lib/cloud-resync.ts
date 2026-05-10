/** Nama event dokumen untuk memicu muat ulang data Supabase dari seluruh halaman cloud. */
export const CLOUD_DATA_RESYNC_EVENT = "secondroom-cloud-data-resync";

export function emitCloudDataResync(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOUD_DATA_RESYNC_EVENT));
}
