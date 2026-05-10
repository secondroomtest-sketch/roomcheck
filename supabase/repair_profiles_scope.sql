-- Jalankan di Supabase SQL Editor bila dashboard kosong tetapi data di Table Editor ada.
-- 1) Rapikan spasi pada role (jarang tetapi bisa membuat has_global_operational_access gagal).
-- 2) Supervisor/manager: paksa akses SEMUA lokasi + SEMUA blok.
-- 3) Owner/staff dengan array kosong: isi SEMUA lokasi + SEMUA blok (aman untuk deployment tunggal).

update public.user_profiles
set role = lower(trim(role))
where role is not null and role <> lower(trim(role));

with
  ml as (select array_agg(id) as ids from public.master_lokasi),
  mb as (select array_agg(id) as ids from public.master_blok)
update public.user_profiles up
set
  akses_lokasi =
    case
      when lower(trim(up.role)) in ('supervisor', 'manager') then (select ids from ml)
      when lower(trim(up.role)) in ('owner', 'staff')
           and (
             coalesce(up.akses_lokasi, array[]::uuid[]) = array[]::uuid[]
             or coalesce(array_length(up.akses_lokasi, 1), 0) = 0
           ) then (
        select ids from ml
      )
      else coalesce(up.akses_lokasi, array[]::uuid[])
    end,
  akses_blok =
    case
      when lower(trim(up.role)) in ('supervisor', 'manager') then (select ids from mb)
      when lower(trim(up.role)) in ('owner', 'staff')
           and (
             coalesce(up.akses_blok, array[]::uuid[]) = array[]::uuid[]
             or coalesce(array_length(up.akses_blok, 1), 0) = 0
           ) then (
        select ids from mb
      )
      else coalesce(up.akses_blok, array[]::uuid[])
    end
where lower(trim(up.role)) <> 'super_admin';
