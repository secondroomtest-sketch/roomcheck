import type { FinanceRow } from "@/components/finance-page-client";
import {
  financeInvoiceStorageKey,
  type FinanceInvoicePayloadV1,
} from "@/lib/finance-invoice-types";
import {
  isBookingFeeFinancePos,
  isSewaKamarFinancePos,
} from "@/lib/penghuni-finance-payment-sync";
import { readSandboxJson, SB_KEY } from "@/lib/sandbox-storage";
import { supabase } from "@/libsupabaseClient";

export type InvoiceStayDates = {
  tglCheckIn?: string;
  tglCheckOut?: string;
};

/** Hapus segmen internal (perhitungan / bulan laporan / dibayar) dari keterangan invoice. */
export function stripInvoicePerhitunganKeterangan(raw: string): string {
  let text = String(raw ?? "").trim();
  if (!text) return "";
  text = text.replace(/(?:^|\s*[·•|]\s*)Perhitungan:\s*[^=]*?=\s*[^.]*\./gi, "");
  text = text.replace(/(?:^|\s*[·•|]\s*)Bulan laporan:\s*[^·•|]*/gi, "");
  text = text.replace(/(?:^|\s*[·•|]\s*)Dibayar:\s*[^·•|]*/gi, "");
  text = text.replace(/\s*[·•]\s*[·•]\s*/g, " · ");
  text = text.replace(/^\s*[·•]\s*|\s*[·•]\s*$/g, "");
  text = text.replace(/\s{2,}/g, " ").trim();
  return text;
}

export function invoiceNeedsPenghuniStayDates(row: Pick<FinanceRow, "kategori" | "pos">): boolean {
  if (row.kategori !== "Pemasukan") return false;
  return isSewaKamarFinancePos(row.pos) || isBookingFeeFinancePos(row.pos);
}

type PenghuniStaySlice = {
  namaLengkap?: string;
  nama_lengkap?: string;
  lokasiKos?: string;
  lokasi_kos?: string;
  unitBlok?: string;
  unit_blok?: string;
  tglCheckIn?: string;
  tgl_check_in?: string | null;
  tglCheckOut?: string;
  tgl_check_out?: string | null;
  sewaKamarNota?: string;
  sewa_kamar_nota?: string | null;
};

function norm(v: unknown): string {
  return String(v ?? "").trim().toLowerCase();
}

function pickStayDates(p: PenghuniStaySlice): InvoiceStayDates {
  const tglCheckIn = String(p.tglCheckIn ?? p.tgl_check_in ?? "").trim();
  const tglCheckOut = String(p.tglCheckOut ?? p.tgl_check_out ?? "").trim();
  return {
    tglCheckIn: tglCheckIn && tglCheckIn !== "-" ? tglCheckIn : "",
    tglCheckOut: tglCheckOut && tglCheckOut !== "-" ? tglCheckOut : "",
  };
}

function matchPenghuniForInvoice(
  list: PenghuniStaySlice[],
  row: {
    noNota?: string;
    pos?: string;
    namaPenghuni?: string;
    lokasiKos?: string;
    unitBlok?: string;
  }
): PenghuniStaySlice | null {
  const nota = String(row.noNota ?? "").trim();
  const nama = norm(row.namaPenghuni);
  const lokasi = norm(row.lokasiKos);
  const unit = norm(row.unitBlok);

  if (nota && isSewaKamarFinancePos(row.pos ?? "")) {
    const byNota = list.find((p) => String(p.sewaKamarNota ?? p.sewa_kamar_nota ?? "").trim() === nota);
    if (byNota) return byNota;
  }

  if (nama) {
    const byIdentity = list.find((p) => {
      const pNama = norm(p.namaLengkap ?? p.nama_lengkap);
      if (pNama !== nama) return false;
      const pLokasi = norm(p.lokasiKos ?? p.lokasi_kos);
      const pUnit = norm(p.unitBlok ?? p.unit_blok);
      if (lokasi && pLokasi && pLokasi !== lokasi) return false;
      if (unit && pUnit && pUnit !== unit) return false;
      return true;
    });
    if (byIdentity) return byIdentity;
  }

  return null;
}

export async function resolvePenghuniStayDatesForInvoice(
  row: {
    kategori: "Pemasukan" | "Pengeluaran";
    pos: string;
    noNota?: string;
    namaPenghuni?: string;
    lokasiKos?: string;
    unitBlok?: string;
  },
  options?: { sandbox?: boolean }
): Promise<InvoiceStayDates | null> {
  if (!invoiceNeedsPenghuniStayDates(row)) return null;

  try {
    if (options?.sandbox) {
      const list = readSandboxJson<PenghuniStaySlice[]>(SB_KEY.penghuni, []);
      const match = matchPenghuniForInvoice(list, row);
      return match ? pickStayDates(match) : null;
    }

    const nota = String(row.noNota ?? "").trim();
    const nama = String(row.namaPenghuni ?? "").trim();

    if (nota && isSewaKamarFinancePos(row.pos)) {
      const { data, error } = await supabase
        .from("penghuni")
        .select("nama_lengkap, lokasi_kos, unit_blok, tgl_check_in, tgl_check_out, sewa_kamar_nota")
        .eq("sewa_kamar_nota", nota)
        .maybeSingle();
      if (!error && data) return pickStayDates(data as PenghuniStaySlice);
    }

    if (nama) {
      let query = supabase
        .from("penghuni")
        .select("nama_lengkap, lokasi_kos, unit_blok, tgl_check_in, tgl_check_out, sewa_kamar_nota")
        .eq("nama_lengkap", nama)
        .limit(8);

      const lokasi = String(row.lokasiKos ?? "").trim();
      const unit = String(row.unitBlok ?? "").trim();
      if (lokasi) query = query.eq("lokasi_kos", lokasi);
      if (unit) query = query.eq("unit_blok", unit);

      const { data, error } = await query;
      if (error || !data?.length) return null;
      const list = data as PenghuniStaySlice[];
      const match = matchPenghuniForInvoice(list, row) ?? list[0] ?? null;
      return match ? pickStayDates(match) : null;
    }
  } catch {
    return null;
  }

  return null;
}

export function financeRowToInvoicePayload(
  row: FinanceRow,
  stay?: InvoiceStayDates | null
): FinanceInvoicePayloadV1 {
  return {
    v: 1,
    id: row.id,
    noNota: row.noNota,
    kategori: row.kategori,
    pos: row.pos,
    tanggal: row.tanggal,
    namaPenghuni: row.namaPenghuni ?? "",
    lokasiKos: row.lokasiKos ?? "",
    unitBlok: row.unitBlok ?? "",
    nominal: row.nominal,
    keterangan: stripInvoicePerhitunganKeterangan(row.keterangan ?? ""),
    pelaporanBulan: row.pelaporanBulan,
    tglCheckIn: stay?.tglCheckIn || undefined,
    tglCheckOut: stay?.tglCheckOut || undefined,
    generatedAt: new Date().toISOString(),
  };
}

function newInvoiceTabToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** localStorage (bukan sessionStorage) — tab baru punya sessionStorage terpisah. */
export function writeFinanceInvoicePayload(token: string, payload: FinanceInvoicePayloadV1): void {
  localStorage.setItem(financeInvoiceStorageKey(token), JSON.stringify(payload));
}

export function readFinanceInvoicePayload(token: string): FinanceInvoicePayloadV1 | null {
  try {
    const raw = localStorage.getItem(financeInvoiceStorageKey(token));
    if (!raw) return null;
    const data = JSON.parse(raw) as FinanceInvoicePayloadV1;
    if (data?.v !== 1) return null;
    return {
      ...data,
      keterangan: stripInvoicePerhitunganKeterangan(data.keterangan ?? ""),
    };
  } catch {
    return null;
  }
}

/** Buka tab invoice secara sync (wajib tetap sync agar tidak diblokir popup). */
export function openFinanceInvoiceTab(row: FinanceRow): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload = financeRowToInvoicePayload(row);
    const token = newInvoiceTabToken();
    writeFinanceInvoicePayload(token, payload);
    window.open(`/print/invoice?t=${encodeURIComponent(token)}`, "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}

export function formatInvoiceNominal(raw: string): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return raw?.trim() ? raw : "—";
  return `Rp ${Number(digits).toLocaleString("id-ID")}`;
}

export function formatInvoiceDateLong(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw || raw === "—") return "—";
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  let date: Date;
  if (isoMatch) {
    date = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
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

export function invoicePdfFileName(noNota: string): string {
  const safe = String(noNota ?? "transaksi")
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `invoice-second-room-${safe || "transaksi"}.pdf`;
}
