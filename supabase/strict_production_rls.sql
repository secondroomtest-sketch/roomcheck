-- Strict production RLS for Second Room.
-- Run AFTER sync_frontend_schema.sql
-- This script assumes:
-- - auth user is linked to public.user_profiles by id = auth.users.id
-- - role is one of: super_admin, owner, staff
-- - akses_lokasi and akses_blok store UUIDs from master_lokasi.id and master_blok.id

-- =========================================================
-- 1) Helper functions
-- =========================================================
create or replace function public.current_user_role()
returns text
language sql
stable
as $$
  select up.role
  from public.user_profiles up
  where up.id = auth.uid()
  limit 1
$$;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() = 'super_admin', false)
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() = 'owner', false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
as $$
  select coalesce(public.current_user_role() = 'staff', false)
$$;

-- Check whether current user has scope access by lokasi_kos + unit_blok text labels
create or replace function public.has_scope_access(p_lokasi text, p_blok text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.user_profiles up
    join public.master_lokasi ml
      on ml.id = any(up.akses_lokasi)
    join public.master_blok mb
      on mb.id = any(up.akses_blok)
    where up.id = auth.uid()
      and lower(trim(ml.nama_lokasi)) = lower(trim(coalesce(p_lokasi, '')))
      and lower(trim(mb.nama_blok)) = lower(trim(coalesce(p_blok, '')))
  )
$$;

-- =========================================================
-- 2) Base grants (least privilege)
-- =========================================================
grant usage on schema public to authenticated;

grant select on table
  public.finance_kategori,
  public.master_lokasi,
  public.master_blok
to authenticated;

grant select, insert, update, delete on table
  public.kamar,
  public.penghuni,
  public.finance
to authenticated;

grant select, insert, update on table public.user_profiles to authenticated;

-- Optional: remove anon access for production app
revoke all on table
  public.finance_kategori,
  public.master_lokasi,
  public.master_blok,
  public.user_profiles,
  public.kamar,
  public.penghuni,
  public.finance
from anon;

-- =========================================================
-- 3) Enable + force RLS
-- =========================================================
alter table public.finance_kategori enable row level security;
alter table public.master_lokasi enable row level security;
alter table public.master_blok enable row level security;
alter table public.user_profiles enable row level security;
alter table public.kamar enable row level security;
alter table public.penghuni enable row level security;
alter table public.finance enable row level security;

alter table public.finance_kategori force row level security;
alter table public.master_lokasi force row level security;
alter table public.master_blok force row level security;
alter table public.user_profiles force row level security;
alter table public.kamar force row level security;
alter table public.penghuni force row level security;
alter table public.finance force row level security;

-- =========================================================
-- 4) Drop previous policies (idempotent rerun safe)
-- =========================================================
drop policy if exists finance_kategori_select on public.finance_kategori;
drop policy if exists finance_kategori_write on public.finance_kategori;

drop policy if exists master_lokasi_select on public.master_lokasi;
drop policy if exists master_lokasi_write on public.master_lokasi;

drop policy if exists master_blok_select on public.master_blok;
drop policy if exists master_blok_write on public.master_blok;

drop policy if exists user_profiles_select on public.user_profiles;
drop policy if exists user_profiles_self_insert on public.user_profiles;
drop policy if exists user_profiles_super_admin_update on public.user_profiles;

drop policy if exists kamar_select on public.kamar;
drop policy if exists kamar_insert on public.kamar;
drop policy if exists kamar_update on public.kamar;
drop policy if exists kamar_delete on public.kamar;

drop policy if exists penghuni_select on public.penghuni;
drop policy if exists penghuni_insert on public.penghuni;
drop policy if exists penghuni_update on public.penghuni;
drop policy if exists penghuni_delete on public.penghuni;

drop policy if exists finance_select on public.finance;
drop policy if exists finance_insert on public.finance;
drop policy if exists finance_update on public.finance;
drop policy if exists finance_delete on public.finance;

-- =========================================================
-- 5) Master table policies
-- =========================================================
-- Read master reference data for authenticated users
create policy finance_kategori_select
on public.finance_kategori
for select
to authenticated
using (true);

create policy master_lokasi_select
on public.master_lokasi
for select
to authenticated
using (true);

create policy master_blok_select
on public.master_blok
for select
to authenticated
using (true);

-- Only super admin can mutate master data
create policy finance_kategori_write
on public.finance_kategori
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy master_lokasi_write
on public.master_lokasi
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy master_blok_write
on public.master_blok
for all
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- =========================================================
-- 6) user_profiles policies
-- =========================================================
-- User can read their own profile; super_admin can read all
create policy user_profiles_select
on public.user_profiles
for select
to authenticated
using (id = auth.uid() or public.is_super_admin());

-- User can create only their own starter profile row
create policy user_profiles_self_insert
on public.user_profiles
for insert
to authenticated
with check (
  id = auth.uid()
  and role in ('staff', 'owner', 'super_admin')
);

-- Super admin can update all user profiles
create policy user_profiles_super_admin_update
on public.user_profiles
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

-- =========================================================
-- 7) Scoped operational table policies
-- =========================================================
-- -------- kamar --------
create policy kamar_select
on public.kamar
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
);

create policy kamar_insert
on public.kamar
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
);

create policy kamar_update
on public.kamar
for update
to authenticated
using (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
)
with check (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
);

create policy kamar_delete
on public.kamar
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_owner() and public.has_scope_access(lokasi_kos, unit_blok)
);

-- -------- penghuni --------
create policy penghuni_select
on public.penghuni
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
);

create policy penghuni_insert
on public.penghuni
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
);

create policy penghuni_update
on public.penghuni
for update
to authenticated
using (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
)
with check (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
);

create policy penghuni_delete
on public.penghuni
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_owner() and public.has_scope_access(lokasi_kos, unit_blok)
);

-- -------- finance --------
create policy finance_select
on public.finance
for select
to authenticated
using (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (lokasi_kos is null and unit_blok is null and public.is_owner())
);

create policy finance_insert
on public.finance
for insert
to authenticated
with check (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (lokasi_kos is null and unit_blok is null and public.is_owner())
);

create policy finance_update
on public.finance
for update
to authenticated
using (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (lokasi_kos is null and unit_blok is null and public.is_owner())
)
with check (
  public.is_super_admin()
  or public.has_scope_access(lokasi_kos, unit_blok)
  or (lokasi_kos is null and unit_blok is null and public.is_owner())
);

create policy finance_delete
on public.finance
for delete
to authenticated
using (
  public.is_super_admin()
  or public.is_owner() and (
    public.has_scope_access(lokasi_kos, unit_blok)
    or (lokasi_kos is null and unit_blok is null)
  )
);

-- =========================================================
-- 8) Optional bootstrap helper (one-time)
-- Uncomment and run once to grant first super admin.
-- =========================================================
-- update public.user_profiles
-- set role = 'super_admin'
-- where email = 'your-admin@email.com';
