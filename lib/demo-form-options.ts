import { readSandboxJson, SB_KEY } from "@/lib/sandbox-storage";

export type SandboxMasterLokasi = { id: string; namaLokasi: string };
export type SandboxMasterBlok = { id: string; lokasiId: string; namaBlok: string };
export type SandboxMasterSnapshot = {
  lokasiData?: SandboxMasterLokasi[];
  blokData?: SandboxMasterBlok[];
};

const EMPTY_LOKASI = "(Belum ada lokasi — isi Master atau Kamar)";
const EMPTY_UNIT = "(Belum ada unit/blok — isi Master atau Kamar)";

/** Opsi lokasi demo: Master + baris kamar + baris penghuni (tanpa kota contoh). */
export function buildDemoLokasiList(
  sandboxReady: boolean,
  kamarRows: { lokasiKos: string }[],
  penghuniRows: { lokasiKos: string }[]
): string[] {
  const fromMaster = sandboxReady
    ? (readSandboxJson<SandboxMasterSnapshot | null>(SB_KEY.master, null)?.lokasiData ?? [])
        .map((l) => l.namaLokasi)
        .filter(Boolean)
    : [];
  const fromKamar = kamarRows.map((r) => r.lokasiKos).filter(Boolean);
  const fromPen = penghuniRows.map((r) => r.lokasiKos).filter(Boolean);
  const merged = Array.from(new Set([...fromMaster, ...fromKamar, ...fromPen])).sort((a, b) =>
    a.localeCompare(b, "id")
  );
  return merged.length ? merged : [EMPTY_LOKASI];
}

/** Opsi blok/unit demo untuk satu lokasi: Master blok + kamar + penghuni (tanpa Blok A/B/C contoh). */
export function buildDemoUnitList(
  sandboxReady: boolean,
  lokasiName: string,
  kamarRows: { lokasiKos: string; unitBlok: string }[],
  penghuniRows: { lokasiKos: string; unitBlok: string }[]
): string[] {
  const fromMasterBlok: string[] = [];
  if (sandboxReady && lokasiName) {
    const m = readSandboxJson<SandboxMasterSnapshot | null>(SB_KEY.master, null);
    const lok = m?.lokasiData?.find((l) => l.namaLokasi === lokasiName);
    if (lok && m?.blokData) {
      for (const b of m.blokData) {
        if (b.lokasiId === lok.id) {
          const n = String(b.namaBlok ?? "").trim();
          if (n) fromMasterBlok.push(n);
        }
      }
    }
  }
  const fromKamar = kamarRows
    .filter((r) => r.lokasiKos === lokasiName)
    .map((r) => r.unitBlok)
    .filter(Boolean);
  const fromPen = penghuniRows
    .filter((r) => r.lokasiKos === lokasiName)
    .map((r) => r.unitBlok)
    .filter(Boolean);
  const merged = Array.from(new Set([...fromMasterBlok, ...fromKamar, ...fromPen])).sort((a, b) =>
    a.localeCompare(b, "id")
  );
  return merged.length ? merged : [EMPTY_UNIT];
}
