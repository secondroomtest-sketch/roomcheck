"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import PrintActions from "@/app/print/invoice/print-actions";
import type { FinanceInvoicePayloadV1 } from "@/lib/finance-invoice-types";
import {
  formatInvoiceDateLong,
  formatInvoiceNominal,
  invoiceNeedsPenghuniStayDates,
  readFinanceInvoicePayload,
  resolvePenghuniStayDatesForInvoice,
  writeFinanceInvoicePayload,
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

    if (!invoiceNeedsPenghuniStayDates(data) || (data.tglCheckIn && data.tglCheckOut)) return;

    let cancelled = false;
    void (async () => {
      const stay = await resolvePenghuniStayDatesForInvoice(data);
      if (cancelled || !stay) return;
      const next = {
        ...data,
        tglCheckIn: stay.tglCheckIn || data.tglCheckIn,
        tglCheckOut: stay.tglCheckOut || data.tglCheckOut,
      };
      writeFinanceInvoicePayload(token, next);
      setPayload(next);
    })();

    return () => {
      cancelled = true;
    };
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
  const showStayDates = invoiceNeedsPenghuniStayDates(payload);
  const namaDisplay = payload.namaPenghuni?.trim() || (isPemasukan ? "—" : "Operasional");
  const lokasiDisplay = payload.lokasiKos?.trim() || "—";
  const unitDisplay = payload.unitBlok?.trim() || "—";
  const keteranganDisplay = payload.keterangan?.trim() || "—";
  const checkInDisplay = payload.tglCheckIn?.trim()
    ? formatInvoiceDateLong(payload.tglCheckIn)
    : "—";
  const checkOutDisplay = payload.tglCheckOut?.trim()
    ? formatInvoiceDateLong(payload.tglCheckOut)
    : "—";

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
          margin: 0 auto;
          padding: 10mm 10mm 12mm;
          color: var(--ink);
          font-family: "Segoe UI", Arial, sans-serif;
        }
        .toolbar {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          margin-bottom: 10px;
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
          width: 100%;
          max-width: 190mm;
          margin: 0 auto;
          border: 1px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
          background: #fff;
          box-shadow: 0 24px 60px -40px rgba(45, 31, 72, 0.45);
        }
        .hero {
          display: flex;
          flex-wrap: nowrap;
          justify-content: space-between;
          align-items: center;
          gap: 14px;
          padding: 16px 18px;
          background: linear-gradient(180deg, #ffffff 0%, #f8f5ff 100%);
          border-bottom: 1px solid var(--line);
          color: var(--ink);
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
        }
        .logoMark {
          width: 52px;
          height: 52px;
          object-fit: contain;
          flex-shrink: 0;
          border-radius: 12px;
          background: #fff;
          border: 1px solid var(--line);
          padding: 5px;
        }
        .logoFallback {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: linear-gradient(135deg, #ede8ff, #f3ebe0);
          border: 1px solid var(--line);
          color: var(--accent);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 18px;
          letter-spacing: 0.06em;
          flex-shrink: 0;
        }
        .brandName {
          margin: 0;
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.04em;
          line-height: 1.1;
          color: var(--ink);
        }
        .brandTagline {
          margin: 4px 0 0;
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .docSide {
          text-align: right;
          min-width: 168px;
          max-width: 240px;
          flex-shrink: 0;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
        }
        .docKind {
          display: inline-block;
          width: auto;
          margin: 0 0 6px;
          padding: 0;
          border: none;
          border-radius: 0;
          background: transparent;
          color: var(--accent);
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          text-align: right;
          line-height: 1.2;
          white-space: nowrap;
        }
        .docKindText {
          display: inline;
          margin: 0;
          padding: 0;
          line-height: inherit;
          font-weight: inherit;
        }
        .notaBadge {
          margin: 0;
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 0.06em;
          color: var(--ink);
          text-align: right;
          line-height: 1.1;
        }
        .notaLabel {
          margin: 4px 0 0;
          font-size: 10px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          text-align: right;
          line-height: 1;
        }
        .notaLabelText {
          display: inline;
          margin: 0;
        }
        .body { padding: 14px 18px 16px; }
        .metaGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 8px;
          margin-bottom: 12px;
        }
        .metaBox {
          border: 1px solid var(--line);
          border-radius: 10px;
          background: var(--panel);
          padding: 8px 10px;
        }
        .metaBox .k {
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          margin-bottom: 4px;
        }
        .metaBox .v {
          font-size: 12px;
          font-weight: 600;
          color: var(--ink);
          line-height: 1.3;
        }
        .sectionTitle {
          margin: 0 0 8px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--accent);
        }
        .partyCard {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 10px 12px;
          margin-bottom: 12px;
          background: linear-gradient(180deg, #fff 0%, #faf8ff 100%);
        }
        .partyGrid {
          display: grid;
          grid-template-columns: 100px 1fr;
          gap: 6px 12px;
          font-size: 13px;
        }
        .partyGrid .label { color: var(--muted); font-weight: 600; }
        .partyGrid .value { color: var(--ink); font-weight: 600; }
        .items {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 10px;
        }
        .items th {
          text-align: left;
          font-size: 9px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--muted);
          padding: 6px 8px;
          border-bottom: 2px solid var(--line);
        }
        .items td {
          padding: 8px;
          border-bottom: 1px solid #eee8f8;
          vertical-align: top;
          font-size: 12px;
          line-height: 1.4;
        }
        .items .amount {
          text-align: right;
          font-weight: 800;
          white-space: nowrap;
          color: ${isPemasukan ? "#166534" : "#9f1239"};
        }
        .totalBox {
          margin-left: auto;
          max-width: 260px;
          border-radius: 12px;
          padding: 10px 12px;
          background: ${isPemasukan ? "linear-gradient(135deg,#ecfdf5,#d1fae5)" : "linear-gradient(135deg,#fff1f2,#ffe4e6)"};
          border: 1px solid ${isPemasukan ? "#86efac" : "#fda4af"};
        }
        .totalBox .k {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: ${isPemasukan ? "#166534" : "#9f1239"};
        }
        .totalBox .v {
          margin-top: 4px;
          font-size: 22px;
          font-weight: 800;
          color: ${isPemasukan ? "#14532d" : "#881337"};
        }
        .note {
          margin-top: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          background: #faf8ff;
          border: 1px dashed var(--line);
          font-size: 11px;
          line-height: 1.45;
          color: #5c4d78;
        }
        .footer {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 14px;
          padding-top: 12px;
          border-top: 1px solid var(--line);
        }
        .signBox {
          min-height: 64px;
          border: 1px dashed #cbbfe5;
          border-radius: 10px;
          padding: 8px 10px;
        }
        .signLabel {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--muted);
        }
        .footNote {
          margin-top: 10px;
          text-align: center;
          font-size: 10px;
          line-height: 1.4;
          color: var(--muted);
        }
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .page { max-width: none; min-height: auto; padding: 0; background: #fff; }
          .sheet {
            width: 100%;
            max-width: none;
            border: none;
            box-shadow: none;
            border-radius: 0;
          }
        }
        @media (max-width: 640px) {
          .hero { flex-wrap: wrap; }
          .metaGrid { grid-template-columns: 1fr; }
          .docSide { text-align: left; width: 100%; max-width: none; align-items: flex-start; }
          .docKind { text-align: left; }
          .notaBadge { text-align: left; }
          .notaLabel { text-align: left; }
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
              <div className="docKind">
                <span className="docKindText">{docTitle}</span>
              </div>
              <p className="notaBadge">{payload.noNota || "—"}</p>
              <p className="notaLabel">
                <span className="notaLabelText">Nomor Nota</span>
              </p>
            </div>
          </div>

          <div className="body">
            <div className="metaGrid">
              <div className="metaBox">
                <div className="k">Tanggal transaksi</div>
                <div className="v">{formatInvoiceDateLong(payload.tanggal)}</div>
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
                {showStayDates ? (
                  <>
                    <div className="label">Check in</div>
                    <div className="value">{checkInDisplay}</div>
                    <div className="label">Check out</div>
                    <div className="value">{checkOutDisplay}</div>
                  </>
                ) : null}
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
              Official receipt from Second Room — Simpan dokumen ini sebagai bukti transaksi yang valid.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
