"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PrintActions from "@/app/print/invoice/print-actions";
import type { FinanceInvoicePayloadV1 } from "@/lib/finance-invoice-types";
import {
  formatInvoiceDateLong,
  formatInvoiceNominal,
  readFinanceInvoicePayload,
} from "@/lib/finance-open-invoice-tab";

function formatGeneratedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function FinanceInvoicePrintClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("t")?.trim() ?? "";
  const [payload, setPayload] = useState<FinanceInvoicePayloadV1 | null>(null);
  const [loadError, setLoadError] = useState("");
  const loadedTokenRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!token) {
      setLoadError("Tautan invoice tidak valid. Buka invoice dari daftar riwayat Finance.");
      return;
    }
    if (loadedTokenRef.current === token) return;

    const data = readFinanceInvoicePayload(token);
    if (!data) {
      setLoadError(
        "Data invoice tidak ditemukan atau sudah kedaluwarsa. Klik tombol Invoice di daftar riwayat Finance."
      );
      return;
    }
    loadedTokenRef.current = token;
    setPayload(data);
  }, [token]);

  if (loadError) {
    return (
      <main className="safe-print-screen flex min-h-screen items-center justify-center bg-[#f8f5ff] p-6">
        <p className="max-w-md rounded-2xl border border-violet-200 bg-white px-6 py-5 text-center text-sm text-[#4a3824] shadow-lg">
          {loadError}
        </p>
      </main>
    );
  }

  if (!payload) {
    return (
      <main className="safe-print-screen flex min-h-screen items-center justify-center bg-[#f8f5ff] p-6">
        <p className="text-sm text-[#6f6192]">Memuat invoice…</p>
      </main>
    );
  }

  const isPemasukan = payload.kategori === "Pemasukan";
  const docTitle = isPemasukan ? "Invoice Pembayaran" : "Bukti Pengeluaran";
  const pelaporanLabel = payload.pelaporanBulan?.trim()
    ? payload.pelaporanBulan.trim().slice(0, 7)
    : "—";
  const namaDisplay = payload.namaPenghuni?.trim() || (isPemasukan ? "—" : "Operasional");
  const lokasiDisplay = payload.lokasiKos?.trim() || "—";
  const unitDisplay = payload.unitBlok?.trim() || "—";
  const keteranganDisplay = payload.keterangan?.trim() || "—";

  return (
    <main className="safe-print-screen" style={{ background: "#f3f0ff", minHeight: "100vh", margin: 0 }}>
      <style>{`
        :root {
          --ink: #2d1f48;
          --muted: #6f6192;
          --line: #d9d1ea;
          --panel: #f8f5ff;
          --accent: #5c3d99;
          --accent-soft: #ede8ff;
          --gold: #c9a574;
        }
        * { box-sizing: border-box; }
        .page {
          max-width: 210mm;
          min-height: 297mm;
          margin: 0 auto;
          padding: 14mm 14mm 16mm;
          color: var(--ink);
          font-family: "Segoe UI", Arial, sans-serif;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-bottom: 12px;
        }
        .actionBtn {
          border: 1px solid var(--line);
          background: #fff;
          color: var(--ink);
          border-radius: 999px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
        }
        .actionBtn.primary {
          background: linear-gradient(135deg, #5c3d99, #3d2568);
          border-color: #3d2568;
          color: #fff8eb;
        }
        .actionBtn:disabled { opacity: 0.6; cursor: not-allowed; }
        .sheet {
          border: 1px solid var(--line);
          border-radius: 18px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 24px 60px -40px rgba(45, 31, 72, 0.45);
        }
        .hero {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 20px;
          padding: 28px 28px 24px;
          background: linear-gradient(135deg, #2d1f48 0%, #4a3278 48%, #6b4fa3 100%);
          color: #f8f5ff;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 16px;
          min-width: 0;
        }
        .logoMark {
          width: 72px;
          height: 72px;
          object-fit: contain;
          flex-shrink: 0;
          border-radius: 16px;
          background: rgba(255,255,255,0.12);
          padding: 8px;
        }
        .logoFallback {
          width: 72px;
          height: 72px;
          border-radius: 16px;
          background: linear-gradient(135deg, rgba(255,255,255,0.2), rgba(201,165,116,0.35));
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 22px;
          letter-spacing: 0.06em;
          flex-shrink: 0;
        }
        .brandName {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.04em;
          line-height: 1.1;
        }
        .brandTagline {
          margin: 6px 0 0;
          font-size: 12px;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgba(248,245,255,0.82);
        }
        .docSide {
          text-align: right;
          min-width: 200px;
        }
        .docKind {
          display: inline-block;
          margin: 0 0 8px;
          padding: 6px 14px;
          border-radius: 999px;
          background: rgba(255,255,255,0.14);
          border: 1px solid rgba(255,255,255,0.22);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .notaBadge {
          margin: 0;
          font-size: 30px;
          font-weight: 800;
          letter-spacing: 0.06em;
        }
        .notaLabel {
          margin: 4px 0 0;
          font-size: 11px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: rgba(248,245,255,0.75);
        }
        .body { padding: 24px 28px 28px; }
        .metaGrid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-bottom: 22px;
        }
        .metaBox {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--panel);
          padding: 12px 14px;
        }
        .metaBox .k {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 6px;
        }
        .metaBox .v {
          font-size: 14px;
          font-weight: 600;
          color: var(--ink);
          line-height: 1.35;
        }
        .sectionTitle {
          margin: 0 0 12px;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .partyCard {
          border: 1px solid var(--line);
          border-radius: 16px;
          padding: 16px 18px;
          margin-bottom: 22px;
          background: linear-gradient(180deg, #fff 0%, #faf8ff 100%);
        }
        .partyGrid {
          display: grid;
          grid-template-columns: 120px 1fr;
          gap: 10px 14px;
          font-size: 14px;
        }
        .partyGrid .label { color: var(--muted); font-weight: 600; }
        .partyGrid .value { color: var(--ink); font-weight: 600; }
        .items {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 18px;
        }
        .items th {
          text-align: left;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--muted);
          padding: 10px 12px;
          border-bottom: 2px solid var(--line);
        }
        .items td {
          padding: 14px 12px;
          border-bottom: 1px solid #eee8f8;
          vertical-align: top;
          font-size: 14px;
        }
        .items .amount {
          text-align: right;
          font-weight: 800;
          white-space: nowrap;
          color: ${isPemasukan ? "#166534" : "#9f1239"};
        }
        .totalBox {
          margin-left: auto;
          max-width: 320px;
          border-radius: 16px;
          padding: 16px 18px;
          background: ${isPemasukan ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : "linear-gradient(135deg,#fff1f2,#ffe4e6)"};
          border: 1px solid ${isPemasukan ? "#86efac" : "#fda4af"};
        }
        .totalBox .k {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: ${isPemasukan ? "#166534" : "#9f1239"};
        }
        .totalBox .v {
          margin-top: 6px;
          font-size: 28px;
          font-weight: 800;
          color: ${isPemasukan ? "#14532d" : "#881337"};
        }
        .note {
          margin-top: 22px;
          padding: 14px 16px;
          border-radius: 14px;
          background: #faf8ff;
          border: 1px dashed var(--line);
          font-size: 13px;
          line-height: 1.55;
          color: #5c4d78;
        }
        .footer {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
          margin-top: 28px;
          padding-top: 18px;
          border-top: 1px solid var(--line);
        }
        .signBox {
          min-height: 92px;
          border: 1px dashed #cbbfe5;
          border-radius: 12px;
          padding: 12px 14px;
        }
        .signLabel {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .footNote {
          margin-top: 18px;
          text-align: center;
          font-size: 11px;
          color: var(--muted);
        }
        @page { size: A4 portrait; margin: 10mm; }
        @media print {
          .no-print { display: none !important; }
          .page { max-width: none; min-height: auto; padding: 0; background: #fff; }
          .sheet { border: none; box-shadow: none; border-radius: 0; }
        }
        @media (max-width: 640px) {
          .metaGrid { grid-template-columns: 1fr; }
          .docSide { text-align: left; width: 100%; }
          .partyGrid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="page">
        <PrintActions noNota={payload.noNota} />
        <div className="sheet" id="finance-invoice-sheet">
          <div className="hero">
            <div className="brand">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className="logoMark"
                src="/roomcheck-logo-transparent.png"
                alt="Second Room"
                onError={(e) => {
                  const img = e.currentTarget;
                  img.style.display = "none";
                  const fallback = img.nextElementSibling as HTMLElement | null;
                  if (fallback) fallback.style.display = "flex";
                }}
              />
              <div className="logoFallback" style={{ display: "none" }} aria-hidden>
                SR
              </div>
              <div>
                <p className="brandName">Second Room</p>
                <p className="brandTagline">Kost Management</p>
              </div>
            </div>
            <div className="docSide">
              <p className="docKind">{docTitle}</p>
              <p className="notaBadge">{payload.noNota || "—"}</p>
              <p className="notaLabel">Nomor Nota</p>
            </div>
          </div>

          <div className="body">
            <div className="metaGrid">
              <div className="metaBox">
                <div className="k">Tanggal transaksi</div>
                <div className="v">{formatInvoiceDateLong(payload.tanggal)}</div>
              </div>
              <div className="metaBox">
                <div className="k">Bulan P&amp;L</div>
                <div className="v">{pelaporanLabel}</div>
              </div>
              <div className="metaBox">
                <div className="k">Diterbitkan</div>
                <div className="v">{formatGeneratedAt(payload.generatedAt)}</div>
              </div>
            </div>

            <p className="sectionTitle">{isPemasukan ? "Ditagihkan kepada" : "Rincian penerima / unit"}</p>
            <div className="partyCard">
              <div className="partyGrid">
                <div className="label">Nama</div>
                <div className="value">{namaDisplay}</div>
                <div className="label">Lokasi kos</div>
                <div className="value">{lokasiDisplay}</div>
                <div className="label">Blok / unit</div>
                <div className="value">{unitDisplay}</div>
              </div>
            </div>

            <p className="sectionTitle">Rincian transaksi</p>
            <table className="items">
              <thead>
                <tr>
                  <th style={{ width: "28%" }}>Kategori / POS</th>
                  <th>Keterangan</th>
                  <th style={{ width: "24%", textAlign: "right" }}>Nominal</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>
                    <strong>{payload.kategori}</strong>
                    <br />
                    <span style={{ color: "var(--muted)", fontSize: "13px" }}>{payload.pos || "—"}</span>
                  </td>
                  <td>{keteranganDisplay}</td>
                  <td className="amount">{formatInvoiceNominal(payload.nominal)}</td>
                </tr>
              </tbody>
            </table>

            <div className="totalBox">
              <div className="k">Total {isPemasukan ? "Pemasukan" : "Pengeluaran"}</div>
              <div className="v">{formatInvoiceNominal(payload.nominal)}</div>
            </div>

            <div className="note">
              {isPemasukan ? (
                <>
                  Terima kasih atas pembayaran Anda. Invoice ini merupakan bukti transaksi resmi dari{" "}
                  <strong>Second Room</strong> dan dicatat pada sistem finance dengan nomor nota{" "}
                  <strong>{payload.noNota || "—"}</strong>.
                </>
              ) : (
                <>
                  Dokumen ini merupakan bukti pengeluaran operasional <strong>Second Room</strong> dengan nomor
                  nota <strong>{payload.noNota || "—"}</strong>. Simpan untuk keperluan arsip dan pelaporan.
                </>
              )}
            </div>

            <div className="footer">
              <div className="signBox">
                <div className="signLabel">Petugas Second Room</div>
              </div>
              <div className="signBox">
                <div className="signLabel">{isPemasukan ? "Penghuni / Penerima" : "Mengetahui"}</div>
              </div>
            </div>

            <p className="footNote">
              Second Room — dokumen dihasilkan otomatis dari aplikasi RoomCheck Finance. Cetak atau unduh PDF
              melalui tombol di atas.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
