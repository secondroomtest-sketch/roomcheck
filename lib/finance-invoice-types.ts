export const FINANCE_INVOICE_STORAGE_KEY = "secondroom_finance_invoice_v1";

export function financeInvoiceStorageKey(token: string): string {
  return `${FINANCE_INVOICE_STORAGE_KEY}:${token}`;
}

export type FinanceInvoicePayloadV1 = {
  v: 1;
  id: string;
  noNota: string;
  kategori: "Pemasukan" | "Pengeluaran";
  pos: string;
  tanggal: string;
  namaPenghuni: string;
  lokasiKos: string;
  unitBlok: string;
  nominal: string;
  keterangan: string;
  pelaporanBulan?: string;
  generatedAt: string;
};
