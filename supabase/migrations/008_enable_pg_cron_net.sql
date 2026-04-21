-- ============================================================
-- ACEH GADAI SYARIAH - Enable pg_cron + pg_net
-- File: supabase/migrations/008_enable_pg_cron_net.sql
--
-- Enable dua extension supaya Supabase bisa:
--   - pg_net: kirim HTTP request dari DB (memanggil endpoint Next.js)
--   - pg_cron: jadwal job (call endpoint tiap menit)
--
-- Dipakai oleh cron "transfer-remind" (lihat 009).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;
