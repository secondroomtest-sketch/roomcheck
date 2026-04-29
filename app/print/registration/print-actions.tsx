"use client";

import { useState } from "react";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export default function PrintActions() {
  const [isDownloading, setIsDownloading] = useState(false);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    const sheet = document.getElementById("registration-sheet");
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
      const contentWidth = pdfWidth - margin * 2;
      const pageContentHeight = pdfHeight - margin * 2;
      const imageHeight = (canvas.height * contentWidth) / canvas.width;

      if (imageHeight <= pageContentHeight) {
        pdf.addImage(imgData, "PNG", margin, margin, contentWidth, imageHeight, undefined, "FAST");
      } else {
        let remainingHeight = imageHeight;
        let positionY = margin;

        pdf.addImage(imgData, "PNG", margin, positionY, contentWidth, imageHeight, undefined, "FAST");
        remainingHeight -= pageContentHeight;

        while (remainingHeight > 0) {
          positionY = remainingHeight - imageHeight + margin;
          pdf.addPage();
          pdf.addImage(imgData, "PNG", margin, positionY, contentWidth, imageHeight, undefined, "FAST");
          remainingHeight -= pageContentHeight;
        }
      }

      pdf.save("formulir-pendaftaran-penghuni.pdf");
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
