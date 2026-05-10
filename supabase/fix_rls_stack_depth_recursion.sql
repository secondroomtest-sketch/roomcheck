-- =============================================================================
-- PERBAIKAN: error Postgres "stack depth limit exceeded" saat SELECT kamar /
-- penghuni / finance (RLS rekursif).
--
-- Penyebab umum: tabel user_profiles memakai FORCE ROW LEVEL SECURITY. Fungsi
-- helper SECURITY DEFINER yang SELECT ke user_profiles masih bisa memicu ulang
-- evaluasi policy → loop tak terhingga dengan current_user_role() / policy is_super_admin.
--
-- Solusi: matikan Row Security hanya dalam eksekusi fungsi helper lewat SET.
--
-- Jalankan blok ini sekali di Supabase → SQL Editor (Project yang sama dengan app).
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
  )
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_role() to service_role;

revoke all on function public.has_scope_access(text, text) from public;
grant execute on function public.has_scope_access(text, text) to authenticated;
grant execute on function public.has_scope_access(text, text) to service_role;
