-- Split pemasukan: kos vs manajemen + kind khusus kos (sewa kamar, booking fee).
-- Jalankan setelah:
-- - sync_frontend_schema.sql
-- - add_pengeluaran_scope.sql
-- - finance_kategori_split_pengeluaran_tipe.sql (jika Anda sudah mengaktifkan split pengeluaran)

-- 1) Kolom di finance_kategori (master POS).
alter table public.finance_kategori
  add column if not exists pemasukan_scope text;

alter table public.finance_kategori
  add column if not exists pemasukan_kind text;

-- Backfill scope/kind dari `tipe`.
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

-- Jika tipe "Pemasukan kos" tetapi POS bukan sewa kamar / booking fee, geser ke pemasukan manajemen.
update public.finance_kategori
set tipe = 'Pemasukan manajemen',
    pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where lower(trim(tipe)) = 'pemasukan kos'
  and lower(trim(coalesce(nama_pos, ''))) not in ('sewa kamar', 'booking fee');

update public.finance_kategori
set pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where lower(trim(tipe)) in ('pemasukan manajemen', 'pemasukan');

-- Pengeluaran tidak punya pemasukan_scope/kind.
update public.finance_kategori
set pemasukan_scope = null,
    pemasukan_kind = null
where lower(trim(tipe)) like 'pengeluaran%';

-- 2) Kolom di finance (baris transaksi).
alter table public.finance
  add column if not exists pemasukan_scope text;

alter table public.finance
  add column if not exists pemasukan_kind text;

-- Backfill pemasukan dari master POS (match by pos).
update public.finance f
set pemasukan_scope = k.pemasukan_scope,
    pemasukan_kind = k.pemasukan_kind
from public.finance_kategori k
where f.kategori = 'Pemasukan'
  and trim(f.pos) <> ''
  and trim(k.nama_pos) <> ''
  and lower(trim(f.pos)) = lower(trim(k.nama_pos))
  and (f.pemasukan_scope is null or trim(f.pemasukan_scope) = '');

-- Default pemasukan yang belum terpetakan -> manajemen/lain.
update public.finance
set pemasukan_scope = 'manajemen',
    pemasukan_kind = 'lain'
where kategori = 'Pemasukan'
  and (pemasukan_scope is null or trim(pemasukan_scope) = '');

-- Pengeluaran tidak punya pemasukan_scope/kind.
update public.finance
set pemasukan_scope = null,
    pemasukan_kind = null
where kategori = 'Pengeluaran';

-- 3) Constraint master (finance_kategori): scope/kind sesuai tipe.
alter table public.finance_kategori
  drop constraint if exists finance_kategori_tipe_check;

alter table public.finance_kategori
  add constraint finance_kategori_tipe_check
  check (tipe in ('Pemasukan kos', 'Pemasukan manajemen', 'Pengeluaran kos', 'Pengeluaran manajemen'));

alter table public.finance_kategori
  drop constraint if exists finance_kategori_pemasukan_scope_kind_check;

alter table public.finance_kategori
  add constraint finance_kategori_pemasukan_scope_kind_check
  check (
    (lower(trim(tipe)) like 'pengeluaran%' and pemasukan_scope is null and pemasukan_kind is null)
    or (tipe = 'Pemasukan kos' and pemasukan_scope = 'kos' and pemasukan_kind in ('sewa_kamar', 'booking_fee'))
    or (tipe = 'Pemasukan manajemen' and pemasukan_scope = 'manajemen' and pemasukan_kind = 'lain')
  );

-- 4) Constraint transaksi (finance): hanya untuk kategori Pemasukan.
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

-- Perbaikan: setelah split tipe, `finance_kategori_pengeluaran_scope_check`
-- tidak boleh lagi hanya mengizinkan `tipe = 'Pemasukan'`.
alter table public.finance_kategori
  drop constraint if exists finance_kategori_pengeluaran_scope_check;

alter table public.finance_kategori
  add constraint finance_kategori_pengeluaran_scope_check
  check (
    (tipe in ('Pemasukan kos', 'Pemasukan manajemen') and pengeluaran_scope is null)
    or (tipe = 'Pengeluaran kos' and pengeluaran_scope = 'kos')
    or (tipe = 'Pengeluaran manajemen' and pengeluaran_scope = 'manajemen')
  );
