-- (Opsional / riwayat) Kolom username sudah ada di sync_frontend_schema.sql terbaru.
-- Jalankan file ini terpisah hanya kalau Anda memakai skrip baseline lama.
-- Untuk akun baru: kolom username = login unik; email di Auth/profile = username@{INTERNAL_DOMAIN}.

alter table public.user_profiles add column if not exists username text;

create unique index if not exists uniq_user_profiles_username
  on public.user_profiles(username)
  where username is not null and trim(username) <> '';

-- Isi kolom untuk baris yang email-nya sudah mengikuti pola internal (@secondroom.internal ganti sesuai domain Anda):
-- update public.user_profiles set username = substring(email from '^([^@]+)')
-- where username is null and email ilike '%@secondroom.internal';
