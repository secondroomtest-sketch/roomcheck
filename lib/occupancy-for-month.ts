/**
 * Okupansi historis per bulan kalender (YYYY-MM).
 * Dipakai dashboard Owner agar metrik mengikuti filter bulan P&L.
 */

import {
  isPlaceholderNoKamar,
  parseStartOfDayFromIso,
} from "@/lib/kamar-penghuni-sync";

export type OccupancyPenghuniSlice = {
  status: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  tglCheckIn: string;
  tglCheckOut: string;
};

export type OccupancyKamarSlice = {
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  status: string;
};

export function calendarMonthBounds(ym: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(String(ym ?? "").trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!y || mo < 1 || mo > 12) return null;
  return {
    start: new Date(y, mo - 1, 1),
    end: new Date(y, mo, 0),
  };
}

/** Apakah interval hunian penghuni overlap dengan bulan YYYY-MM. */
export function penghuniIntervalOverlapsMonth(p: OccupancyPenghuniSlice, ym: string): boolean {
  const status = String(p.status ?? "").trim();
  if (status === "Survey") return false;
  if (status !== "Booking" && status !== "Stay" && status !== "History") return false;
  if (isPlaceholderNoKamar(p.noKamar)) return false;

  const bounds = calendarMonthBounds(ym);
  if (!bounds) return false;

  const start = parseStartOfDayFromIso(p.tglCheckIn);
  if (!start) return false;

  const co = parseStartOfDayFromIso(p.tglCheckOut);
  let end: Date;
  if (co) {
    end = co;
  } else if (status === "History") {
    end = start;
  } else {
    /** Booking/Stay tanpa check-out: masih mengunci kamar dari check-in ke depan. */
    end = new Date(9999, 11, 31);
  }

  return start.getTime() <= bounds.end.getTime() && end.getTime() >= bounds.start.getTime();
}

function roomKey(lokasiKos: string, unitBlok: string, noKamar: string): string {
  return `${String(lokasiKos).trim()}|${String(unitBlok).trim()}|${String(noKamar).trim()}`;
}

/**
 * Hitung okupansi inventaris kamar untuk bulan tertentu (atau status real-time jika `ym` null/`""`).
 * Maintenance mengikuti status kamar terkini (tidak ada histori maintenance).
 */
export function computeKamarOccupancyStats(
  kamarRows: OccupancyKamarSlice[],
  penghuniRows: OccupancyPenghuniSlice[],
  ym?: string | null
): { total: number; terisi: number; kosong: number; maintenance: number; pct: number } {
  const total = kamarRows.length;
  const maintenance = kamarRows.filter((k) => k.status === "Maintenance").length;

  const useHistorical = Boolean(ym && calendarMonthBounds(ym));

  let terisi = 0;
  if (!useHistorical) {
    terisi = kamarRows.filter((k) => k.status === "Occupied").length;
  } else {
    const occupiedKeys = new Set<string>();
    for (const p of penghuniRows) {
      if (!penghuniIntervalOverlapsMonth(p, ym!)) continue;
      occupiedKeys.add(roomKey(p.lokasiKos, p.unitBlok, p.noKamar));
    }
    terisi = kamarRows.filter((k) => {
      if (k.status === "Maintenance") return false;
      return occupiedKeys.has(roomKey(k.lokasiKos, k.unitBlok, k.noKamar));
    }).length;
  }

  const kosong = Math.max(0, total - terisi - maintenance);
  const pct = total > 0 ? Math.round((terisi / total) * 100) : 0;
  return { total, terisi, kosong, maintenance, pct };
}
