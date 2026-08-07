-- Email calon booking (form publik /bookingkos).
-- Paste sekali di Supabase SQL Editor, lalu Run.

alter table public.penghuni
  add column if not exists email text;

comment on column public.penghuni.email is
  'Email kontak penghuni / calon booking.';
