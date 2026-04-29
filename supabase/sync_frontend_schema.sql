-- Sync schema to match current frontend usage.
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================
-- finance_kategori
-- =========================
create table if not exists public.finance_kategori (
  id uuid primary key default gen_random_uuid(),
  tipe text not null default 'Pemasukan' check (tipe in ('Pemasukan', 'Pengeluaran')),
  nama_pos text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance_kategori add column if not exists tipe text;
alter table public.finance_kategori add column if not exists nama_pos text;
alter table public.finance_kategori add column if not exists created_at timestamptz not null default now();
alter table public.finance_kategori add column if not exists updated_at timestamptz not null default now();
update public.finance_kategori set tipe = coalesce(tipe, 'Pemasukan');
update public.finance_kategori set nama_pos = coalesce(nama_pos, 'Unknown POS');
create index if not exists idx_finance_kategori_tipe on public.finance_kategori(tipe);

drop trigger if exists trg_finance_kategori_updated_at on public.finance_kategori;
create trigger trg_finance_kategori_updated_at
before update on public.finance_kategori
for each row
execute function public.set_updated_at();

-- =========================
-- master_lokasi
-- =========================
create table if not exists public.master_lokasi (
  id uuid primary key default gen_random_uuid(),
  nama_lokasi text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.master_lokasi add column if not exists nama_lokasi text;
alter table public.master_lokasi add column if not exists created_at timestamptz not null default now();
alter table public.master_lokasi add column if not exists updated_at timestamptz not null default now();
update public.master_lokasi set nama_lokasi = coalesce(nama_lokasi, 'Unknown Lokasi');

drop trigger if exists trg_master_lokasi_updated_at on public.master_lokasi;
create trigger trg_master_lokasi_updated_at
before update on public.master_lokasi
for each row
execute function public.set_updated_at();

-- =========================
-- master_blok
-- =========================
create table if not exists public.master_blok (
  id uuid primary key default gen_random_uuid(),
  lokasi_id uuid not null references public.master_lokasi(id) on delete cascade,
  nama_blok text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lokasi_id, nama_blok)
);

alter table public.master_blok add column if not exists lokasi_id uuid;
alter table public.master_blok add column if not exists nama_blok text;
alter table public.master_blok add column if not exists created_at timestamptz not null default now();
alter table public.master_blok add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_master_blok_lokasi_id on public.master_blok(lokasi_id);

drop trigger if exists trg_master_blok_updated_at on public.master_blok;
create trigger trg_master_blok_updated_at
before update on public.master_blok
for each row
execute function public.set_updated_at();

-- =========================
-- user_profiles
-- =========================
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  no_hp text,
  role text not null default 'staff' check (role in ('super_admin', 'owner', 'staff', 'supervisor', 'manager')),
  akses_lokasi uuid[] not null default '{}',
  akses_blok uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_profiles add column if not exists email text;
alter table public.user_profiles add column if not exists full_name text;
alter table public.user_profiles add column if not exists no_hp text;
alter table public.user_profiles add column if not exists role text;
alter table public.user_profiles add column if not exists akses_lokasi uuid[] not null default '{}';
alter table public.user_profiles add column if not exists akses_blok uuid[] not null default '{}';
alter table public.user_profiles add column if not exists created_at timestamptz not null default now();
alter table public.user_profiles add column if not exists updated_at timestamptz not null default now();
update public.user_profiles set role = coalesce(role, 'staff');

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_updated_at();

-- =========================
-- kamar
-- =========================
create table if not exists public.kamar (
  id uuid primary key default gen_random_uuid(),
  lokasi_kos text not null,
  unit_blok text not null,
  no_kamar text not null,
  status text not null default 'Available' check (status in ('Occupied', 'Available', 'Maintenance')),
  keterangan text,
  nama_penghuni text,
  tgl_check_out date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lokasi_kos, unit_blok, no_kamar)
);

alter table public.kamar add column if not exists lokasi_kos text;
alter table public.kamar add column if not exists unit_blok text;
alter table public.kamar add column if not exists no_kamar text;
alter table public.kamar add column if not exists status text;
alter table public.kamar add column if not exists keterangan text;
alter table public.kamar add column if not exists nama_penghuni text;
alter table public.kamar add column if not exists tgl_check_out date;
alter table public.kamar add column if not exists created_at timestamptz not null default now();
alter table public.kamar add column if not exists updated_at timestamptz not null default now();
update public.kamar set status = coalesce(status, 'Available');
create index if not exists idx_kamar_status on public.kamar(status);
create index if not exists idx_kamar_no_kamar on public.kamar(no_kamar);

drop trigger if exists trg_kamar_updated_at on public.kamar;
create trigger trg_kamar_updated_at
before update on public.kamar
for each row
execute function public.set_updated_at();

-- =========================
-- penghuni
-- =========================
create table if not exists public.penghuni (
  id uuid primary key default gen_random_uuid(),
  nama_lengkap text not null,
  lokasi_kos text not null,
  unit_blok text not null,
  no_kamar text not null,
  periode_sewa_bulan integer not null default 1,
  tgl_check_in date,
  tgl_check_out date,
  harga_bulanan numeric not null default 0,
  no_wa text,
  status text not null default 'Booking' check (status in ('Booking', 'Stay', 'Survey')),
  keterangan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.penghuni add column if not exists nama_lengkap text;
alter table public.penghuni add column if not exists lokasi_kos text;
alter table public.penghuni add column if not exists unit_blok text;
alter table public.penghuni add column if not exists no_kamar text;
alter table public.penghuni add column if not exists periode_sewa_bulan integer not null default 1;
alter table public.penghuni add column if not exists tgl_check_in date;
alter table public.penghuni add column if not exists tgl_check_out date;
alter table public.penghuni add column if not exists harga_bulanan numeric not null default 0;
alter table public.penghuni add column if not exists booking_fee numeric not null default 0;
alter table public.penghuni add column if not exists sewa_kamar_paid boolean not null default false;
alter table public.penghuni add column if not exists sewa_kamar_nota text;
alter table public.penghuni add column if not exists deposit_kamar_paid boolean not null default false;
alter table public.penghuni add column if not exists deposit_kamar_nota text;
alter table public.penghuni add column if not exists no_wa text;
alter table public.penghuni add column if not exists status text;
alter table public.penghuni add column if not exists keterangan text;
alter table public.penghuni add column if not exists created_at timestamptz not null default now();
alter table public.penghuni add column if not exists updated_at timestamptz not null default now();
update public.penghuni set status = coalesce(status, 'Booking');
create index if not exists idx_penghuni_status on public.penghuni(status);
create index if not exists idx_penghuni_created_at on public.penghuni(created_at desc);

drop trigger if exists trg_penghuni_updated_at on public.penghuni;
create trigger trg_penghuni_updated_at
before update on public.penghuni
for each row
execute function public.set_updated_at();

-- =========================
-- finance
-- =========================
create table if not exists public.finance (
  id uuid primary key default gen_random_uuid(),
  no_nota text not null,
  kategori text not null default 'Pemasukan' check (kategori in ('Pemasukan', 'Pengeluaran')),
  pos text not null,
  tanggal date not null default current_date,
  nama_penghuni text,
  nominal numeric not null default 0,
  keterangan text,
  lokasi_kos text,
  unit_blok text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.finance add column if not exists no_nota text;
alter table public.finance add column if not exists kategori text;
alter table public.finance add column if not exists pos text;
alter table public.finance add column if not exists tanggal date;
alter table public.finance add column if not exists nama_penghuni text;
alter table public.finance add column if not exists nominal numeric not null default 0;
alter table public.finance add column if not exists keterangan text;
alter table public.finance add column if not exists lokasi_kos text;
alter table public.finance add column if not exists unit_blok text;
alter table public.finance add column if not exists created_at timestamptz not null default now();
alter table public.finance add column if not exists updated_at timestamptz not null default now();
update public.finance set kategori = coalesce(kategori, 'Pemasukan');
update public.finance set tanggal = coalesce(tanggal, current_date);
update public.finance f
set
  lokasi_kos = p.lokasi_kos,
  unit_blok = p.unit_blok
from public.penghuni p
where coalesce(trim(f.nama_penghuni), '') <> ''
  and lower(trim(f.nama_penghuni)) = lower(trim(p.nama_lengkap))
  and (f.lokasi_kos is null or f.unit_blok is null);
create index if not exists idx_finance_tanggal on public.finance(tanggal desc);
create index if not exists idx_finance_kategori on public.finance(kategori);

-- P&L per bulan kalender: pemecahan payment sewa dari Penghuni (N baris, nota sama).
alter table public.finance add column if not exists pelaporan_bulan date;
alter table public.finance add column if not exists payment_split_group_id uuid;
create index if not exists idx_finance_pelaporan_bulan on public.finance(pelaporan_bulan);
create index if not exists idx_finance_payment_split_group on public.finance(payment_split_group_id);

drop trigger if exists trg_finance_updated_at on public.finance;
create trigger trg_finance_updated_at
before update on public.finance
for each row
execute function public.set_updated_at();

-- =========================
-- Dev-only RLS policy template (optional)
-- Uncomment if your current RLS blocks frontend CRUD.
-- =========================
-- alter table public.finance_kategori enable row level security;
-- alter table public.master_lokasi enable row level security;
-- alter table public.master_blok enable row level security;
-- alter table public.user_profiles enable row level security;
-- alter table public.kamar enable row level security;
-- alter table public.penghuni enable row level security;
-- alter table public.finance enable row level security;
--
-- create policy "dev_all_finance_kategori" on public.finance_kategori for all to anon, authenticated using (true) with check (true);
-- create policy "dev_all_master_lokasi" on public.master_lokasi for all to anon, authenticated using (true) with check (true);
-- create policy "dev_all_master_blok" on public.master_blok for all to anon, authenticated using (true) with check (true);
-- create policy "dev_all_user_profiles" on public.user_profiles for all to anon, authenticated using (true) with check (true);
-- create policy "dev_all_kamar" on public.kamar for all to anon, authenticated using (true) with check (true);
-- create policy "dev_all_penghuni" on public.penghuni for all to anon, authenticated using (true) with check (true);
-- create policy "dev_all_finance" on public.finance for all to anon, authenticated using (true) with check (true);
