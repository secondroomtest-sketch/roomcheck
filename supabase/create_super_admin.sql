-- Bootstrap super admin account
-- Step 1 (required): Create auth user first in Supabase Dashboard
-- Authentication -> Users -> Add user (email + password)
--
-- Step 2: Run this SQL and replace email target below.

do $$
declare
  v_email text := 'admin@secondroom.com'; -- TODO: ganti dengan email admin kamu
begin
  insert into public.user_profiles (id, email, full_name, role, akses_lokasi, akses_blok)
  select
    u.id,
    u.email,
    'Super Admin',
    'super_admin',
    '{}'::uuid[],
    '{}'::uuid[]
  from auth.users u
  where lower(u.email) = lower(v_email)
  on conflict (id) do update
  set
    email = excluded.email,
    full_name = excluded.full_name,
    role = 'super_admin',
    akses_lokasi = '{}'::uuid[],
    akses_blok = '{}'::uuid[],
    updated_at = now();

  if not exists (
    select 1
    from public.user_profiles up
    join auth.users au on au.id = up.id
    where lower(au.email) = lower(v_email)
      and up.role = 'super_admin'
  ) then
    raise exception 'Auth user dengan email % tidak ditemukan. Buat dulu di Authentication -> Users.', v_email;
  end if;
end $$;
