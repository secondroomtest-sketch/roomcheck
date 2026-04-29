/**
 * Sinkron status kamar ↔ penghuni (Booking/Stay).
 * Dipakai halaman Penghuni (write) dan Kamar (read/tampilan).
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type PenghuniForKamarSync = {
  status: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  sewaKamarPaid?: boolean;
  namaLengkap: string;
  tglCheckOut: string;
};

/** Awal hari lokal untuk string YYYY-MM-DD; null jika tidak valid. */
export function parseStartOfDayFromIso(iso: string): Date | null {
  const t = String(iso ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function startOfLocalToday(): Date {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), today.getDate());
}

/** Check-out sudah lewat (hari check-out tidak lagi dihitung terisi). */
export function isCheckoutDateBeforeToday(tglCheckOut: string): boolean {
  const co = parseStartOfDayFromIso(tglCheckOut);
  if (!co) return false;
  return co.getTime() < startOfLocalToday().getTime();
}

/** Penghuni masih menempati kamar untuk tampilan / sinkron (bukan Maintenance). */
export function penghuniCountsAsOccupyingKamar(p: PenghuniForKamarSync): boolean {
  if (p.status !== "Booking" && p.status !== "Stay") return false;
  const lok = (p.lokasiKos ?? "").trim();
  const unit = (p.unitBlok ?? "").trim();
  const nk = (p.noKamar ?? "").trim();
  if (!lok || !unit || !nk || nk === "All Room") return false;
  /** Stay + sewa lunas + check-out lewat → kamar dianggap kosong lagi. */
  if (p.status === "Stay" && p.sewaKamarPaid && isCheckoutDateBeforeToday(p.tglCheckOut)) {
    return false;
  }
  return true;
}

export type OccupiedCheckoutVisual = "checkout_today" | "checkout_soon" | "checkout_overdue_unpaid" | null;

/** Tanda tambahan pada kartu kamar Occupied (berdasarkan data penghuni yang match). */
export function getOccupiedCheckoutVisual(p: PenghuniForKamarSync | null): OccupiedCheckoutVisual {
  if (!p || p.status !== "Stay") return null;
  const co = parseStartOfDayFromIso(p.tglCheckOut);
  if (!co) return null;
  const startToday = startOfLocalToday();
  const days = Math.round((co.getTime() - startToday.getTime()) / MS_PER_DAY);
  if (days < 0) {
    return p.sewaKamarPaid ? null : "checkout_overdue_unpaid";
  }
  if (days === 0) return "checkout_today";
  if (days > 0 && days <= 7) return "checkout_soon";
  return null;
}

export function findPenghuniForKamarRoom(
  room: { lokasiKos: string; unitBlok: string; noKamar: string },
  penghuniRows: PenghuniForKamarSync[]
): PenghuniForKamarSync | null {
  const pen = penghuniRows.find(
    (p) =>
      penghuniCountsAsOccupyingKamar(p) &&
      p.lokasiKos === room.lokasiKos &&
      p.unitBlok === room.unitBlok &&
      p.noKamar === room.noKamar
  );
  return pen ?? null;
}

type KamarSyncBase = {
  id: string;
  lokasiKos: string;
  unitBlok: string;
  noKamar: string;
  status: "Occupied" | "Available" | "Maintenance";
  keterangan: string;
  namaPenghuni: string;
  tglCheckOut: string;
};

/** Booking/Stay yang masih menempati → Occupied; sebaliknya Available (Maintenance tidak diubah). */
export function syncKamarRowsWithPenghuniList<T extends KamarSyncBase>(
  kamarRows: T[],
  penghuniRows: PenghuniForKamarSync[]
): T[] {
  return kamarRows.map((room) => {
    if (room.status === "Maintenance") {
      return room;
    }
    const pen = findPenghuniForKamarRoom(room, penghuniRows);
    if (pen) {
      return {
        ...room,
        status: "Occupied" as const,
        namaPenghuni: pen.namaLengkap,
        tglCheckOut: pen.tglCheckOut || "-",
      };
    }
    if (room.status === "Occupied") {
      return {
        ...room,
        status: "Available" as const,
        namaPenghuni: "-",
        tglCheckOut: "-",
      };
    }
    return room;
  });
}
