"use client";

import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { SortDir } from "@/lib/table-sort";

type SortableThProps<K extends string> = {
  label: ReactNode;
  sortKey: K;
  activeKey: K | null;
  dir: SortDir;
  onSort: (key: K) => void;
  className?: string;
  align?: "left" | "right" | "center";
};

export default function SortableTh<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className = "",
  align = "left",
}: SortableThProps<K>) {
  const active = activeKey === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";

  return (
    <th className={className} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSort(sortKey);
        }}
        className={`group inline-flex w-full items-center gap-1 ${justify} cursor-pointer select-none [text-transform:inherit] hover:opacity-80 focus:outline-none focus-visible:underline`}
        title="Urutkan"
      >
        <span>{label}</span>
        <Icon
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 ${active ? "opacity-100" : "opacity-40 group-hover:opacity-70"}`}
        />
      </button>
    </th>
  );
}
