-- Memisahkan POS pengeluaran: kos vs manajemen (P&L ganda).
-- Jalankan setelah sync_frontend_schema.sql.

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
where tipe = 'Pemasukan';

alter table public.finance_kategori
  drop constraint if exists finance_kategori_pengeluaran_scope_check;

alter table public.finance_kategori
  add constraint finance_kategori_pengeluaran_scope_check
  check (
    tipe = 'Pemasukan'
    or pengeluaran_scope in ('kos', 'manajemen')
  );

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
