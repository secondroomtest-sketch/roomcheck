-- Pisah booking fee (DP sewa) vs deposit kamar.
-- Paste sekali di Supabase SQL Editor, lalu Run.
--
-- Semantik baru:
--   booking_fee        = uang muka / DP dari sewa
--   booking_fee_paid   = DP sewa sudah lunas
--   deposit_kamar      = nominal deposit kamar (terpisah)
--   deposit_kamar_paid = deposit sudah lunas
-- Stay otomatis jika sewa lunas + (deposit lunas atau deposit = 0).

alter table public.penghuni
  add column if not exists deposit_kamar numeric not null default 0;

alter table public.penghuni
  add column if not exists booking_fee_paid boolean not null default false;

alter table public.penghuni
  add column if not exists booking_fee_nota text;

comment on column public.penghuni.deposit_kamar is
  'Nominal deposit kamar (terpisah dari booking fee / DP sewa).';

comment on column public.penghuni.booking_fee_paid is
  'True jika booking fee (DP sewa) sudah dicatat lunas di Finance.';

comment on column public.penghuni.booking_fee_nota is
  'No. nota Finance untuk pelunasan booking fee.';

-- Stay/History lama: field booking_fee dipakai sebagai nilai deposit → salin ke deposit_kamar
update public.penghuni
set deposit_kamar = coalesce(booking_fee, 0)
where coalesce(status, '') in ('Stay', 'History')
  and coalesce(deposit_kamar, 0) = 0
  and coalesce(booking_fee, 0) > 0;

-- Booking lama: deposit_kamar_paid sebenarnya flag booking fee paid
update public.penghuni
set
  booking_fee_paid = true,
  booking_fee_nota = nullif(trim(coalesce(deposit_kamar_nota, '')), ''),
  deposit_kamar_paid = false,
  deposit_kamar_nota = null
where coalesce(status, '') = 'Booking'
  and coalesce(deposit_kamar_paid, false) = true;
