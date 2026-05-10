import type { SurveyCalonRow } from "@/components/penghuni-page-client";
import type { PenghuniRow } from "@/components/penghuni-page-client";
import type { KamarRow } from "@/components/kamar-page-client";
import { readSandboxJson, SB_KEY } from "@/lib/sandbox-storage";
import { syncKamarRowsWithPenghuniList } from "@/lib/kamar-penghuni-sync";
import { supabase } from "@/libsupabaseClient";
import type { ReportKamarRow } from "@/lib/laporan-export-types";
import { buildPenghuniLookupMap, mapCloudPenghuniRow, mapCloudSurveyRow } from "@/lib/laporan-fetch-mappers";

function mapCloudKamarToKamarRow(row: Record<string, unknown>): KamarRow {
  const statusRaw = String(row.status ?? "Available");
  const status =
    statusRaw === "Occupied" || statusRaw === "Maintenance" ? statusRaw : "Available";
  return {
    id: String(row.id ?? ""),
    lokasiKos: String(row.lokasi_kos ?? "Unknown"),
    unitBlok: String(row.unit_blok ?? "Unknown"),
    noKamar: String(row.no_kamar ?? ""),
    status,
    keterangan: String(row.keterangan ?? ""),
    namaPenghuni: String(row.nama_penghuni ?? ""),
    tglCheckOut: String(row.tgl_check_out ?? ""),
  };
}

function kamarRowToReport(k: KamarRow): ReportKamarRow {
  return {
    id: k.id,
    status: k.status,
    lokasiKos: k.lokasiKos,
    unitBlok: k.unitBlok,
  };
}

/**
 * Muat snapshot Kamar / Penghuni / Survey untuk payload tab cetak (Finance atau Laporan).
 * Mode demo membaca sandbox; cloud mem-fetch paralel seperti halaman Laporan.
 */
export async function fetchKamarPenghuniSurveyForLaporanExport(localDemoMode: boolean): Promise<{
  kamarRows: ReportKamarRow[];
  penghuniRows: PenghuniRow[];
  surveyRows: SurveyCalonRow[];
}> {
  if (localDemoMode) {
    const rawKamar = readSandboxJson<KamarRow[]>(SB_KEY.kamar, []);
    const pen = readSandboxJson<PenghuniRow[]>(SB_KEY.penghuni, []);
    const mergedKamar = syncKamarRowsWithPenghuniList(rawKamar, pen);
    return {
      kamarRows: mergedKamar.map(kamarRowToReport),
      penghuniRows: pen.filter((row) => String(row.status ?? "").toLowerCase() !== "survey"),
      surveyRows: readSandboxJson<SurveyCalonRow[]>(SB_KEY.surveyCalon, []),
    };
  }

  const { data: penRes, error: penErr } = await supabase.from("penghuni").select("*");
  const { data: kamRes, error: kamErr } = await supabase.from("kamar").select("*");

  if (penErr || kamErr) {
    const msg = [penErr?.message, kamErr?.message].filter(Boolean).join(" · ");
    throw new Error(msg || "Gagal memuat penghuni / kamar untuk laporan.");
  }

  const rawPen = (penRes ?? []) as Array<Record<string, unknown>>;
  const lookup = buildPenghuniLookupMap(rawPen);

  const kamarRows = (kamRes ?? []).map((r) => mapCloudKamarToKamarRow(r as Record<string, unknown>));

  const penghuniRows = rawPen
    .filter((row) => String(row.status ?? "").toLowerCase() !== "survey")
    .map((r) => mapCloudPenghuniRow(r));

  const surveyRows = rawPen
    .filter((row) => String(row.status ?? "").toLowerCase() === "survey")
    .map((r) => mapCloudSurveyRow(r));

  const merged = syncKamarRowsWithPenghuniList(kamarRows, penghuniRows);

  return {
    kamarRows: merged.map(kamarRowToReport),
    penghuniRows,
    surveyRows,
  };
}
