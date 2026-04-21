-- ============================================================
-- ACEH GADAI SYARIAH - Transfer Reminder: track last reminder msg
-- File: supabase/migrations/007_transfer_reminder_msgid.sql
--
-- Tambah kolom last_reminder_message_id supaya cron bisa HAPUS
-- reminder lama sebelum kirim reminder baru → chat Telegram tidak
-- spam (selalu cuma 1 pesan reminder aktif + pesan asli).
--
-- Pesan asli (telegram_message_id) TIDAK disentuh; ini kolom terpisah
-- yang hanya tracking reminder terakhir.
-- ============================================================

ALTER TABLE tb_transfer_request
  ADD COLUMN IF NOT EXISTS last_reminder_message_id bigint;

COMMENT ON COLUMN tb_transfer_request.last_reminder_message_id IS
  'Message ID reminder terakhir di Telegram. Dihapus sebelum kirim reminder baru supaya chat tidak spam. NULL = belum pernah ada reminder.';
