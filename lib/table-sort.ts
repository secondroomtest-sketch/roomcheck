"use client";

import { useCallback, useMemo, useState } from "react";

export type SortDir = "asc" | "desc";
export type SortValue = string | number | null | undefined;

function isEmptySortValue(v: SortValue): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "number") return Number.isNaN(v);
  const s = v.trim();
  return s === "" || s === "—" || s === "-";
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/;
const DMY_DATE_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?/;

function parseDateLike(s: string): number | null {
  const t = s.trim();
  const iso = ISO_DATE_RE.exec(t);
  if (iso) {
    const ms = Date.parse(t);
    if (!Number.isNaN(ms)) return ms;
    return Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]), Number(iso[4] ?? 0), Number(iso[5] ?? 0));
  }
  const dmy = DMY_DATE_RE.exec(t);
  if (dmy) {
    return Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]), Number(dmy[4] ?? 0), Number(dmy[5] ?? 0));
  }
  return null;
}

/** Bandingkan dua nilai untuk urutan naik; nilai kosong selalu ditaruh di bawah oleh pemanggil. */
export function compareSortValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  const sa = String(a ?? "");
  const sb = String(b ?? "");
  const da = parseDateLike(sa);
  const db = parseDateLike(sb);
  if (da !== null && db !== null) return da - db;
  return sa.localeCompare(sb, "id", { numeric: true, sensitivity: "base" });
}

/** "Rp 1.500.000" -> 1500000; kosong -> null. */
export function parseNominal(value: string | number | null | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value ?? "").trim();
  if (!s) return null;
  const negative = s.includes("-") && !/\d-\d/.test(s);
  const digits = s.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return negative ? -n : n;
}

export type SortAccessors<T, K extends string> = Record<K, (row: T) => SortValue>;

/** `accessors` sebaiknya konstanta modul atau di-`useMemo` agar tidak memicu sort ulang tiap render. */
export function useTableSort<T, K extends string>(rows: readonly T[], accessors: SortAccessors<T, K>) {
  const [sortKey, setSortKey] = useState<K | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const toggleSort = useCallback(
    (key: K) => {
      if (sortKey !== key) {
        setSortKey(key);
        setSortDir("asc");
      } else if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortKey(null);
        setSortDir("asc");
      }
    },
    [sortKey, sortDir]
  );

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows as T[];
    const get = accessors[sortKey];
    if (!get) return rows as T[];
    const factor = sortDir === "asc" ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index, value: get(row) }))
      .sort((x, y) => {
        const ex = isEmptySortValue(x.value);
        const ey = isEmptySortValue(y.value);
        if (ex || ey) {
          if (ex && ey) return x.index - y.index;
          return ex ? 1 : -1;
        }
        const c = compareSortValues(x.value, y.value) * factor;
        return c !== 0 ? c : x.index - y.index;
      })
      .map((x) => x.row);
  }, [rows, accessors, sortKey, sortDir]);

  return { sortedRows, sortKey, sortDir, toggleSort };
}
