-- ============================================================
-- ACEH GADAI SYARIAH - Laporan Malam Telegram Cron (Fase 4)
-- File: supabase/migrations/011_laporan_malam_telegram.sql
--
-- Setup tabel & kolom untuk fitur "Auto kirim PDF laporan malam
-- ke 1 grup Telegram global setiap jam 01:00 WIB" (cron Vercel).
--
-- 1. Tabel app_settings (key/value sederhana, idempotent)
--    - laporan_malam_chat_id : chat_id grup Telegram tujuan
--    - laporan_malam_group_title : nama grup (display saja)
--    - laporan_malam_registered_at : timestamp registrasi
--
-- 2. Tambah kolom purpose di telegram_register_codes supaya 1 tabel
--    bisa dipakai untuk register OUTLET (existing) DAN LAPORAN_MALAM
--    (baru). outlet_id boleh NULL untuk purpose='LAPORAN_MALAM'.
--
-- TIDAK MENGUBAH skema lama, hanya nambah. Semua idempotent.
-- ============================================================

-- 1. Tabel app_settings (key/value)
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value       text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

COMMENT ON TABLE app_settings IS 'Key/value setting global aplikasi (mis. laporan_malam_chat_id).';

-- Seed key untuk laporan malam (NULL = belum di-set)
INSERT INTO app_settings (key, value, updated_by)
VALUES ('laporan_malam_chat_id', NULL, 'migration_011')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_by)
VALUES ('laporan_malam_group_title', NULL, 'migration_011')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_by)
VALUES ('laporan_malam_registered_at', NULL, 'migration_011')
ON CONFLICT (key) DO NOTHING;

-- 2. Tambah kolom purpose di telegram_register_codes
ALTER TABLE telegram_register_codes
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'OUTLET';

-- Boleh outlet_id NULL untuk purpose='LAPORAN_MALAM'
ALTER TABLE telegram_register_codes
  ALTER COLUMN outlet_id DROP NOT NULL;

COMMENT ON COLUMN telegram_register_codes.purpose IS
  'OUTLET (default, daftar grup ke 1 outlet) atau LAPORAN_MALAM (daftar grup global utk PDF laporan malam).';
