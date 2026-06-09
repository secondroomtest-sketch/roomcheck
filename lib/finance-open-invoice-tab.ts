import type { FinanceRow } from "@/components/finance-page-client";
import {
  financeInvoiceStorageKey,
  type FinanceInvoicePayloadV1,
} from "@/lib/finance-invoice-types";

export function financeRowToInvoicePayload(row: FinanceRow): FinanceInvoicePayloadV1 {
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
    keterangan: row.keterangan ?? "",
    pelaporanBulan: row.pelaporanBulan,
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
    return data?.v === 1 ? data : null;
  } catch {
    return null;
  }
}

export function openFinanceInvoiceTab(row: FinanceRow): boolean {
  if (typeof window === "undefined") return false;
  try {
    const payload = financeRowToInvoicePayload(row);
    const token = newInvoiceTabToken();
    writeFinanceInvoicePayload(token, payload);
    const tab = window.open(
      `/print/invoice?t=${encodeURIComponent(token)}`,
      "_blank",
      "noopener,noreferrer"
    );
    return Boolean(tab);
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
