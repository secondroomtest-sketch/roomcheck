import { LAPORAN_EXPORT_STORAGE_KEY, type LaporanExportPayloadV1 } from "@/lib/laporan-export-types";

export function openLaporanCetakTabWithPayload(payload: LaporanExportPayloadV1): boolean {
  try {
    const json = JSON.stringify(payload);
    localStorage.setItem(LAPORAN_EXPORT_STORAGE_KEY, json);
    window.open("/laporan/cetak", "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
