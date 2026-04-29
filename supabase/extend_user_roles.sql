-- Jalankan di Supabase SQL Editor setelah sync_frontend_schema.sql
-- Menambah role supervisor & manager untuk user_profiles

alter table public.user_profiles drop constraint if exists user_profiles_role_check;

alter table public.user_profiles
  add constraint user_profiles_role_check
  check (role in ('super_admin', 'owner', 'staff', 'supervisor', 'manager'));
