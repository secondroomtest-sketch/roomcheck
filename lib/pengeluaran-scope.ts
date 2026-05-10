/** POS Pengeluaran di Master membagi beban antara P&amp;L kos vs P&amp;L manajemen. */
export type PengeluaranScope = "kos" | "manajemen";

export function normalizePengeluaranScope(raw: unknown): PengeluaranScope {
  const s = String(raw ?? "").trim().toLowerCase();
  return s === "manajemen" ? "manajemen" : "kos";
}

export function pengeluaranScopeForKategori(
  kategori: "Pemasukan" | "Pengeluaran",
  raw: unknown | undefined
): PengeluaranScope | undefined {
  if (kategori !== "Pengeluaran") return undefined;
  return normalizePengeluaranScope(raw);
}
