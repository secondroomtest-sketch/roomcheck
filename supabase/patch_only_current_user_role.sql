-- Pembaruan terarah: jalankan sekali di Supabase SQL Editor jika data operasional (kamar/penghuni/finance)
-- masih kosong meski UI menampilkan super_admin. Melengkapi / memperbaiki strict_production_rls.sql yang sudah di-deploy.

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

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_role() to service_role;
