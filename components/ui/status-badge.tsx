type StatusBadgeProps = {
  status: string;
  className?: string;
};

const statusToneMap: Record<string, string> = {
  occupied: "bg-blue-100 text-blue-700 dark:bg-blue-200 dark:text-blue-900",
  available: "bg-emerald-100 text-emerald-700 dark:bg-emerald-200 dark:text-emerald-900",
  maintenance: "bg-red-100 text-red-700 dark:bg-red-200 dark:text-red-900",
  booking: "bg-blue-100 text-blue-700 dark:bg-blue-200 dark:text-blue-900",
  stay: "bg-emerald-100 text-emerald-700 dark:bg-emerald-200 dark:text-emerald-900",
  survey: "bg-amber-100 text-amber-700 dark:bg-amber-200 dark:text-amber-900",
  pemasukan: "bg-emerald-100 text-emerald-700 dark:bg-emerald-200 dark:text-emerald-900",
  pengeluaran: "bg-rose-100 text-rose-700 dark:bg-rose-200 dark:text-rose-900",
  paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-200 dark:text-emerald-900",
  "down payment": "bg-amber-100 text-amber-700 dark:bg-amber-200 dark:text-amber-900",
  refund: "bg-violet-100 text-violet-700 dark:bg-violet-200 dark:text-violet-900",
};

export default function StatusBadge({ status, className = "" }: StatusBadgeProps) {
  const normalized = status.trim().toLowerCase();
  const tone =
    statusToneMap[normalized] ??
    "bg-zinc-100 text-zinc-700 dark:bg-zinc-200 dark:text-zinc-900";

  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${tone} ${className}`.trim()}>
      {status}
    </span>
  );
}
