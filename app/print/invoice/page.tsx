import { Suspense } from "react";
import FinanceInvoicePrintClient from "@/components/finance-invoice-print-client";

export default function FinanceInvoicePrintPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f8f5ff] p-6">
          <p className="text-sm text-[#6f6192]">Memuat invoice…</p>
        </main>
      }
    >
      <FinanceInvoicePrintClient />
    </Suspense>
  );
}
