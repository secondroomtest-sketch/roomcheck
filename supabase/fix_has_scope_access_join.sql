-- Perbaikan has_scope_access: pasangan lokasi + blok harus konsisten dengan relasi master
-- (mb.lokasi_id = ml.id) dan blok terpilih masuk akses pengguna.
-- Tanpa tautan ini, kombinasi join kartesian bisa membuat kebijakan RLS menolak baris yang seharusnya valid.
--
-- Jalankan di Supabase SQL Editor (setelah strict_production_rls.sql / patch serupa).

create or replace function public.has_scope_access(p_lokasi text, p_blok text)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.master_blok mb
      on mb.id = any(coalesce(up.akses_blok, '{}'::uuid[]))
    join public.master_lokasi ml
      on ml.id = mb.lokasi_id
      and ml.id = any(coalesce(up.akses_lokasi, '{}'::uuid[]))
    where up.id = auth.uid()
      and lower(trim(ml.nama_lokasi)) = lower(trim(coalesce(p_lokasi, '')))
      and lower(trim(mb.nama_blok)) = lower(trim(coalesce(p_blok, '')))
  );
$$;

revoke all on function public.has_scope_access(text, text) from public;
grant execute on function public.has_scope_access(text, text) to authenticated;
grant execute on function public.has_scope_access(text, text) to service_role;
