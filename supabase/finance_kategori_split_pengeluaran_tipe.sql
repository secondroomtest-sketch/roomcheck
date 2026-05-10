-- Split tipe pengeluaran menjadi: "Pengeluaran kos" dan "Pengeluaran manajemen".
-- Jalankan SETELAH `sync_frontend_schema.sql` dan (jika dipakai) `add_pengeluaran_scope.sql`.

-- 1) Data lama: "Pengeluaran" -> "Pengeluaran kos" / "Pengeluaran manajemen" (berdasarkan pengeluaran_scope).
update public.finance_kategori
set tipe = case
  when lower(coalesce(trim(pengeluaran_scope), '')) = 'manajemen' then 'Pengeluaran manajemen'
  else 'Pengeluaran kos'
end
where lower(trim(tipe)) = 'pengeluaran';

-- 2) Konsistensi scope untuk tipe baru.
update public.finance_kategori
set pengeluaran_scope = 'kos'
where lower(trim(tipe)) = 'pengeluaran kos'
  and (pengeluaran_scope is null or trim(pengeluaran_scope) = '' or lower(trim(pengeluaran_scope)) <> 'kos');

update public.finance_kategori
set pengeluaran_scope = 'manajemen'
where lower(trim(tipe)) = 'pengeluaran manajemen'
  and (pengeluaran_scope is null or trim(pengeluaran_scope) = '' or lower(trim(pengeluaran_scope)) <> 'manajemen');

-- 3) Pemasukan tidak memiliki scope.
update public.finance_kategori
set pengeluaran_scope = null
where lower(trim(tipe)) = 'pemasukan';

-- 4) Perketat constraint tipe agar 3 nilai saja yang valid.
alter table public.finance_kategori
  drop constraint if exists finance_kategori_tipe_check;

alter table public.finance_kategori
  add constraint finance_kategori_tipe_check
  check (tipe in ('Pemasukan', 'Pengeluaran kos', 'Pengeluaran manajemen'));

-- 5) Perketat constraint scope agar sesuai tipenya.
alter table public.finance_kategori
  drop constraint if exists finance_kategori_pengeluaran_scope_check;

alter table public.finance_kategori
  add constraint finance_kategori_pengeluaran_scope_check
  check (
    (tipe = 'Pemasukan' and pengeluaran_scope is null)
    or (tipe = 'Pengeluaran kos' and pengeluaran_scope = 'kos')
    or (tipe = 'Pengeluaran manajemen' and pengeluaran_scope = 'manajemen')
  );

