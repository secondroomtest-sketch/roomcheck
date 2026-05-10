import LaporanPageClient from "@/components/laporan-page-client";

/** Data laporan dan filter lokasi/blok di-load di client dengan sesi pengguna (RLS di Supabase). */
export default function LaporanPage() {
  return (
    <LaporanPageClient
      financeRows={[]}
      kamarRows={[]}
      penghuniRows={[]}
      surveyRows={[]}
      availableLokasi={[]}
      availableUnit={[]}
    />
  );
}
