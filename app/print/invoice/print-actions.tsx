"use client";

import { useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { invoicePdfFileName } from "@/lib/finance-open-invoice-tab";

type PrintActionsProps = {
  noNota?: string;
};

export default function PrintActions({ noNota }: PrintActionsProps) {
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const sheet = document.getElementById("finance-invoice-sheet");
    if (!sheet) return;

    try {
      setIsDownloading(true);
      const canvas = await html2canvas(sheet, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = 210;
      const pdfHeight = 297;
      const margin = 8;
      const maxWidth = pdfWidth - margin * 2;
      const maxHeight = pdfHeight - margin * 2;

      // Selalu muat 1 lembar A4 (scale down jika konten lebih tinggi).
      let imgWidth = maxWidth;
      let imgHeight = (canvas.height * imgWidth) / canvas.width;
      if (imgHeight > maxHeight) {
        imgHeight = maxHeight;
        imgWidth = (canvas.width * imgHeight) / canvas.height;
      }
      const x = margin + (maxWidth - imgWidth) / 2;
      const y = margin + Math.max(0, (maxHeight - imgHeight) / 2) * 0.15;
      pdf.addImage(imgData, "PNG", x, y, imgWidth, imgHeight, undefined, "FAST");

      pdf.save(invoicePdfFileName(noNota ?? ""));
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="toolbar no-print">
      <button type="button" className="actionBtn" onClick={handlePrint}>
        Print
      </button>
      <button type="button" className="actionBtn primary" onClick={handleDownloadPdf} disabled={isDownloading}>
        {isDownloading ? "Memproses PDF..." : "Download PDF"}
      </button>
    </div>
  );
}
