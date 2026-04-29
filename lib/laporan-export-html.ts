import type { LaporanExportPayloadV1 } from "@/lib/laporan-export-types";
import { LAPORAN_CARD_SURFACE_STYLES_HTML } from "@/lib/laporan-dashboard-card-styles";

function esc(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatRp(n: number): string {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

/** Ambil logo dari origin yang sama → data URL untuk HTML mandiri (buka dari file://). */
export async function fetchReportLogoDataUrl(logoPath = "/roomcheck-logo-transparent.png"): Promise<string | null> {
  try {
    const res = await fetch(logoPath, { cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(typeof fr.result === "string" ? fr.result : null);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export type LaporanStandaloneHtmlOptions = {
  /** Hasil `fetchReportLogoDataUrl`; jika kosong dipakai fallback teks SR. */
  logoDataUrl?: string | null;
};

function formatIdDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Dokumen HTML mandiri (tanpa Tailwind) untuk unduhan / arsip. */
export function buildLaporanStandaloneHtml(
  payload: LaporanExportPayloadV1,
  options?: LaporanStandaloneHtmlOptions
): string {
  const logoUrl = options?.logoDataUrl?.trim();
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="Second Room" style="max-height:72px;width:auto;max-width:220px;object-fit:contain;flex-shrink:0" />`
    : `<div style="flex-shrink:0;width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#2d2115,#8f734f);display:flex;align-items:center;justify-content:center;color:#f8ebd7;font-family:system-ui,Segoe UI,sans-serif;font-weight:700;font-size:15px" aria-hidden="true">SR</div>`;

  const { filters, summary, monthly, kamarByStatus, financeRows, penghuniRows, surveyRows, dashboardCards } =
    payload;
  const cards = dashboardCards?.length ? dashboardCards : [];
  const maxFinance = 200;
  const pemSource = financeRows.filter((f) => f.kategori === "Pemasukan");
  const pengSource = financeRows.filter((f) => f.kategori === "Pengeluaran");
  const pemSlice = pemSource.slice(0, maxFinance);
  const pengSlice = pengSource.slice(0, maxFinance);

  const monthlyRows = monthly
    .map(
      (m) => `
    <tr>
      <td>${esc(m.month)}</td>
      <td style="text-align:right">${esc(formatRp(m.pemasukan))}</td>
      <td style="text-align:right">${esc(formatRp(m.pengeluaran))}</td>
    </tr>`
    )
    .join("");

  const kamarRows = kamarByStatus
    .map(
      (k) => `
    <tr>
      <td>${esc(k.name)}</td>
      <td style="text-align:right">${esc(String(k.value))}</td>
    </tr>`
    )
    .join("");

  const pemRowsHtml = pemSlice
    .map(
      (f) => `
    <tr>
      <td>${esc(f.tanggal)}</td>
      <td>${esc(f.pos?.trim() || "—")}</td>
      <td style="text-align:right">${esc(formatRp(f.nominal))}</td>
      <td>${esc(f.lokasiKos)}</td>
      <td>${esc(f.unitBlok)}</td>
    </tr>`
    )
    .join("");

  const pengRowsHtml = pengSlice
    .map(
      (f) => `
    <tr>
      <td>${esc(f.tanggal)}</td>
      <td style="text-align:right">${esc(formatRp(f.nominal))}</td>
      <td>${esc(f.lokasiKos)}</td>
      <td>${esc(f.unitBlok)}</td>
    </tr>`
    )
    .join("");

  const penRows = penghuniRows
    .map(
      (p) => `
    <tr>
      <td>${esc(p.namaLengkap)}</td>
      <td>${esc(p.lokasiKos)}</td>
      <td>${esc(p.unitBlok)}</td>
      <td>${esc(p.noKamar)}</td>
      <td>${esc(p.status)}</td>
      <td>${esc(p.tglCheckIn)}</td>
      <td>${esc(p.tglCheckOut)}</td>
    </tr>`
    )
    .join("");

  const nCardStyles = LAPORAN_CARD_SURFACE_STYLES_HTML.length;
  const cardKpis = cards
    .map(
      (c, i) => `
    <div class="kpi" style="${LAPORAN_CARD_SURFACE_STYLES_HTML[i % nCardStyles]}">
      <span>${esc(c.label)}</span>
      <strong>${esc(c.value)}</strong>
      <p style="margin:6px 0 0;font-size:11px;color:#6b5238">${esc(c.note)}</p>
    </div>`
    )
    .join("");

  const surRows = surveyRows
    .map(
      (s) => `
    <tr>
      <td>${esc(s.namaLengkap)}</td>
      <td>${esc(s.lokasiKos)}</td>
      <td>${esc(s.unitBlok)}</td>
      <td>${esc(s.rencanaCheckIn)}</td>
    </tr>`
    )
    .join("");

  const css = `
    body { font-family: Segoe UI, Tahoma, sans-serif; margin: 0; padding: 24px; background: #f7f2ea; color: #1a140e; }
    .wrap { max-width: 960px; margin: 0 auto; background: #ffffff; border: 1px solid #dcc7aa; border-radius: 16px; padding: 28px; }
    .report-head { display: flex; align-items: flex-start; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
    .report-head-text h1 { margin: 0 0 6px 0; }
    h1 { font-size: 22px; color: #2c2218; }
    .sub { font-size: 13px; color: #5c472d; margin-bottom: 20px; }
    .meta { font-size: 12px; background: #fdf9f2; border: 1px solid #e8dcc9; border-radius: 12px; padding: 14px 16px; margin-bottom: 22px; }
    .meta div { margin: 4px 0; }
    .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
    .kpi { box-sizing: border-box; }
    .kpi strong { display: block; font-size: 20px; color: #2c2218; }
    .kpi span { font-size: 11px; color: #6b5238; text-transform: uppercase; letter-spacing: 0.06em; }
    .kpi p { margin: 0; }
    h2 { font-size: 15px; margin: 26px 0 10px 0; color: #4a3824; border-bottom: 2px solid #c9ae8c; padding-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 8px; }
    th, td { border: 1px solid #e0d2c0; padding: 8px 10px; text-align: left; }
    th { background: #f4e6d0; color: #4a3824; font-weight: 600; }
    .foot { margin-top: 24px; font-size: 11px; color: #6b5238; }
  `;

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Laporan Second Room</title>
  <style>${css}</style>
</head>
<body>
  <div class="wrap">
    <div class="report-head">
      ${logoBlock}
      <div class="report-head-text">
        <h1>Laporan Second Room</h1>
        <p class="sub" style="margin:0">Ringkasan operasional — sumber: Penghuni, Kamar, Finance, Survey (sesuai filter di aplikasi).</p>
      </div>
    </div>
    <div class="meta">
      <div><strong>Dibuat:</strong> ${esc(formatIdDateTime(payload.generatedAt))}</div>
      <div><strong>Pengguna:</strong> ${esc(payload.currentUserName)}</div>
      <div><strong>Mode:</strong> ${payload.localDemoMode ? "Demo lokal" : "Cloud"}</div>
      <div><strong>Role (revenue):</strong> ${esc(payload.userProfileRole ?? "—")}</div>
      <div><strong>Periode (finance):</strong> ${esc(filters.startDate)} — ${esc(filters.endDate)}</div>
      <div><strong>Filter lokasi / unit:</strong> ${esc(filters.selectedLokasi)} · ${esc(filters.selectedUnit)}</div>
    </div>
    <h2 style="margin-top:0">Ringkasan dashboard</h2>
    <div class="kpis">${cardKpis || "<p>Tidak ada ringkasan.</p>"}</div>
    <p class="meta" style="margin-top:12px"><strong>Pengeluaran (filter):</strong> ${esc(formatRp(summary.pengeluaranTotal))} · <strong>Pemasukan semua POS:</strong> ${esc(formatRp(summary.pemasukanTotal))} · <strong>Revenue tampilan owner:</strong> ${esc(formatRp(summary.revenueOwnerView ?? summary.pemasukanTotal))}</p>
    <h2>Keuangan per bulan</h2>
    <table>
      <thead><tr><th>Bulan</th><th>Pemasukan</th><th>Pengeluaran</th></tr></thead>
      <tbody>${monthlyRows || "<tr><td colspan='3'>Tidak ada data</td></tr>"}</tbody>
    </table>
    <h2>Status kamar</h2>
    <table>
      <thead><tr><th>Status</th><th>Jumlah</th></tr></thead>
      <tbody>${kamarRows || "<tr><td colspan='2'>Tidak ada data</td></tr>"}</tbody>
    </table>
    <h2>Detail pemasukan (${esc(String(pemSource.length))}${pemSource.length > maxFinance ? `, menampilkan ${maxFinance} pertama` : ""})</h2>
    <table>
      <thead><tr><th>Tanggal</th><th>POS</th><th>Nominal</th><th>Lokasi</th><th>Unit</th></tr></thead>
      <tbody>${pemRowsHtml || "<tr><td colspan='5'>Tidak ada data</td></tr>"}</tbody>
    </table>
    <h2>Detail pengeluaran (${esc(String(pengSource.length))}${pengSource.length > maxFinance ? `, menampilkan ${maxFinance} pertama` : ""})</h2>
    <table>
      <thead><tr><th>Tanggal</th><th>Nominal</th><th>Lokasi</th><th>Unit</th></tr></thead>
      <tbody>${pengRowsHtml || "<tr><td colspan='4'>Tidak ada data</td></tr>"}</tbody>
    </table>
    <h2>Penghuni (${esc(String(penghuniRows.length))})</h2>
    <table>
      <thead><tr><th>Nama</th><th>Lokasi</th><th>Unit</th><th>No. kamar</th><th>Status</th><th>Check-in</th><th>Check-out</th></tr></thead>
      <tbody>${penRows || "<tr><td colspan='7'>Tidak ada data</td></tr>"}</tbody>
    </table>
    <h2>Calon survey (${esc(String(surveyRows.length))})</h2>
    <table>
      <thead><tr><th>Nama</th><th>Lokasi</th><th>Unit</th><th>Rencana check-in</th></tr></thead>
      <tbody>${surRows || "<tr><td colspan='4'>Tidak ada data</td></tr>"}</tbody>
    </table>
    <p class="foot">Second Room — dokumen dihasilkan dari aplikasi. Logo disematkan sebagai gambar base64 bila aset ada di folder public saat unduh; jika gagal dimuat, dipakai tanda SR sebagai cadangan.</p>
  </div>
</body>
</html>`;
}

export function buildEmailBodySummary(payload: LaporanExportPayloadV1): string {
  const s = payload.summary;
  const f = payload.filters;
  const cardLines = (payload.dashboardCards ?? []).map((c) => `- ${c.label}: ${c.value} — ${c.note}`);
  const lines = [
    `Laporan Second Room`,
    `Dibuat: ${formatIdDateTime(payload.generatedAt)}`,
    `Oleh: ${payload.currentUserName}`,
    `Role: ${payload.userProfileRole ?? "—"}`,
    `Periode finance: ${f.startDate} s/d ${f.endDate}`,
    `Filter: ${f.selectedLokasi} | ${f.selectedUnit}`,
    ``,
    `Ringkasan dashboard:`,
    ...cardLines,
    ``,
    `Pengeluaran: ${formatRp(s.pengeluaranTotal)}`,
    `Pemasukan (semua POS): ${formatRp(s.pemasukanTotal)}`,
    `Revenue (owner view): ${formatRp(s.revenueOwnerView ?? s.pemasukanTotal)}`,
    ``,
    `Detail: lampirkan berkas HTML dari tombol Unduh di tab laporan.`,
  ];
  return lines.join("\n").slice(0, 1900);
}
