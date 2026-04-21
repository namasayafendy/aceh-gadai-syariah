-- ============================================================
-- ACEH GADAI SYARIAH - Schedule transfer-remind cron
-- File: supabase/migrations/009_schedule_transfer_remind.sql
--
-- Jadwal pg_cron tiap menit untuk panggil endpoint
-- /api/transfer/remind. Secret disimpan di supabase_vault.
--
-- CARA PAKAI (sekali jalan):
--   1. Ganti placeholder CRON_SECRET_VALUE di bawah.
--   2. Paste seluruh script ini ke Supabase SQL Editor → Run.
--
-- Kalau nanti secret berubah, unschedule dulu lalu jalankan
-- lagi. Atau pakai vault.update_secret.
-- ============================================================

-- Pastikan extension aktif (idempotent)
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. Simpan secret ke vault (idempotent)
--    Kalau nama 'cron_secret' sudah ada, update; kalau belum, insert.
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'cron_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret('REPLACE_DENGAN_CRON_SECRET_ANDA', 'cron_secret');
  ELSE
    PERFORM vault.update_secret(v_id, 'REPLACE_DENGAN_CRON_SECRET_ANDA', 'cron_secret');
  END IF;
END $$;

-- 2. Hapus schedule lama kalau ada (supaya tidak duplikat)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'transfer-remind') THEN
    PERFORM cron.unschedule('transfer-remind');
  END IF;
END $$;

-- 3. Jadwalkan cron tiap menit.
--    Ganti URL kalau domain berbeda.
SELECT cron.schedule(
  'transfer-remind',
  '* * * * *',
  $cron$
    SELECT net.http_post(
      url := 'https://aceh-gadai-syariah.vercel.app/api/transfer/remind',
      headers := jsonb_build_object(
        'Authorization',
        'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret'),
        'Content-Type',
        'application/json'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 55000
    );
  $cron$
);

-- 4. Cek status
SELECT jobid, jobname, schedule, active FROM cron.job WHERE jobname = 'transfer-remind';
