"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Printer, Download, Mail, ArrowLeft } from "lucide-react";
import { LAPORAN_EXPORT_STORAGE_KEY, type LaporanExportPayloadV1 } from "@/lib/laporan-export-types";
import {
  filterDashboardCardsByLaporanFokus,
  filterPemasukanRowsForLaporanCetak,
  filterPengeluaranRowsForLaporanCetak,
} from "@/lib/laporan-cetak-filters";
import {
  buildEmailBodySummary,
  buildLaporanStandaloneHtml,
  fetchReportLogoDataUrl,
} from "@/lib/laporan-export-html";
import { LAPORAN_CARD_SURFACE_CLASSES } from "@/lib/laporan-dashboard-card-styles";

function formatRp(n: number): string {
  return `Rp ${Number(n || 0).toLocaleString("id-ID")}`;
}

function formatId(iso: string): string {
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

export default function LaporanCetakClient() {
  const [payload, setPayload] = useState<LaporanExportPayloadV1 | null>(null);
  const [loadError, setLoadError] = useState("");
  const [htmlDownloadBusy, setHtmlDownloadBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(LAPORAN_EXPORT_STORAGE_KEY);
      if (!raw) {
        setLoadError("Tidak ada data laporan. Buka halaman Laporan dan klik tombol buka laporan lengkap.");
        return;
      }
      const data = JSON.parse(raw) as LaporanExportPayloadV1;
      if (data?.v !== 1) {
        setLoadError("Format laporan tidak dikenali.");
        return;
      }
      setPayload(data);
      localStorage.removeItem(LAPORAN_EXPORT_STORAGE_KEY);
    } catch {
      setLoadError("Gagal membaca data laporan dari penyimpanan.");
    }
  }, []);

  const maxFinance = 80;
  const fokus = payload?.laporanFokus;

  const pemFinanceTable = useMemo(() => {
    if (!payload) return [];
    return filterPemasukanRowsForLaporanCetak(payload.financeRows, fokus ?? undefined).slice(0, maxFinance);
  }, [fokus, payload]);

  const pengFinanceTable = useMemo(() => {
    if (!payload) return [];
    return filterPengeluaranRowsForLaporanCetak(payload.financeRows, fokus ?? undefined).slice(0, maxFinance);
  }, [fokus, payload]);

  const financeRowCounts = useMemo(() => {
    if (!payload) return { pem: 0, peng: 0 };
    const pemRows = filterPemasukanRowsForLaporanCetak(payload.financeRows, fokus ?? undefined);
    const pengRows = filterPengeluaranRowsForLaporanCetak(payload.financeRows, fokus ?? undefined);
    return { pem: pemRows.length, peng: pengRows.length };
  }, [fokus, payload]);

  const monthlyMax = useMemo(() => {
    if (!payload?.monthly.length) return 1;
    const fk = payload.laporanFokus;
    return Math.max(
      1,
      ...payload.monthly.flatMap((m) => {
        if (fk === "kos") return [m.pemasukanKos, m.pengeluaranKos];
        if (fk === "manajemen") return [m.pemasukanManajemen, m.pengeluaranManajemen];
        return [m.pemasukanKos, m.pemasukanManajemen, m.pengeluaranKos, m.pengeluaranManajemen];
      })
    );
  }, [payload]);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = async () => {
    if (!payload) return;
    setHtmlDownloadBusy(true);
    try {
      const logoDataUrl = await fetchReportLogoDataUrl("/roomcheck-logo-transparent.png");
      const html = buildLaporanStandaloneHtml(payload, { logoDataUrl });
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-second-room-${payload.generatedAt.slice(0, 10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setHtmlDownloadBusy(false);
    }
  };

  const handleEmail = () => {
    if (!payload) return;
    const addr = window.prompt("Alamat email penerima (contoh: finance@perusahaan.com)", "");
    if (!addr || !addr.includes("@")) {
      window.alert("Alamat email tidak valid.");
      return;
    }
    const subject = encodeURIComponent("Laporan Second Room");
    const body = encodeURIComponent(buildEmailBodySummary(payload));
    window.location.href = `mailto:${encodeURIComponent(addr.trim())}?subject=${subject}&body=${body}`;
  };

  if (loadError) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-[#5c472d]">{loadError}</p>
        <Link
          href="/laporan"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-[#c9ae8c] bg-[#fdf9f2] px-5 py-2.5 text-sm font-semibold text-[#4a3824]"
        >
          <ArrowLeft size={16} aria-hidden />
          Kembali ke Laporan
        </Link>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="px-6 py-16 text-center text-sm text-[#6b5238]">
        Memuat laporan…
      </div>
    );
  }

  const s = payload.summary;
  const f = payload.filters;
  const fokusCetak = payload.laporanFokus;
  const cardsRaw =
    payload.dashboardCards?.length > 0
      ? payload.dashboardCards
      : [
          {
            label: "Okupansi",
            value: `${s.occupancyPct}%`,
            note: `${s.occupied} dari ${s.kamarTotal} kamar`,
          },
          {
            label: "Pemasukan",
            value: formatRp(s.pemasukanTotal),
            note: "Ringkasan",
          },
        ];
  const cards = filterDashboardCardsByLaporanFokus(cardsRaw, fokusCetak ?? undefined);

  return (
    <div className="min-h-screen bg-[#f7f2ea] pb-16 text-[#1a140e] print:bg-white print:pb-0">
      <div className="sr-cetak-toolbar sticky top-0 z-30 border-b border-[#e0d2c0] bg-[#fdf9f2]/95 px-4 py-3 shadow-sm backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/laporan"
              className="inline-flex items-center gap-1.5 rounded-full border border-[#dcc7aa] bg-white px-3 py-1.5 text-xs font-semibold text-[#4a3824]"
            >
              <ArrowLeft size={14} aria-hidden />
              Tutup
            </Link>
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2d2115] px-4 py-2 text-xs font-semibold text-[#f8ebd7]"
            >
              <Printer size={14} aria-hidden />
              Print / Simpan PDF
            </button>
            <button
              type="button"
              onClick={() => void handleDownloadHtml()}
              disabled={htmlDownloadBusy}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#8f734f] bg-white px-4 py-2 text-xs font-semibold text-[#2d2115] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Download size={14} aria-hidden />
              {htmlDownloadBusy ? "Menyiapkan…" : "Unduh HTML"}
            </button>
            <button
              type="button"
              onClick={handleEmail}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#4d6dff] bg-white px-4 py-2 text-xs font-semibold text-[#2d3a8f]"
            >
              <Mail size={14} aria-hidden />
              Bagikan email
            </button>
          </div>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#8c6d47]">
            Tab laporan lengkap
          </p>
        </div>
      </div>

      <article className="mx-auto max-w-5xl px-4 py-8 print:py-4 print:px-2">
        <header className="mb-8 flex flex-col gap-6 border-b border-[#e8dcc9] pb-8 sm:flex-row sm:items-start sm:justify-between print:mb-4 print:pb-4">
          <div className="flex gap-5">
            <div className="relative h-[72px] w-[180px] shrink-0">
              <Image
                src="/roomcheck-logo-transparent.png"
                alt="Second Room"
                fill
                className="object-contain object-left"
                sizes="180px"
                priority
                unoptimized
              />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[#8c6d47]">
                Second Room — laporan operasional
              </p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-[#2c2218] print:text-xl">
                Ringkasan seperti dashboard
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-[#5c472d]">
                Data dari modul Finance, Kamar, Penghuni, dan Survey (calon). Filter lokasi/unit diterapkan pada
                kamar, penghuni, dan survey; rentang tanggal pada ringkasan finance.
              </p>
            </div>
          </div>
          <aside className="w-full max-w-sm rounded-2xl border border-[#dcc7aa] bg-white p-4 text-sm text-[#4a3824] shadow-sm sm:w-auto">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8c6d47]">Metadata</p>
            <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
              <div>
                <dt className="font-semibold text-[#6b5238]">Dibuat</dt>
                <dd>{formatId(payload.generatedAt)}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#6b5238]">Pengguna</dt>
                <dd>{payload.currentUserName}</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#6b5238]">Sumber data</dt>
                <dd>Supabase (cloud)</dd>
              </div>
              <div>
                <dt className="font-semibold text-[#6b5238]">Periode finance</dt>
                <dd>
                  {f.startDate} — {f.endDate}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#6b5238]">Filter</dt>
                <dd>
                  {f.selectedLokasi} · {f.selectedUnit}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#6b5238]">Fokus laporan</dt>
                <dd>
                  {fokusCetak === "kos"
                    ? "Laporan Kos"
                    : fokusCetak === "manajemen"
                      ? "Laporan Manajemen"
                      : "Laporan lengkap"}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-[#6b5238]">Role (revenue)</dt>
                <dd>{payload.userProfileRole || "—"}</dd>
              </div>
            </dl>
          </aside>
        </header>

        <section className="mb-10 print:mb-4">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.14em] text-[#8c6d47]">
            Ringkasan dashboard
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card, i) => (
              <div
                key={`${card.label}-${i}`}
                className={`rounded-2xl border-2 p-4 shadow-sm print:break-inside-avoid ${LAPORAN_CARD_SURFACE_CLASSES[i % LAPORAN_CARD_SURFACE_CLASSES.length]}`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#8c6d47]">{card.label}</p>
                <p className="mt-1 text-2xl font-semibold text-[#2c2218] print:text-xl">{card.value}</p>
                <p className="mt-1 text-xs leading-snug text-[#6b5238]">{card.note}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 space-y-3 rounded-2xl border border-[#e8dcc9] bg-[#fdf9f2] px-4 py-3 text-sm text-[#4a3824]">
            {fokusCetak !== "manajemen" ? (
              <div>
                <p className="font-medium text-[#6b5238]">P&amp;L kos</p>
                <p className="text-lg font-semibold text-[#166534]">{formatRp(s.plKosNominal)}</p>
                <p className="text-xs text-[#6b5238]">
                  Pemasukan kos {formatRp(s.pemasukanKosTotal)} − pengeluaran kos{" "}
                  {formatRp(s.pengeluaranKosTotal)}
                </p>
              </div>
            ) : null}
            {fokusCetak !== "kos" ? (
              <div className={fokusCetak === undefined ? "border-t border-[#e0d2c0] pt-3" : ""}>
                <p className="font-medium text-[#6b5238]">P&amp;L manajemen</p>
                <p className="text-lg font-semibold text-[#047857]">{formatRp(s.plManajemenNominal)}</p>
                <p className="text-xs text-[#6b5238]">
                  Pemasukan manajemen {formatRp(s.pemasukanManajemenTotal)} − pengeluaran manajemen{" "}
                  {formatRp(s.pengeluaranManajemenTotal)}
                </p>
              </div>
            ) : null}
            <div
              className={
                fokusCetak === undefined ? "border-t border-[#e0d2c0] pt-3 text-xs text-[#6b5238]" : "text-xs text-[#6b5238]"
              }
            >
              Total pemasukan: {formatRp(s.pemasukanTotal)} · Total pengeluaran: {formatRp(s.pengeluaranTotal)} ·
              Revenue owner (deposit/booking tidak dijumlahkan): {formatRp(s.revenueOwnerView)} (
              {s.pemasukanTransactionCountOwnerView} trans.)
            </div>
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-[#dcc7aa] bg-white p-5 shadow-sm print:break-inside-avoid">
          <h2 className="mb-4 text-base font-semibold text-[#2c2218]">Keuangan per bulan</h2>
          <div className="space-y-4">
            {payload.monthly.length === 0 ? (
              <p className="text-sm text-[#6b5238]">Tidak ada transaksi pada periode ini.</p>
            ) : (
              payload.monthly.map((m) => {
                const fk = payload.laporanFokus;
                if (fk === "kos") {
                  return (
                    <div key={m.month}>
                      <div className="mb-1 flex flex-col gap-1 text-xs text-[#5c472d] sm:flex-row sm:justify-between">
                        <span className="font-medium">{m.month}</span>
                        <span className="text-right text-[10px] leading-snug sm:text-xs">
                          <span className="text-[#14532d]">Masuk kos {formatRp(m.pemasukanKos)}</span>
                          {" · "}
                          <span className="text-[#b91c1c]">Keluar kos {formatRp(m.pengeluaranKos)}</span>
                        </span>
                      </div>
                      <div className="flex h-3 gap-px overflow-hidden rounded-full bg-[#f0e4d4]">
                        <div
                          className="bg-[#15803d]"
                          style={{ width: `${(m.pemasukanKos / monthlyMax) * 100}%` }}
                          title="Pemasukan kos"
                        />
                        <div
                          className="bg-[#ef4444]"
                          style={{ width: `${(m.pengeluaranKos / monthlyMax) * 100}%` }}
                          title="Pengeluaran kos"
                        />
                      </div>
                    </div>
                  );
                }
                if (fk === "manajemen") {
                  return (
                    <div key={m.month}>
                      <div className="mb-1 flex flex-col gap-1 text-xs text-[#5c472d] sm:flex-row sm:justify-between">
                        <span className="font-medium">{m.month}</span>
                        <span className="text-right text-[10px] leading-snug sm:text-xs">
                          <span className="text-[#047857]">Margin {formatRp(m.pemasukanManajemen)}</span>
                          {" · "}
                          <span className="text-[#c2410c]">Keluar manajemen {formatRp(m.pengeluaranManajemen)}</span>
                        </span>
                      </div>
                      <div className="flex h-3 gap-px overflow-hidden rounded-full bg-[#f0e4d4]">
                        <div
                          className="bg-[#34d399]"
                          style={{ width: `${(m.pemasukanManajemen / monthlyMax) * 100}%` }}
                          title="Pemasukan manajemen"
                        />
                        <div
                          className="bg-[#ea580c]"
                          style={{ width: `${(m.pengeluaranManajemen / monthlyMax) * 100}%` }}
                          title="Pengeluaran manajemen"
                        />
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.month}>
                    <div className="mb-1 flex flex-col gap-1 text-xs text-[#5c472d] sm:flex-row sm:justify-between">
                      <span className="font-medium">{m.month}</span>
                      <span className="text-right text-[10px] leading-snug sm:text-xs">
                        <span className="text-[#14532d]">Masuk kos {formatRp(m.pemasukanKos)}</span>
                        {" · "}
                        <span className="text-[#b91c1c]">Keluar kos {formatRp(m.pengeluaranKos)}</span>
                        {" · "}
                        <span className="text-[#047857]">Masuk manajemen {formatRp(m.pemasukanManajemen)}</span>
                        {" · "}
                        <span className="text-[#c2410c]">Keluar manajemen {formatRp(m.pengeluaranManajemen)}</span>
                      </span>
                    </div>
                    <div className="flex h-3 gap-px overflow-hidden rounded-full bg-[#f0e4d4]">
                      <div
                        className="bg-[#15803d]"
                        style={{ width: `${(m.pemasukanKos / monthlyMax) * 100}%` }}
                        title="Pemasukan kos"
                      />
                      <div
                        className="bg-[#ef4444]"
                        style={{ width: `${(m.pengeluaranKos / monthlyMax) * 100}%` }}
                        title="Pengeluaran kos"
                      />
                      <div
                        className="bg-[#34d399]"
                        style={{ width: `${(m.pemasukanManajemen / monthlyMax) * 100}%` }}
                        title="Pemasukan manajemen"
                      />
                      <div
                        className="bg-[#ea580c]"
                        style={{ width: `${(m.pengeluaranManajemen / monthlyMax) * 100}%` }}
                        title="Pengeluaran manajemen"
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-[#dcc7aa] bg-white p-5 shadow-sm print:break-inside-avoid">
          <h2 className="mb-4 text-base font-semibold text-[#2c2218]">Status kamar</h2>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[#e8dcc9] text-xs uppercase tracking-[0.12em] text-[#8c6d47]">
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Jumlah</th>
                </tr>
              </thead>
              <tbody>
                {payload.kamarByStatus.map((row) => (
                  <tr key={row.name} className="border-b border-[#f4eadc] last:border-0">
                    <td className="py-2 pr-4 font-medium">{row.name}</td>
                    <td className="py-2">{row.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-[#dcc7aa] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-[#2c2218]">
            Detail pemasukan ({financeRowCounts.pem}
            {financeRowCounts.pem > maxFinance ? `, menampilkan ${maxFinance}` : ""})
          </h2>
          <div className="max-h-[28rem] overflow-auto print:max-h-none">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#f4e6d0] text-[#4a3824] print:static">
                <tr>
                  <th className="px-2 py-2">Tanggal</th>
                  <th className="px-2 py-2">POS</th>
                  <th className="px-2 py-2">Nominal</th>
                  <th className="px-2 py-2">Lokasi</th>
                  <th className="px-2 py-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {pemFinanceTable.map((row) => (
                  <tr key={row.id} className="border-b border-[#f4eadc]">
                    <td className="px-2 py-1.5 whitespace-nowrap">{row.tanggal}</td>
                    <td className="px-2 py-1.5">{row.pos?.trim() || "—"}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatRp(row.nominal)}</td>
                    <td className="px-2 py-1.5">{row.lokasiKos}</td>
                    <td className="px-2 py-1.5">{row.unitBlok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-[#dcc7aa] bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-base font-semibold text-[#2c2218]">
            Detail pengeluaran ({financeRowCounts.peng}
            {financeRowCounts.peng > maxFinance ? `, menampilkan ${maxFinance}` : ""})
          </h2>
          <div className="max-h-[28rem] overflow-auto print:max-h-none">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#f4e6d0] text-[#4a3824] print:static">
                <tr>
                  <th className="px-2 py-2">Tanggal</th>
                  <th className="px-2 py-2">Nominal</th>
                  <th className="px-2 py-2">Lokasi</th>
                  <th className="px-2 py-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {pengFinanceTable.map((row) => (
                  <tr key={row.id} className="border-b border-[#f4eadc]">
                    <td className="px-2 py-1.5 whitespace-nowrap">{row.tanggal}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{formatRp(row.nominal)}</td>
                    <td className="px-2 py-1.5">{row.lokasiKos}</td>
                    <td className="px-2 py-1.5">{row.unitBlok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-[#dcc7aa] bg-white p-5 shadow-sm print:break-inside-avoid">
          <h2 className="mb-4 text-base font-semibold text-[#2c2218]">Penghuni ({payload.penghuniRows.length})</h2>
          <div className="max-h-80 overflow-auto print:max-h-none">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#f4e6d0] text-[#4a3824] print:static">
                <tr>
                  <th className="px-2 py-2">Nama</th>
                  <th className="px-2 py-2">Lokasi</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2">Kamar</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Check-in</th>
                  <th className="px-2 py-2">Check-out</th>
                </tr>
              </thead>
              <tbody>
                {payload.penghuniRows.map((row, i) => (
                  <tr key={`${row.namaLengkap}-${i}`} className="border-b border-[#f4eadc]">
                    <td className="px-2 py-1.5 font-medium">{row.namaLengkap}</td>
                    <td className="px-2 py-1.5">{row.lokasiKos}</td>
                    <td className="px-2 py-1.5">{row.unitBlok}</td>
                    <td className="px-2 py-1.5">{row.noKamar}</td>
                    <td className="px-2 py-1.5">{row.status}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{row.tglCheckIn}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{row.tglCheckOut}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-[#dcc7aa] bg-white p-5 shadow-sm print:break-inside-avoid">
          <h2 className="mb-4 text-base font-semibold text-[#2c2218]">Calon survey ({payload.surveyRows.length})</h2>
          <div className="max-h-72 overflow-auto print:max-h-none">
            <table className="min-w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#f4e6d0] text-[#4a3824] print:static">
                <tr>
                  <th className="px-2 py-2">Nama</th>
                  <th className="px-2 py-2">Lokasi</th>
                  <th className="px-2 py-2">Unit</th>
                  <th className="px-2 py-2">Rencana CI</th>
                </tr>
              </thead>
              <tbody>
                {payload.surveyRows.map((row, i) => (
                  <tr key={`${row.namaLengkap}-${i}`} className="border-b border-[#f4eadc]">
                    <td className="px-2 py-1.5 font-medium">{row.namaLengkap}</td>
                    <td className="px-2 py-1.5">{row.lokasiKos}</td>
                    <td className="px-2 py-1.5">{row.unitBlok}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">{row.rencanaCheckIn}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <style
          dangerouslySetInnerHTML={{
            __html: `@media print { .sr-cetak-toolbar { display: none !important; } }`,
          }}
        />
      </article>
    </div>
  );
}
