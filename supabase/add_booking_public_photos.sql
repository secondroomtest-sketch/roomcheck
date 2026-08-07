-- Foto identitas + bukti transfer untuk booking publik.
-- Paste sekali di Supabase SQL Editor, lalu Run.
--
-- Menyimpan path object di Storage (bukan URL publik).
-- Upload dari form publik sebaiknya lewat API server (service_role);
-- bucket ini private — staff/admin membaca lewat signed URL.

-- =========================================================
-- 1) Kolom path di tabel penghuni
-- =========================================================
alter table public.penghuni
  add column if not exists foto_identitas_path text;

alter table public.penghuni
  add column if not exists bukti_transfer_path text;

alter table public.penghuni
  add column if not exists booking_source text;

comment on column public.penghuni.foto_identitas_path is
  'Path object di bucket booking-uploads (foto KTP/identitas).';

comment on column public.penghuni.bukti_transfer_path is
  'Path object di bucket booking-uploads (bukti transfer booking fee).';

comment on column public.penghuni.booking_source is
  'Asal data booking, mis. public_form. Null = input manual admin.';

-- =========================================================
-- 2) Bucket Storage private
-- =========================================================
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'booking-uploads',
  'booking-uploads',
  false,
  5242880, -- 5 MB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- =========================================================
-- 3) Policy Storage
--    - authenticated: baca saja (preview di admin)
--    - insert/update/delete: hanya service_role (bypass RLS)
-- =========================================================
drop policy if exists "booking_uploads_authenticated_select" on storage.objects;
create policy "booking_uploads_authenticated_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'booking-uploads');

drop policy if exists "booking_uploads_authenticated_insert" on storage.objects;
drop policy if exists "booking_uploads_authenticated_update" on storage.objects;
drop policy if exists "booking_uploads_authenticated_delete" on storage.objects;
drop policy if exists "booking_uploads_anon_all" on storage.objects;
