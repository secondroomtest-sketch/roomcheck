-- Sync schema to match current frontend usage.
-- Supabase: salin SELURUH file ini, tempel SEKALI di SQL Editor, lalu jalankan (Ctrl+Enter).
--          Banyak perintah dalam satu paste = tetap satu “run”; idempotent untuk sebagian besar langkah.
--          Perbaikan `finance_kategori_pengeluaran_scope_check` (Pemasukan kos/manajemen)
--          hanya dibuat di akhir blok migrasi finance — tanpa constraint sementara yang salah.
--
-- After this, optional one-off fixes (only if you need them):
--   repair_profiles_scope.sql     — dashboard kosong karena akses_lokasi/blok kosong
--   strict_production_rls.sql     — RLS ketat produksi
--   create_super_admin.sql      — bootstrap admin
--
-- Catatan: file add_pengeluaran_scope.sql, finance_kategori_split_pengeluaran_tipe.sql,
-- add_pemasukan_scope_kind.sql, add_username_login.sql tetap ada untuk riwayat; isinya
-- sudah digabung di bawah agar skema selaras dengan kode terbaru.

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
  tipe text not null default 'Pemasukan manajemen',
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

alter table public.user_profiles add column if not exists username text;

create unique index if not exists uniq_user_profiles_username
  on public.user_profiles(username)
  where username is not null and trim(username) <> '';

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
alter table public.penghuni add column if not exists sewa_cycle_start date;
alter table public.penghuni add column if not exists sewa_cycle_end date;
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
update public.penghuni
set
  sewa_cycle_start = coalesce(sewa_cycle_start, tgl_check_in),
  sewa_cycle_end = coalesce(sewa_cycle_end, tgl_check_out)
where coalesce(status, 'Booking') = 'Stay';
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
-- Finance: scope columns + split tipe POS (sinkron dengan components/master-page-client &
-- finance-page-client insert/update).
-- =========================

-- Lepaskan dulu semua CHECK yang kita kelola: data lama / re-run skrip tidak terjebak
-- constraint versi lama (mis. tipe hanya 'Pemasukan') sebelum UPDATE normalisasi.
alter table public.finance_kategori
  drop constraint if exists finance_kategori_tipe_check;
alter table public.finance_kategori
  drop constraint if exists finance_kategori_pemasukan_scope_kind_check;
alter table public.finance_kategori
  drop constraint if exists finance_kategori_pengeluaran_scope_check;

-- From add_pengeluaran_scope.sql
alter table public.finance_kategori
  add column if not exists pengeluaran_scope text;

update public.finance_kategori
set pengeluaran_scope = 'kos'
where lower(trim(tipe)) in ('pengeluaran', 'pengeluaran kos')
  and (pengeluaran_scope is null or trim(pengeluaran_scope) = '');

update public.finance_kategori
set pengeluaran_scope = 'manajemen'
where lower(trim(tipe)) = 'pengeluaran manajemen'
  and (pengeluaran_scope is null or trim(pengeluaran_scope) = '');

update public.finance_kategori
set pengeluaran_scope = null
where lower(trim(tipe)) = 'pemasukan';

alter table public.finance
  add column if not exists pengeluaran_scope text;

update public.finance f
set pengeluaran_scope = k.pengeluaran_scope
from public.finance_kategori k
where f.kategori = 'Pengeluaran'
  and trim(f.pos) <> ''
  and trim(k.nama_pos) <> ''
  and lower(trim(f.pos)) = lower(trim(k.nama_pos))
  and (f.pengeluaran_scope is null or trim(f.pengeluaran_scope) = '');

update public.finance
set pengeluaran_scope = 'kos'
where kategori = 'Pengeluaran'
  and (pengeluaran_scope is null or trim(pengeluaran_scope) = '');

update public.finance
set pengeluaran_scope = null
where kategori = 'Pemasukan';

alter table public.finance
  drop constraint if exists finance_row_pengeluaran_scope_check;

alter table public.finance
  add constraint finance_row_pengeluaran_scope_check
  check (
    kategori = 'Pemasukan'
    or pengeluaran_scope in ('kos', 'manajemen')
  );

-- From finance_kategori_split_pengeluaran_tipe.sql
update public.finance_kategori
set tipe = case
  when lower(coalesce(trim(pengeluaran_scope), '')) = 'manajemen' then 'Pengeluaran manajemen'
  else 'Pengeluaran kos'
end
where lower(trim(tipe)) = 'pengeluaran';

update public.finance_kategori
set pengeluaran_scope = 'kos'
where lower(trim(tipe)) = 'pengeluaran kos'
  and (pengeluaran_scope is null or trim(pengeluaran_scope) = '' or lower(trim(pengeluaran_scope)) <> 'kos');

update public.finance_kategori
set pengeluaran_scope = 'manajemen'
where lower(trim(tipe)) = 'pengeluaran manajemen'
  and (pengeluaran_scope is null or trim(pengeluaran_scope) = '' or lower(trim(pengeluaran_scope)) <> 'manajemen');

update public.finance_kategori
set pengeluaran_scope = null
where lower(trim(tipe)) = 'pemasukan';

-- Jangan pasang finance_kategori_tipe_check di sini. Constraint sementara
-- (hanya 'Pemasukan' + pengeluaran) memblok UPDATE/INSERT ke 'Pemasukan kos' / 'Pemasukan manajemen'.
-- Satu constraint final dipasang setelah semua UPDATE di bawah selesai.

-- From add_pemasukan_scope_kind.sql
alter table public.finance_kategori
  add column if not exists pemasukan_scope text;

alter table public.finance_kategori
  add column if not exists pemasukan_kind text;

update public.finance_kategori
set tipe = 'Pemasukan kos'
where lower(trim(tipe)) in ('pemasukan kos - sewa kamar', 'pemasukan kos - booking fee');

update public.finance_kategori
set pemasukan_scope = 'kos',
    pemasukan_kind = case
      when lower(trim(coalesce(nama_pos, ''))) = 'sewa kamar' then 'sewa_kamar'
      when lower(trim(coalesce(nama_pos, ''))) = 'booking fee' then 'booking_fee'
      else 'lain'
    end
where lower(trim(tipe)) = 'pemasukan kos';

update public.finance_kategori
set tipe = 'Pemasukan manajemen',
    pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where lower(trim(tipe)) = 'pemasukan kos'
  and lower(trim(coalesce(nama_pos, ''))) not in ('sewa kamar', 'booking fee');

-- Pemasukan generik legacy -> selaras frontend (normalizeFinanceTipe).
update public.finance_kategori
set tipe = 'Pemasukan kos',
    pemasukan_scope = 'kos',
    pemasukan_kind = case
      when lower(trim(coalesce(nama_pos, ''))) = 'sewa kamar' then 'sewa_kamar'
      when lower(trim(coalesce(nama_pos, ''))) = 'booking fee' then 'booking_fee'
      else 'lain'
    end
where lower(trim(tipe)) = 'pemasukan'
  and lower(trim(coalesce(nama_pos, ''))) in ('sewa kamar', 'booking fee');

update public.finance_kategori
set tipe = 'Pemasukan manajemen',
    pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where lower(trim(tipe)) = 'pemasukan';

update public.finance_kategori
set pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where lower(trim(tipe)) = 'pemasukan manajemen';

update public.finance_kategori
set pemasukan_scope = null,
    pemasukan_kind = null
where lower(trim(tipe)) like 'pengeluaran%';

-- Normalisasi sebelum CHECK final: spasi / sisa tipe legacy / kombinasi tak konsisten.
update public.finance_kategori
set tipe = btrim(tipe),
    nama_pos = btrim(nama_pos);

update public.finance_kategori
set tipe = case
  when lower(coalesce(trim(pengeluaran_scope), '')) = 'manajemen' then 'Pengeluaran manajemen'
  else 'Pengeluaran kos'
end
where lower(btrim(tipe)) = 'pengeluaran';

update public.finance_kategori
set tipe = 'Pemasukan manajemen',
    pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain',
    pengeluaran_scope = null
where btrim(tipe) = 'Pemasukan';

-- Lengkapi Pemasukan kos yang belum punya kombinasi scope/kind yang valid (infer dari nama POS).
update public.finance_kategori
set pemasukan_scope = 'kos',
    pemasukan_kind = case
      when lower(btrim(coalesce(nama_pos, ''))) = 'sewa kamar' then 'sewa_kamar'
      when lower(btrim(coalesce(nama_pos, ''))) = 'booking fee' then 'booking_fee'
      else 'lain'
    end
where btrim(tipe) = 'Pemasukan kos'
  and (
    pemasukan_scope is null
    or btrim(coalesce(pemasukan_scope, '')) = ''
    or pemasukan_kind is null
    or pemasukan_kind not in ('sewa_kamar', 'booking_fee')
  );

-- Kind "lain" tidak boleh untuk tipe Pemasukan kos pada CHECK final.
update public.finance_kategori
set tipe = 'Pemasukan manajemen',
    pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where btrim(tipe) = 'Pemasukan kos'
  and coalesce(pemasukan_kind, '') = 'lain';

update public.finance_kategori
set pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where btrim(tipe) = 'Pemasukan manajemen'
  and (
    pemasukan_scope is null
    or btrim(coalesce(pemasukan_scope, '')) = ''
    or pemasukan_kind is null
  );

update public.finance_kategori
set pengeluaran_scope = case
  when btrim(tipe) = 'Pengeluaran manajemen' then 'manajemen'
  else 'kos'
end
where lower(btrim(tipe)) like 'pengeluaran%'
  and (
    pengeluaran_scope is null
    or btrim(coalesce(pengeluaran_scope, '')) = ''
  );

alter table public.finance
  add column if not exists pemasukan_scope text;

alter table public.finance
  add column if not exists pemasukan_kind text;

update public.finance f
set pemasukan_scope = k.pemasukan_scope,
    pemasukan_kind = k.pemasukan_kind
from public.finance_kategori k
where f.kategori = 'Pemasukan'
  and trim(f.pos) <> ''
  and trim(k.nama_pos) <> ''
  and lower(trim(f.pos)) = lower(trim(k.nama_pos))
  and (f.pemasukan_scope is null or trim(f.pemasukan_scope) = '');

update public.finance
set pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where kategori = 'Pemasukan'
  and (pemasukan_scope is null or trim(pemasukan_scope) = '');

update public.finance
set pemasukan_scope = null,
    pemasukan_kind = null
where kategori = 'Pengeluaran';

alter table public.finance_kategori
  drop constraint if exists finance_kategori_tipe_check;

alter table public.finance_kategori
  add constraint finance_kategori_tipe_check
  check (
    btrim(tipe) in ('Pemasukan kos', 'Pemasukan manajemen', 'Pengeluaran kos', 'Pengeluaran manajemen')
  );

alter table public.finance_kategori
  drop constraint if exists finance_kategori_pemasukan_scope_kind_check;

alter table public.finance_kategori
  add constraint finance_kategori_pemasukan_scope_kind_check
  check (
    (lower(btrim(tipe)) like 'pengeluaran%' and pemasukan_scope is null and pemasukan_kind is null)
    or (
      btrim(tipe) = 'Pemasukan kos'
      and pemasukan_scope = 'kos'
      and pemasukan_kind in ('sewa_kamar', 'booking_fee')
    )
    or (
      btrim(tipe) = 'Pemasukan manajemen'
      and pemasukan_scope = 'manajemen'
      and pemasukan_kind = 'lain'
    )
  );

alter table public.finance_kategori
  drop constraint if exists finance_kategori_pengeluaran_scope_check;

alter table public.finance_kategori
  add constraint finance_kategori_pengeluaran_scope_check
  check (
    (btrim(tipe) in ('Pemasukan kos', 'Pemasukan manajemen') and pengeluaran_scope is null)
    or (btrim(tipe) = 'Pengeluaran kos' and pengeluaran_scope = 'kos')
    or (btrim(tipe) = 'Pengeluaran manajemen' and pengeluaran_scope = 'manajemen')
  );

alter table public.finance
  drop constraint if exists finance_row_pemasukan_scope_kind_check;

alter table public.finance
  add constraint finance_row_pemasukan_scope_kind_check
  check (
    (kategori = 'Pengeluaran' and pemasukan_scope is null and pemasukan_kind is null)
    or (
      kategori = 'Pemasukan'
      and pemasukan_scope in ('kos', 'manajemen')
      and pemasukan_kind in ('sewa_kamar', 'booking_fee', 'lain')
    )
  );

-- =========================
-- password_change_log (audit password; tanpa menyimpan plaintext)
-- =========================
create table if not exists public.password_change_log (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null,
  actor_user_id uuid,
  source text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_password_change_log_created on public.password_change_log(created_at desc);
create index if not exists idx_password_change_subject on public.password_change_log(subject_user_id);

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
