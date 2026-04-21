-- ============================================================
-- ACEH GADAI SYARIAH - Transfer Reminder (Fase 2+)
-- File: supabase/migrations/006_transfer_reminder.sql
--
-- Tambah kolom reminder tracking supaya /api/transfer/remind
-- bisa kirim reminder berulang ke grup Telegram sampai request
-- di-approve/rejected.
--
-- TIDAK mengubah alur kas, tidak menghapus kolom existing.
-- ============================================================

ALTER TABLE tb_transfer_request
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0;

-- Index supaya scan cron cepat (hanya PENDING yang di-reminder)
CREATE INDEX IF NOT EXISTS idx_transfer_request_pending_remind
  ON tb_transfer_request(status, last_reminder_at)
  WHERE status = 'PENDING';

COMMENT ON COLUMN tb_transfer_request.last_reminder_at IS
  'Timestamp reminder terakhir dikirim ke grup Telegram. NULL = belum pernah.';
COMMENT ON COLUMN tb_transfer_request.reminder_count IS
  'Jumlah reminder yang sudah dikirim ke grup Telegram untuk request ini.';
