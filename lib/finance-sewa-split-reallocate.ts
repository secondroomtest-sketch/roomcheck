import { normalizeNotaKey } from "@/lib/finance-nota-validation";
import {
  buildSewaSplitCalendarMonthStarts,
  splitSewaNominalBookingFeeFirstMonth,
  startOfCalendarMonthYmd,
} from "@/lib/finance-sewa-split";
import {
  FINANCE_POS_SEWA_KAMAR,
  isBookingFeeFinancePos,
  isSewaKamarFinancePos,
} from "@/lib/penghuni-finance-payment-sync";

export type SewaSplitFinanceSlice = {
  id: string;
  noNota: string;
  pos: string;
  nominal: string | number;
  pelaporanBulan?: string;
  tanggal?: string;
  paymentSplitGroupId?: string;
  kategori?: string;
  namaPenghuni?: string;
  lokasiKos?: string;
  unitBlok?: string;
  keterangan?: string;
};

export type SewaSplitPenghuniSlice = {
  hargaBulanan: number;
  periodeBulan: number;
  bookingFee: number;
  bookingFeePaid?: boolean;
  sewaKamarNota?: string;
  bookingFeeNota?: string;
  cycleStartYmd?: string;
};

export type SewaSplitNominalPatch = {
  id: string;
  nominal: number;
  pelaporanBulan?: string;
};

export type BookingFeePosToSewaPatch = {
  id: string;
  pos: typeof FINANCE_POS_SEWA_KAMAR;
  pelaporanBulan: string;
};

/** Baris baru hasil pecah nota sewa yang tadinya 1 baris. */
export type SewaSplitExpandInsert = {
  templateId: string;
  noNota: string;
  tanggal: string;
  nominal: number;
  pelaporanBulan: string;
  kategori: string;
  pos: string;
  namaPenghuni: string;
  lokasiKos: string;
  unitBlok: string;
  keterangan: string;
  paymentSplitGroupId?: string;
};

export type SewaSplitReallocationPlan = {
  bookingFeePosPatches: BookingFeePosToSewaPatch[];
  patches: SewaSplitNominalPatch[];
  deleteIds: string[];
  expandInserts: SewaSplitExpandInsert[];
};

function parseNominal(v: string | number): number {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.round(v));
  return Math.max(0, Math.round(Number(String(v ?? "").replace(/\D/g, "")) || 0));
}

function groupKey(row: SewaSplitFinanceSlice): string {
  const gid = String(row.paymentSplitGroupId ?? "").trim();
  if (gid) return `gid:${gid}`;
  return `nota:${normalizeNotaKey(row.noNota)}`;
}

function sortKey(row: SewaSplitFinanceSlice): string {
  const pel = String(row.pelaporanBulan ?? "").trim().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(pel)) return pel;
  return String(row.tanggal ?? "").trim().slice(0, 10);
}

function slotsFromPenghuni(
  penghuni: SewaSplitPenghuniSlice,
  paidTotal: number,
  fallbackYmd: string
): Array<{ pelaporanBulan: string; nominal: number }> {
  const n = Math.max(0, Math.floor(penghuni.periodeBulan || 0));
  if (n <= 0 || paidTotal <= 0) return [];
  const credit = penghuni.bookingFeePaid ? Math.max(0, Math.round(penghuni.bookingFee || 0)) : 0;
  const monthStarts = buildSewaSplitCalendarMonthStarts(penghuni.cycleStartYmd, n, fallbackYmd);
  if (monthStarts.length !== n) return [];
  const parts = splitSewaNominalBookingFeeFirstMonth({
    hargaBulanan: penghuni.hargaBulanan,
    periodeBulan: n,
    bookingFeeCredited: credit,
    paidTotal,
  });
  return monthStarts
    .map((pel, i) => ({ pelaporanBulan: pel, nominal: parts[i] ?? 0 }))
    .filter((s) => s.nominal > 0);
}

/**
 * Model A: booking fee lama (POS Booking fee) → Sewa kamar di bulan pertama siklus.
 */
export function planConvertBookingFeePosToSewaKamar(
  financeRows: SewaSplitFinanceSlice[],
  penghuniRows: SewaSplitPenghuniSlice[]
): BookingFeePosToSewaPatch[] {
  const out: BookingFeePosToSewaPatch[] = [];
  for (const p of penghuniRows) {
    if (!p.bookingFeePaid) continue;
    const nk = normalizeNotaKey(String(p.bookingFeeNota ?? ""));
    if (!nk) continue;
    const pel = startOfCalendarMonthYmd(String(p.cycleStartYmd ?? "")) || "";
    for (const row of financeRows) {
      if (normalizeNotaKey(row.noNota) !== nk) continue;
      if (!isBookingFeeFinancePos(row.pos)) continue;
      const pelaporanBulan =
        pel ||
        startOfCalendarMonthYmd(String(row.pelaporanBulan ?? "")) ||
        startOfCalendarMonthYmd(String(row.tanggal ?? ""));
      if (!pelaporanBulan) continue;
      out.push({ id: row.id, pos: FINANCE_POS_SEWA_KAMAR, pelaporanBulan });
    }
  }
  return out;
}

/**
 * Perbaiki alokasi sewa:
 * - konversi POS Booking fee → Sewa kamar bulan-1
 * - pecah nota sisa sewa 1 baris menjadi N bulan sesuai periode penghuni
 * - rapikan pecahan yang sudah multi-baris; hapus nominal 0
 */
export function planSewaSplitBookingFeeFirstMonthReallocation(
  financeRows: SewaSplitFinanceSlice[],
  penghuniRows: SewaSplitPenghuniSlice[]
): SewaSplitReallocationPlan {
  const bookingFeePosPatches = planConvertBookingFeePosToSewaKamar(financeRows, penghuniRows);

  const posOverride = new Map(bookingFeePosPatches.map((p) => [p.id, p]));
  const workingRows: SewaSplitFinanceSlice[] = financeRows.map((r) => {
    const ov = posOverride.get(r.id);
    if (!ov) return r;
    return { ...r, pos: ov.pos, pelaporanBulan: ov.pelaporanBulan };
  });

  const bfNotaKeys = new Set(
    penghuniRows
      .map((p) => normalizeNotaKey(String(p.bookingFeeNota ?? "")))
      .filter(Boolean)
  );

  const penghuniBySewaNota = new Map<string, SewaSplitPenghuniSlice>();
  for (const p of penghuniRows) {
    const nk = normalizeNotaKey(String(p.sewaKamarNota ?? ""));
    if (!nk) continue;
    penghuniBySewaNota.set(nk, p);
  }

  const sewaRows = workingRows.filter(
    (r) =>
      isSewaKamarFinancePos(r.pos) &&
      normalizeNotaKey(r.noNota) &&
      !bfNotaKeys.has(normalizeNotaKey(r.noNota))
  );
  const groups = new Map<string, SewaSplitFinanceSlice[]>();
  for (const r of sewaRows) {
    const k = groupKey(r);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }

  const patches: SewaSplitNominalPatch[] = [];
  const deleteIds: string[] = [];
  const expandInserts: SewaSplitExpandInsert[] = [];

  for (const rows of groups.values()) {
    const notaKey = normalizeNotaKey(rows[0]!.noNota);
    const penghuni = penghuniBySewaNota.get(notaKey);
    const ordered = [...rows].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
    const paidTotal = ordered.reduce((s, r) => s + parseNominal(r.nominal), 0);

    if (!penghuni) {
      for (const row of ordered) {
        if (parseNominal(row.nominal) <= 0) deleteIds.push(row.id);
      }
      continue;
    }

    const periode = Math.max(0, Math.floor(penghuni.periodeBulan || 0));
    if (periode <= 0 || paidTotal <= 0) {
      for (const row of ordered) {
        if (parseNominal(row.nominal) <= 0) deleteIds.push(row.id);
      }
      continue;
    }

    // Periode 1 & sudah 1 baris: cukup pastikan tidak 0.
    if (periode === 1 && ordered.length === 1) {
      if (parseNominal(ordered[0]!.nominal) <= 0) deleteIds.push(ordered[0]!.id);
      continue;
    }

    const fallbackYmd =
      String(ordered[0]?.tanggal ?? "").trim().slice(0, 10) ||
      String(penghuni.cycleStartYmd ?? "").trim().slice(0, 10);
    const slots = slotsFromPenghuni(penghuni, paidTotal, fallbackYmd);
    if (slots.length === 0) {
      for (const row of ordered) {
        if (parseNominal(row.nominal) <= 0) deleteIds.push(row.id);
      }
      continue;
    }

    const template = ordered[0]!;
    const splitGid =
      String(template.paymentSplitGroupId ?? "").trim() ||
      `repair-${normalizeNotaKey(template.noNota)}`;

    // Sinkronkan baris existing ke slot; sisanya insert / hapus.
    const nKeep = Math.min(ordered.length, slots.length);
    for (let i = 0; i < nKeep; i++) {
      const row = ordered[i]!;
      const slot = slots[i]!;
      const curNom = parseNominal(row.nominal);
      const curPel = startOfCalendarMonthYmd(String(row.pelaporanBulan ?? "")) || "";
      if (curNom !== slot.nominal || curPel !== slot.pelaporanBulan) {
        patches.push({
          id: row.id,
          nominal: slot.nominal,
          pelaporanBulan: slot.pelaporanBulan,
        });
      }
    }

    for (let i = nKeep; i < ordered.length; i++) {
      deleteIds.push(ordered[i]!.id);
    }

    for (let i = nKeep; i < slots.length; i++) {
      const slot = slots[i]!;
      const niceMonth = new Date(`${slot.pelaporanBulan}T12:00:00`).toLocaleDateString("id-ID", {
        month: "long",
        year: "numeric",
      });
      const partLabel = `${i + 1}/${periode}`;
      expandInserts.push({
        templateId: template.id,
        noNota: template.noNota,
        tanggal: String(template.tanggal ?? fallbackYmd).slice(0, 10),
        nominal: slot.nominal,
        pelaporanBulan: slot.pelaporanBulan,
        kategori: String(template.kategori ?? "Pemasukan"),
        pos: FINANCE_POS_SEWA_KAMAR,
        namaPenghuni: String(template.namaPenghuni ?? ""),
        lokasiKos: String(template.lokasiKos ?? ""),
        unitBlok: String(template.unitBlok ?? ""),
        keterangan: `Payment sewa kamar (split perbaikan) · Bulan laporan: ${niceMonth} (${partLabel})`,
        paymentSplitGroupId: splitGid,
      });
    }
  }

  return {
    bookingFeePosPatches,
    patches,
    deleteIds: [...new Set(deleteIds)],
    expandInserts,
  };
}
