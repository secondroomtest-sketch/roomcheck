-- =============================================================================
-- PERBAIKAN: insert/update finance gagal RLS untuk pengeluaran manajemen
-- (lokasi_kos / unit_blok NULL) — contoh error:
--   "new row violates row-level security policy for table \"finance\""
--
-- Penyebab umum:
-- 1) Policy lama hanya izinkan null lokasi untuk role owner (bukan supervisor/manager).
-- 2) Fungsi has_global_operational_access() belum di-deploy / belum mencakup supervisor.
--
-- Jalankan sekali di Supabase → SQL Editor (project yang sama dengan app).
-- =============================================================================

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select lower(trim(both from coalesce(up.role, '')))
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1
$$;

create or replace function public.has_global_operational_access()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() in ('super_admin', 'manager', 'supervisor'), false)
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() = 'owner', false)
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select coalesce(public.current_user_role() = 'super_admin', false)
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_role() to service_role;

revoke all on function public.has_global_operational_access() from public;
grant execute on function public.has_global_operational_access() to authenticated;
grant execute on function public.has_global_operational_access() to service_role;

revoke all on function public.is_owner() from public;
grant execute on function public.is_owner() to authenticated;
grant execute on function public.is_owner() to service_role;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_super_admin() to service_role;

-- Baris tingkat manajemen (tanpa lokasi/unit) boleh untuk:
-- - super_admin / manager / supervisor (akses operasional global)
-- - owner
-- Baris dengan lokasi/unit: global ATAU has_scope_access.
drop policy if exists finance_select on public.finance;
drop policy if exists finance_insert on public.finance;
drop policy if exists finance_update on public.finance;
drop policy if exists finance_delete on public.finance;

create policy finance_select
on public.finance
for select
to authenticated
using (
  public.has_global_operational_access()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (
    lokasi_kos is null
    and unit_blok is null
    and (public.is_owner() or public.has_global_operational_access())
  )
);

create policy finance_insert
on public.finance
for insert
to authenticated
with check (
  public.has_global_operational_access()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (
    lokasi_kos is null
    and unit_blok is null
    and (public.is_owner() or public.has_global_operational_access())
  )
);

create policy finance_update
on public.finance
for update
to authenticated
using (
  public.has_global_operational_access()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (
    lokasi_kos is null
    and unit_blok is null
    and (public.is_owner() or public.has_global_operational_access())
  )
)
with check (
  public.has_global_operational_access()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (
    lokasi_kos is null
    and unit_blok is null
    and (public.is_owner() or public.has_global_operational_access())
  )
);

create policy finance_delete
on public.finance
for delete
to authenticated
using (
  public.has_global_operational_access()
  or (
    public.is_owner()
    and (
      public.has_scope_access(lokasi_kos, unit_blok)
      or (lokasi_kos is null and unit_blok is null)
    )
  )
);
