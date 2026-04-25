-- ============================================================
-- ACEH GADAI SYARIAH - tb_sjb tambah kolom alamat (Migration 013)
-- File: supabase/migrations/013_tb_sjb_alamat.sql
--
-- Tujuan: simpan alamat nasabah SJB supaya kontrak perpanjang/buyback
-- bisa menampilkan alamat PIHAK PERTAMA tanpa input ulang.
--
-- Form input alamat sudah ada di /sjb (state alamatNasabah), backend
-- submit menerima body.alamatNasabah, tapi sebelum migration ini tidak
-- ada kolom utk simpan -> data hilang setelah submit.
--
-- Additive — tidak menyentuh kolom/data existing. Row lama dapat NULL.
-- ============================================================

ALTER TABLE tb_sjb
  ADD COLUMN IF NOT EXISTS alamat text NULL;

COMMENT ON COLUMN tb_sjb.alamat IS
  'Alamat nasabah/penjual. Diisi saat akad SJB baru (body.alamatNasabah). Dipakai utk kontrak perpanjang/buyback.';
