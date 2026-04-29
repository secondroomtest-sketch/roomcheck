# Snapshot Theme Rework (2026-04-29)

Dokumen ini mencatat snapshot perubahan sebelum commit Git tersedia di environment terminal.

## Scope utama

- Rework warna aplikasi ke palette logo manajemen (biru-ungu).
- Penambahan flow `Print Registration Card` ke halaman/form print khusus.
- Pembuatan halaman print registrasi dengan layout A4, logo, tombol print & download PDF.
- Tuning kontras dark mode untuk readability (teks kecil, tabel, border panel).

## File yang berubah (utama)

- `app/globals.css`
- `app/login/page.tsx`
- `app/(main)/dashboard/page.tsx`
- `app/(main)/profile/page.tsx`
- `components/dashboard-shell.tsx`
- `components/penghuni-page-client.tsx`
- `components/kamar-page-client.tsx`
- `components/finance-page-client.tsx`
- `components/master-page-client.tsx`
- `components/laporan-page-client.tsx`
- `components/ui/refresh-toolbar-button.tsx`
- `lib/ui-accent.ts`
- `app/print/registration/page.tsx`
- `app/print/registration/print-actions.tsx`
- `public/logo-second-room.png`
- `package.json`
- `package-lock.json`

## Feature print registrasi

- Tombol `Print Registration Card` ditambahkan di profil penghuni.
- Navigasi ke route print:
  - `/print/registration?...`
- Layout form registrasi:
  - Header + logo
  - Data penghuni lengkap
  - Keterangan persetujuan
  - Kolom tanda tangan
- Format tanggal:
  - Hari, Tanggal Bulan Tahun (locale Indonesia)
- Toolbar print page:
  - Tombol `Print`
  - Tombol `Download PDF`

## Dependency baru

- `html2canvas`
- `jspdf`

## Catatan commit saat Git tersedia

Contoh commit message:

`retheme app to logo palette and add registration print flow`

Body singkat:

- Switch global/app UI colors to blue-purple brand palette with dark-mode contrast tuning.
- Add resident registration print page with logo, formatted dates, print and PDF download actions.

