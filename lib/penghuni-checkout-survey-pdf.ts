import jsPDF from "jspdf";
import { formatPenghuniStatusLabel } from "@/lib/penghuni-status-label";

export type PenghuniListPdfRow = {
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  status: string;
  tglCheckIn: string;
  tglCheckOut: string;
  noWa?: string;
  periodeSewa?: string;
  /** Harga sewa per bulan (ditampilkan di tabel Stay). */
  hargaBulanan?: string;
};

export type SurveyPdfRow = {
  namaLengkap: string;
  lokasiKos: string;
  unitBlok: string;
  periodeSewa: string;
  rencanaCheckIn: string;
  noWa: string;
  negosiasiHarga?: string;
};

type DownloadArgs = {
  bookingRows: PenghuniListPdfRow[];
  stayRows: PenghuniListPdfRow[];
  checkoutRows: PenghuniListPdfRow[];
  surveyRows: SurveyPdfRow[];
  filterNote?: string;
  /** Nama user yang mengunduh laporan. */
  downloadedBy?: string;
};

type Col = { label: string; w: number };

type Rgb = [number, number, number];

type SectionTheme = {
  titleBg: Rgb;
  titleFg: Rgb;
  headerBg: Rgb;
  headerFg: Rgb;
  stripeBg: Rgb;
  border: Rgb;
};

const MARGIN_X = 12;
const TABLE_WIDTH = 273; // landscape A4 usable ~297 - 24
const ROW_H = 7;
const HEADER_H = 7.5;
const TITLE_H = 8;

/** Booking & Check Out — + kolom No. */
const PENGHUNI_COLS: Col[] = [
  { label: "No.", w: 10 },
  { label: "Nama", w: 40 },
  { label: "Lokasi", w: 50 },
  { label: "Unit", w: 18 },
  { label: "Kamar", w: 14 },
  { label: "Status", w: 28 },
  { label: "Periode", w: 14 },
  { label: "Check-in", w: 22 },
  { label: "Check-out", w: 22 },
  { label: "WA", w: 55 },
];

/** Stay — Lokasi diperlebar; harga sewa/bulan tetap ditampilkan. */
const STAY_COLS: Col[] = [
  { label: "No.", w: 9 },
  { label: "Nama", w: 34 },
  { label: "Lokasi", w: 52 },
  { label: "Unit", w: 16 },
  { label: "Kamar", w: 12 },
  { label: "Status", w: 16 },
  { label: "Harga/bln", w: 28 },
  { label: "Periode", w: 12 },
  { label: "Check-in", w: 20 },
  { label: "Check-out", w: 20 },
  { label: "WA", w: 54 },
];

const SURVEY_COLS: Col[] = [
  { label: "No.", w: 10 },
  { label: "Nama", w: 40 },
  { label: "Lokasi", w: 50 },
  { label: "Unit", w: 24 },
  { label: "Periode", w: 18 },
  { label: "Rencana CI", w: 26 },
  { label: "Negosiasi", w: 34 },
  { label: "WA", w: 71 },
];

const LINE_H = 3.5;
const ROW_PAD_Y = 1.6;
const MAX_WRAP_LINES = 4;

const THEME_BOOKING: SectionTheme = {
  titleBg: [77, 109, 255],
  titleFg: [255, 255, 255],
  headerBg: [219, 227, 255],
  headerFg: [35, 48, 120],
  stripeBg: [245, 247, 255],
  border: [180, 194, 240],
};

const THEME_STAY: SectionTheme = {
  titleBg: [16, 145, 110],
  titleFg: [255, 255, 255],
  headerBg: [209, 250, 229],
  headerFg: [6, 78, 59],
  stripeBg: [240, 253, 244],
  border: [134, 210, 180],
};

const THEME_CHECKOUT: SectionTheme = {
  titleBg: [82, 82, 91],
  titleFg: [255, 255, 255],
  headerBg: [228, 228, 231],
  headerFg: [39, 39, 42],
  stripeBg: [250, 250, 250],
  border: [180, 180, 188],
};

const THEME_SURVEY: SectionTheme = {
  titleBg: [180, 110, 20],
  titleFg: [255, 255, 255],
  headerBg: [254, 243, 199],
  headerFg: [120, 53, 15],
  stripeBg: [255, 251, 235],
  border: [230, 190, 120],
};

function text(v: string | undefined | null): string {
  const s = String(v ?? "").trim();
  return s || "—";
}

function formatHargaBulananPdf(v: string | undefined | null): string {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (!digits) return "—";
  const n = Number(digits);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return `Rp ${n.toLocaleString("id-ID")}`;
}

function colStarts(cols: Col[]): number[] {
  const xs: number[] = [];
  let x = MARGIN_X + 2;
  for (const c of cols) {
    xs.push(x);
    x += c.w;
  }
  return xs;
}

function clipCell(doc: jsPDF, value: string, maxW: number): string {
  const raw = text(value);
  if (doc.getTextWidth(raw) <= maxW) return raw;
  const ellipsis = "…";
  let out = raw;
  while (out.length > 1 && doc.getTextWidth(out + ellipsis) > maxW) {
    out = out.slice(0, -1);
  }
  return `${out}${ellipsis}`;
}

/** Pecah teks ke beberapa baris agar tidak terpotong (nama/lokasi panjang). */
function wrapTextLines(doc: jsPDF, value: string, maxW: number, maxLines = MAX_WRAP_LINES): string[] {
  const raw = text(value);
  if (doc.getTextWidth(raw) <= maxW) return [raw];

  const lines: string[] = [];

  const flushCharWrapped = (word: string) => {
    let chunk = "";
    for (const ch of word) {
      const trial = chunk + ch;
      if (doc.getTextWidth(trial) <= maxW) {
        chunk = trial;
      } else {
        if (chunk) lines.push(chunk);
        chunk = ch;
        if (lines.length >= maxLines) return;
      }
    }
    if (chunk && lines.length < maxLines) lines.push(chunk);
  };

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    flushCharWrapped(raw);
    return lines.length ? lines.slice(0, maxLines) : [raw];
  }

  let current = "";
  for (const word of words) {
    if (lines.length >= maxLines) break;
    const trial = current ? `${current} ${word}` : word;
    if (doc.getTextWidth(trial) <= maxW) {
      current = trial;
      continue;
    }
    if (current) {
      lines.push(current);
      current = "";
      if (lines.length >= maxLines) break;
    }
    if (doc.getTextWidth(word) <= maxW) {
      current = word;
    } else {
      flushCharWrapped(word);
      current = "";
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  return lines.length ? lines.slice(0, maxLines) : [raw];
}

function rowHeightForLineCount(lineCount: number): number {
  const n = Math.max(1, lineCount);
  return Math.max(ROW_H, n * LINE_H + ROW_PAD_Y * 2);
}

const PAGE_BOTTOM = 12;
const PAGE_TOP = 16;

function needsNewPage(doc: jsPDF, y: number, need: number): boolean {
  const pageH = doc.internal.pageSize.getHeight();
  return y + need > pageH - PAGE_BOTTOM;
}

function ensureSpace(doc: jsPDF, y: number, need: number): number {
  if (needsNewPage(doc, y, need)) {
    doc.addPage();
    return PAGE_TOP;
  }
  return y;
}

function drawSectionTitle(
  doc: jsPDF,
  y: number,
  title: string,
  count: number,
  theme: SectionTheme,
  continued = false
): number {
  doc.setFillColor(...theme.titleBg);
  doc.roundedRect(MARGIN_X, y - 5, TABLE_WIDTH, TITLE_H, 1.2, 1.2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...theme.titleFg);
  const suffix = continued ? "  ·  (lanjutan)" : `  ·  ${count} data`;
  doc.text(`${title}${suffix}`, MARGIN_X + 3.5, y + 0.8);
  return y + TITLE_H + 1;
}

function drawHeaderRow(doc: jsPDF, y: number, cols: Col[], theme: SectionTheme): number {
  const xs = colStarts(cols);
  doc.setFillColor(...theme.headerBg);
  doc.setDrawColor(...theme.border);
  doc.setLineWidth(0.2);
  doc.rect(MARGIN_X, y - 4.5, TABLE_WIDTH, HEADER_H, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...theme.headerFg);
  cols.forEach((c, i) => {
    doc.text(c.label, xs[i]!, y + 1);
  });
  return y + HEADER_H;
}

/** Mulai blok tabel: judul + header kolom (halaman baru bila perlu). */
function openTableBlock(
  doc: jsPDF,
  y: number,
  title: string,
  count: number,
  cols: Col[],
  theme: SectionTheme,
  continued = false
): number {
  const blockH = TITLE_H + HEADER_H + ROW_H + 6;
  y = ensureSpace(doc, y, blockH);
  y = drawSectionTitle(doc, y, title, count, theme, continued);
  return drawHeaderRow(doc, y, cols, theme);
}

/** Jika baris tak muat, pindah halaman dan ulang judul + header kolom. */
function ensureRowWithRepeatedHeader(
  doc: jsPDF,
  y: number,
  title: string,
  count: number,
  cols: Col[],
  theme: SectionTheme,
  needH = ROW_H + 1
): number {
  if (!needsNewPage(doc, y, needH)) return y;
  doc.addPage();
  return openTableBlock(doc, PAGE_TOP, title, count, cols, theme, true);
}

function drawEmptyRow(doc: jsPDF, y: number, message: string, theme: SectionTheme): number {
  y = ensureSpace(doc, y, ROW_H + 2);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(...theme.border);
  doc.rect(MARGIN_X, y - 4.5, TABLE_WIDTH, ROW_H, "FD");
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8);
  doc.setTextColor(110, 100, 90);
  doc.text(message, MARGIN_X + 3, y + 0.8);
  return y + ROW_H + 6;
}

function drawDataRow(
  doc: jsPDF,
  y: number,
  cols: Col[],
  xs: number[],
  cells: string[],
  theme: SectionTheme,
  stripe: boolean
): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.2);
  const wrapped = cells.map((val, i) => wrapTextLines(doc, val, cols[i]!.w - 2.5));
  const lineCount = Math.max(1, ...wrapped.map((lines) => lines.length));
  const rowH = rowHeightForLineCount(lineCount);

  if (stripe) {
    doc.setFillColor(...theme.stripeBg);
    doc.rect(MARGIN_X, y - 4.5, TABLE_WIDTH, rowH, "F");
  }
  doc.setDrawColor(...theme.border);
  doc.setLineWidth(0.15);
  doc.line(MARGIN_X, y - 4.5 + rowH, MARGIN_X + TABLE_WIDTH, y - 4.5 + rowH);

  doc.setTextColor(35, 35, 40);
  wrapped.forEach((lines, i) => {
    lines.forEach((line, li) => {
      doc.text(line, xs[i]!, y - 4.5 + ROW_PAD_Y + 2.4 + li * LINE_H);
    });
  });
  return y + rowH;
}

function drawPenghuniSection(
  doc: jsPDF,
  y: number,
  title: string,
  rows: PenghuniListPdfRow[],
  emptyLabel: string,
  theme: SectionTheme,
  opts?: { showHargaBulanan?: boolean }
): number {
  const cols = opts?.showHargaBulanan ? STAY_COLS : PENGHUNI_COLS;
  y = openTableBlock(doc, y, title, rows.length, cols, theme);
  const xs = colStarts(cols);

  if (rows.length === 0) {
    return drawEmptyRow(doc, y, emptyLabel, theme);
  }

  rows.forEach((row, idx) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const cells = opts?.showHargaBulanan
      ? [
          String(idx + 1),
          text(row.namaLengkap),
          text(row.lokasiKos),
          text(row.unitBlok),
          text(row.noKamar),
          formatPenghuniStatusLabel(row.status),
          formatHargaBulananPdf(row.hargaBulanan),
          text(row.periodeSewa ? `${row.periodeSewa} bln` : ""),
          text(row.tglCheckIn),
          text(row.tglCheckOut),
          text(row.noWa),
        ]
      : [
          String(idx + 1),
          text(row.namaLengkap),
          text(row.lokasiKos),
          text(row.unitBlok),
          text(row.noKamar),
          formatPenghuniStatusLabel(row.status),
          text(row.periodeSewa ? `${row.periodeSewa} bln` : ""),
          text(row.tglCheckIn),
          text(row.tglCheckOut),
          text(row.noWa),
        ];
    const previewLines = Math.max(
      1,
      ...cells.map((val, i) => wrapTextLines(doc, val, cols[i]!.w - 2.5).length)
    );
    const needH = rowHeightForLineCount(previewLines) + 1;
    y = ensureRowWithRepeatedHeader(doc, y, title, rows.length, cols, theme, needH);
    y = drawDataRow(doc, y, cols, xs, cells, theme, idx % 2 === 1);
  });

  return y + 7;
}

function drawSurveySection(doc: jsPDF, y: number, rows: SurveyPdfRow[], theme: SectionTheme): number {
  const title = "4. Calon Penghuni — Survey";
  y = openTableBlock(doc, y, title, rows.length, SURVEY_COLS, theme);
  const xs = colStarts(SURVEY_COLS);

  if (rows.length === 0) {
    return drawEmptyRow(doc, y, "Tidak ada data survey.", theme);
  }

  rows.forEach((row, idx) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.2);
    const cells = [
      String(idx + 1),
      text(row.namaLengkap),
      text(row.lokasiKos),
      text(row.unitBlok),
      text(row.periodeSewa ? `${row.periodeSewa} bln` : ""),
      text(row.rencanaCheckIn),
      text(row.negosiasiHarga),
      text(row.noWa),
    ];
    const previewLines = Math.max(
      1,
      ...cells.map((val, i) => wrapTextLines(doc, val, SURVEY_COLS[i]!.w - 2.5).length)
    );
    const needH = rowHeightForLineCount(previewLines) + 1;
    y = ensureRowWithRepeatedHeader(doc, y, title, rows.length, SURVEY_COLS, theme, needH);
    y = drawDataRow(doc, y, SURVEY_COLS, xs, cells, theme, idx % 2 === 1);
  });

  return y + 7;
}

/** Unduh PDF list seluruh penghuni: Booking, Stay, Check Out, Survey. Landscape A4. */
export function downloadPenghuniListsPdf(args: DownloadArgs): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const now = new Date();
  const stamp = now.toLocaleString("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const by = String(args.downloadedBy ?? "").trim() || "—";

  let y = 14;
  doc.setFillColor(36, 42, 90);
  doc.roundedRect(MARGIN_X, y - 6, TABLE_WIDTH, 20, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("Second Room — Laporan List Penghuni", MARGIN_X + 4, y + 0.5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(220, 226, 255);
  doc.text(`Dicetak: ${stamp}`, MARGIN_X + 4, y + 7);
  doc.text(`Diunduh oleh: ${clipCell(doc, by, 120)}`, MARGIN_X + 4, y + 11.5);
  y += 20;

  if (args.filterNote?.trim()) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(70, 70, 85);
    doc.text(args.filterNote.trim(), MARGIN_X, y);
    y += 6;
  }

  y = drawPenghuniSection(
    doc,
    y,
    "1. Penghuni Booking",
    args.bookingRows,
    "Tidak ada data Booking.",
    THEME_BOOKING
  );
  y = drawPenghuniSection(doc, y, "2. Penghuni Stay", args.stayRows, "Tidak ada data Stay.", THEME_STAY, {
    showHargaBulanan: true,
  });
  y = drawPenghuniSection(
    doc,
    y,
    "3. Penghuni Check Out",
    args.checkoutRows,
    "Tidak ada data Penghuni Check Out.",
    THEME_CHECKOUT
  );
  drawSurveySection(doc, y, args.surveyRows, THEME_SURVEY);

  const ymd = now.toISOString().slice(0, 10);
  doc.save(`laporan-list-penghuni-${ymd}.pdf`);
}
