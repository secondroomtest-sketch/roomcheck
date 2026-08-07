import type { Metadata } from "next";
import { DM_Sans, Fraunces } from "next/font/google";
import BookingkosPageClient from "@/components/bookingkos-page-client";

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-booking-display",
  display: "swap",
});

const body = DM_Sans({
  subsets: ["latin"],
  variable: "--font-booking-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Booking Kos Granada — Second Room",
  description: "Formulir booking Kos Granada — isi data, unggah identitas dan bukti transfer.",
};

export default function BookingkosPage() {
  return (
    <div className={`${display.variable} ${body.variable} font-[family-name:var(--font-booking-body)]`}>
      <BookingkosPageClient />
    </div>
  );
}
