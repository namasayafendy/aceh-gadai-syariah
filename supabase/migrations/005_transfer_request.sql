-- ============================================================
-- ACEH GADAI SYARIAH - Transfer Request (Fase 2)
-- File: supabase/migrations/005_transfer_request.sql
--
-- Tabel transfer request untuk approval via Telegram.
-- Dipicu saat transaksi GADAI, TAMBAH (tebus), atau SJB
-- dibayar via BANK/SPLIT (bank portion > 0).
--
-- CATATAN PENTING:
-- Tabel ini TIDAK mengubah alur kas existing. Kas tetap tercatat
-- seperti biasa oleh fungsi gadai/tebus/sjb. Tabel ini hanya
-- sebagai audit trail approval & bukti transfer.
-- ============================================================

CREATE TABLE IF NOT EXISTS tb_transfer_request (
  id                bigserial PRIMARY KEY,
  outlet_id         integer NOT NULL REFERENCES outlets(id),

  -- Sumber transaksi
  tipe              text NOT NULL CHECK (tipe IN ('GADAI','TAMBAH','SJB')),
  ref_table         text NOT NULL,               -- nama tabel sumber (tb_gadai / tb_tebus / tb_sjb)
  ref_no_faktur     text,                        -- no_faktur transaksi (untuk display)
  ref_id            bigint,                      -- id numerik transaksi (optional fallback)

  -- Detail transfer
  nominal           numeric(14,2) NOT NULL,
  nama_penerima     text NOT NULL,
  no_rek            text NOT NULL,
  bank             text NOT NULL,
  catatan           text,

  -- Status flow: PENDING -> APPROVED -> DONE (bukti sudah diupload)
  --              PENDING -> REJECTED
  status            text NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','APPROVED','REJECTED','DONE')),

  -- Requester (kasir)
  requested_by_nama text NOT NULL,
  requested_at      timestamptz NOT NULL DEFAULT now(),

  -- Telegram message (untuk edit/reply)
  telegram_chat_id  bigint,
  telegram_message_id bigint,

  -- Approval
  approved_by_username text,
  approved_by_user_id  bigint,
  approved_at          timestamptz,

  -- Rejection
  rejected_by_username text,
  rejected_by_user_id  bigint,
  rejected_at          timestamptz,
  rejection_reason     text,

  -- Bukti transfer (foto)
  bukti_file_id        text,        -- Telegram file_id
  bukti_storage_path   text,        -- path di Supabase Storage
  bukti_uploaded_at    timestamptz,
  bukti_uploaded_by_username text
);

CREATE INDEX IF NOT EXISTS idx_transfer_request_outlet
  ON tb_transfer_request(outlet_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_request_status
  ON tb_transfer_request(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_request_msg
  ON tb_transfer_request(telegram_chat_id, telegram_message_id)
  WHERE telegram_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transfer_request_ref
  ON tb_transfer_request(ref_table, ref_no_faktur);

COMMENT ON TABLE  tb_transfer_request IS
  'Fase 2: Transfer request untuk approval via Telegram. Tidak mempengaruhi alur kas existing.';
COMMENT ON COLUMN tb_transfer_request.tipe IS
  'Jenis transaksi sumber: GADAI (gadai baru), TAMBAH (tambah pinjaman via tebus), SJB (surat jual beli).';
COMMENT ON COLUMN tb_transfer_request.status IS
  'PENDING=menunggu approval, APPROVED=sudah diapprove tunggu bukti, DONE=bukti upload, REJECTED=ditolak.';
COMMENT ON COLUMN tb_transfer_request.bukti_storage_path IS
  'Path di Supabase Storage (bucket: telegram-bukti). NULL = bukti belum diupload.';
