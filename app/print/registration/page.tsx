import PrintActions from "./print-actions";

type PrintParams = Record<string, string | string[] | undefined>;

function firstParam(value: string | string[] | undefined, fallback = "—"): string {
  if (Array.isArray(value)) return value[0] ?? fallback;
  return value ?? fallback;
}

function field(params: PrintParams, key: string, fallback = "—"): string {
  const value = firstParam(params[key], fallback);
  const trimmed = String(value ?? "").trim();
  return trimmed || fallback;
}

function formatTanggalLengkap(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return "—";

  // Prefer parsing ISO date (YYYY-MM-DD) to avoid timezone drift.
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let date: Date;
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date(raw);
  }

  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function RegistrationPrintPage({
  searchParams,
}: {
  searchParams: Promise<PrintParams>;
}) {
  const params = await searchParams;
  const today = formatTanggalLengkap(new Date().toISOString().slice(0, 10));
  const status = field(params, "status");
  const lokasiKos = field(params, "lokasiKos");
  const unitBlok = field(params, "unitBlok");
  const noKamar = field(params, "noKamar");
  const periodeSewa = field(params, "periodeSewa");
  const tglCheckIn = formatTanggalLengkap(field(params, "tglCheckIn"));
  const tglCheckOut = formatTanggalLengkap(field(params, "tglCheckOut"));

  return (
    <main style={{ background: "#ffffff", minHeight: "100vh", margin: 0 }}>
      <style>{`
        :root {
          --ink: #2d1f48;
          --muted: #6f6192;
          --line: #d9d1ea;
          --panel: #f8f5ff;
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
          border: 1px solid #cbbfe5;
          border-radius: 10px;
          padding: 8px 14px;
          font-size: 13px;
          font-weight: 700;
          color: #4c1d95;
          background: #f6f0ff;
          cursor: pointer;
        }
        .actionBtn.primary {
          border-color: #7c3aed;
          color: #ffffff;
          background: #7c3aed;
        }
        .actionBtn:disabled {
          opacity: 0.7;
          cursor: wait;
        }
        .sheet {
          border: 1.2px solid var(--line);
          border-radius: 14px;
          overflow: hidden;
        }
        .head {
          background: linear-gradient(135deg, #f4edff 0%, #ece2ff 100%);
          border-bottom: 1.2px solid var(--line);
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .logoMark {
          width: 72px;
          height: 72px;
          object-fit: contain;
          border-radius: 10px;
          background: #ffffff;
          border: 1px solid #d9d1ea;
          padding: 4px;
        }
        .brandName {
          margin: 0;
          font-size: 16px;
          font-weight: 800;
          color: #4c1d95;
        }
        .brandTagline {
          margin: 2px 0 0;
          font-size: 11px;
          color: var(--muted);
        }
        .headerTitleWrap {
          min-width: 320px;
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          justify-content: center;
          gap: 6px;
        }
        .head h1 {
          margin: 0;
          font-size: 24px;
          line-height: 1.05;
          font-weight: 900;
          color: #3f1785;
          letter-spacing: 0.01em;
          text-transform: uppercase;
        }
        .docMeta {
          font-size: 12px;
          color: #5b46a2;
          font-weight: 700;
        }
        .docMeta strong {
          color: #3f1785;
        }
        .meta {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          padding: 14px 18px;
          border-bottom: 1.2px solid var(--line);
          background: #fff;
        }
        .metaBox {
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 8px 10px;
          background: var(--panel);
        }
        .metaBox .k {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          font-weight: 700;
        }
        .metaBox .v {
          margin-top: 4px;
          font-size: 13px;
          font-weight: 700;
          color: var(--ink);
        }
        .section {
          padding: 14px 18px 18px;
        }
        .sectionTitle {
          margin: 0 0 10px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--muted);
          font-weight: 700;
        }
        .grid {
          display: grid;
          grid-template-columns: 180px 1fr;
          border: 1px solid var(--line);
          border-radius: 12px;
          overflow: hidden;
        }
        .cell {
          padding: 10px 12px;
          border-bottom: 1px solid var(--line);
        }
        .label {
          background: #f5f0ff;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
          color: #5b46a2;
        }
        .value {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
        }
        .grid .cell:nth-last-child(-n+2) {
          border-bottom: none;
        }
        .footer {
          border-top: 1.2px dashed var(--line);
          margin: 14px 18px 18px;
          padding-top: 12px;
          display: flex;
          justify-content: space-between;
          gap: 16px;
        }
        .signBox {
          width: 46%;
          min-height: 74px;
          border: 1px dashed #b8abd9;
          border-radius: 10px;
          padding: 8px 10px;
        }
        .signLabel {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--muted);
          font-weight: 700;
        }
        .hint {
          margin-top: 8px;
          font-size: 11px;
          color: #8a7cae;
        }
        .terms {
          margin: 8px 18px 0;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #fcfaff;
          padding: 12px 14px;
        }
        .termsTitle {
          margin: 0 0 8px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #5b46a2;
          font-weight: 700;
        }
        .termsList {
          margin: 0;
          padding-left: 18px;
          font-size: 12px;
          line-height: 1.55;
          color: var(--ink);
        }
        .termsList li + li {
          margin-top: 5px;
        }
        @page {
          size: A4 portrait;
          margin: 10mm;
        }
        @media print {
          .no-print { display: none !important; }
          .page { max-width: none; min-height: auto; padding: 0; }
          .sheet { border-color: #cbbfe5; }
        }
      `}</style>

      <div className="page">
        <PrintActions />
        <div className="sheet" id="registration-sheet">
          <div className="head">
            <div className="brand">
              <img className="logoMark" src="/logo-second-room.png" alt="Logo Second Room" />
              <div>
                <p className="brandName">Second Room</p>
                <p className="brandTagline">Property & Kost Management</p>
              </div>
            </div>
            <div className="headerTitleWrap">
              <h1>Formulir Pendaftaran Penghuni</h1>
              <div className="docMeta">
                <strong>Tanggal Cetak:</strong> {today}
              </div>
            </div>
          </div>

          <div className="meta">
            <div className="metaBox">
              <div className="k">Status</div>
              <div className="v">{status}</div>
            </div>
            <div className="metaBox">
              <div className="k">Lokasi</div>
              <div className="v">{lokasiKos}</div>
            </div>
            <div className="metaBox">
              <div className="k">Unit / Kamar</div>
              <div className="v">
                {unitBlok} / {noKamar}
              </div>
            </div>
          </div>

          <div className="section">
            <h2 className="sectionTitle">Data Penghuni</h2>
            <div className="grid">
              <div className="cell label">Nama Lengkap</div><div className="cell value">{field(params, "namaLengkap")}</div>
              <div className="cell label">No. WhatsApp</div><div className="cell value">{field(params, "noWa")}</div>
              <div className="cell label">Tanggal Check In</div><div className="cell value">{tglCheckIn}</div>
              <div className="cell label">Tanggal Check Out</div><div className="cell value">{tglCheckOut}</div>
              <div className="cell label">Periode Sewa</div><div className="cell value">{periodeSewa === "—" ? "—" : `${periodeSewa} bulan`}</div>
              <div className="cell label">Harga Bulanan</div><div className="cell value">{field(params, "hargaBulanan")}</div>
              <div className="cell label">Booking Fee / Deposit</div><div className="cell value">{field(params, "bookingFee")}</div>
              <div className="cell label">Keterangan</div><div className="cell value">{field(params, "keterangan")}</div>
            </div>
          </div>

          <div className="terms">
            <p className="termsTitle">Keterangan Persetujuan</p>
            <ol className="termsList">
              <li>Penghuni telah membaca dan menyetujui peraturan dan tata tertib kos.</li>
              <li>Pembayaran kos dilakukan tepat waktu ketika tanggal check out.</li>
              <li>
                Penghuni bersedia untuk memberikan jaminan deposit kamar dengan nominal Rp. 500.000 (akan
                dikembalikan saat periode sewa habis dengan syarat dan ketentuan dari manajemen).
              </li>
            </ol>
          </div>

          <div className="footer">
            <div className="signBox">
              <div className="signLabel">Petugas Second Room</div>
            </div>
            <div className="signBox">
              <div className="signLabel">Penghuni</div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
