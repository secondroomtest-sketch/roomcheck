/**
 * POS yang dikecualikan dari ringkasan revenue dashboard untuk akses **owner**
 * (deposit/booking tidak menggerus total revenue tampilan owner).
 */
export function isExcludedFromOwnerDashboardRevenue(pos: string): boolean {
  const p = (pos ?? "").trim().toLowerCase();
  if (!p) return false;
  return p === "deposit kamar" || p === "booking kamar" || p === "booking fee";
}
