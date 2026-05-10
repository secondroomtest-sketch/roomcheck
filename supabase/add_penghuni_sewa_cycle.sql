-- Siklus sewa aktif (histori check-in awal tetap di tgl_check_in).
-- Paste sekali di Supabase SQL Editor.

alter table public.penghuni add column if not exists sewa_cycle_start date;
alter table public.penghuni add column if not exists sewa_cycle_end date;

update public.penghuni
set
  sewa_cycle_start = coalesce(sewa_cycle_start, tgl_check_in),
  sewa_cycle_end = coalesce(sewa_cycle_end, tgl_check_out)
where coalesce(status, '') = 'Stay';
