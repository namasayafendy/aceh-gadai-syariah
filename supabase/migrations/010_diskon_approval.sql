-- ============================================================
-- ACEH GADAI SYARIAH - Fase 3: Diskon Approval via Telegram
-- File: supabase/migrations/010_diskon_approval.sql
--
-- Tambah kolom approval ke tb_diskon supaya diskon ≥ Rp 10.000
-- wajib di-approve Owner via Telegram dulu sebelum transaksi
-- tebus/buyback benar-benar tercatat.
--
-- CATATAN PENTING:
-- - Kolom legacy `approved` text DEFAULT 'N' (dari GAS lama) TIDAK
--   disentuh — biar fungsi laporan & print yang sudah reference
--   kolom itu tetap jalan.
-- - Semua kolom baru bersifat ADDITIVE; baris lama otomatis
--   dapat status='DONE' (karena transaksi-nya sudah selesai jauh
--   sebelum Fase 3 aktif).
-- - Alur kas TIDAK disentuh — tabel ini hanya layer approval,
--   insert ke tb_kas baru terjadi setelah status='APPROVED' di
--   endpoint tebus/buyback.
-- ============================================================

-- ── 1. Kolom approval ───────────────────────────────────────
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS status              text
    NOT NULL DEFAULT 'DONE'
    CHECK (status IN ('PENDING','APPROVED','REJECTED','DONE','CANCELLED'));

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS id_parent           text;   -- jejak re-submission (ref ke id_diskon lama)

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS outlet_id           integer;  -- referensi outlets(id) untuk lookup chat

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS lama_gadai_hari     integer;  -- display di notif Telegram

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS requested_by_nama   text;     -- nama kasir yg request

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS requested_at        timestamptz;

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS approver_username   text;
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS approver_user_id    bigint;
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS approved_at         timestamptz;

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS rejected_by_username text;
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS rejected_by_user_id  bigint;
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS rejected_at          timestamptz;
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS alasan_reject        text;

ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS telegram_chat_id    bigint;
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS telegram_message_id bigint;

-- Flag "kasir sudah lanjutkan submit transaksi" — supaya
-- kalau browser di-refresh / timeout, status PENDING yang sudah
-- approved tidak di-klik ulang submit-nya.
ALTER TABLE tb_diskon
  ADD COLUMN IF NOT EXISTS finalized_at        timestamptz;

-- ── 2. Index untuk polling/subscription & laporan ──────────
CREATE INDEX IF NOT EXISTS idx_tb_diskon_status_pending
  ON tb_diskon(status, requested_at DESC)
  WHERE status IN ('PENDING','APPROVED','REJECTED');

CREATE INDEX IF NOT EXISTS idx_tb_diskon_outlet_tgl
  ON tb_diskon(outlet_id, tgl DESC);

CREATE INDEX IF NOT EXISTS idx_tb_diskon_id_parent
  ON tb_diskon(id_parent)
  WHERE id_parent IS NOT NULL;

-- ── 3. Comments untuk dokumentasi ──────────────────────────
COMMENT ON COLUMN tb_diskon.status              IS 'PENDING=menunggu owner, APPROVED=owner setuju (kasir boleh lanjut submit), REJECTED=owner tolak, DONE=transaksi sudah tercatat (termasuk legacy), CANCELLED=kasir batal.';
COMMENT ON COLUMN tb_diskon.id_parent           IS 'Kalau diskon ini resubmit dari yang di-reject, isi id_diskon parent-nya.';
COMMENT ON COLUMN tb_diskon.outlet_id           IS 'FK lunak ke outlets(id). Dipakai untuk lookup telegram_chat_id saat kirim notif.';
COMMENT ON COLUMN tb_diskon.lama_gadai_hari     IS 'Jumlah hari dari tgl gadai sampai tgl tebus. Ditampilkan di notif supaya Owner tahu diskonnya masuk akal atau tidak.';
COMMENT ON COLUMN tb_diskon.telegram_message_id IS 'Message ID pesan request di grup outlet. Dipakai editMessage saat approve/reject supaya pesan asli ter-update.';
COMMENT ON COLUMN tb_diskon.alasan_reject       IS 'Alasan reject yang dikirim Owner via reply ke pesan notif. Ditampilkan ke kasir.';
COMMENT ON COLUMN tb_diskon.finalized_at        IS 'Saat kasir benar-benar menekan "Lanjutkan" setelah APPROVED & transaksi tebus/buyback tercatat. Status berubah ke DONE.';

-- ── 4. Legacy data fix-up ──────────────────────────────────
-- Semua baris lama (sebelum Fase 3) otomatis DONE karena default,
-- tapi kita pastikan explicit untuk row yang sudah punya created_at.
UPDATE tb_diskon
   SET status = 'DONE'
 WHERE status IS NULL;
