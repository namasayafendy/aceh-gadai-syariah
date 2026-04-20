-- ============================================================
-- ACEH GADAI SYARIAH - Telegram Notification Infrastructure
-- File: supabase/migrations/004_telegram_infra.sql
--
-- Fase 1: Infrastruktur bot Telegram untuk notif transfer & diskon.
-- - outlets: tambah telegram_chat_id (grup per outlet)
-- - telegram_approvers: whitelist username yang boleh approve/reject
-- - telegram_register_codes: kode one-time utk daftar grup ke outlet
-- - telegram_log: audit log event telegram (debug & audit)
-- ============================================================

-- Kolom Telegram di outlets (idempotent)
ALTER TABLE outlets
  ADD COLUMN IF NOT EXISTS telegram_chat_id bigint,
  ADD COLUMN IF NOT EXISTS telegram_registered_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_group_title text;

CREATE INDEX IF NOT EXISTS idx_outlets_telegram_chat_id ON outlets(telegram_chat_id);

-- Whitelist approver (simple: semua approver bisa approve semua outlet)
CREATE TABLE IF NOT EXISTS telegram_approvers (
  id               serial PRIMARY KEY,
  username         text UNIQUE NOT NULL,        -- Telegram username (tanpa @)
  nama             text,                        -- Nama display di app
  telegram_user_id bigint,                      -- Auto-filled saat tap tombol pertama kali
  active           boolean NOT NULL DEFAULT true,
  last_action_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text
);

CREATE INDEX IF NOT EXISTS idx_telegram_approvers_username ON telegram_approvers(lower(username));
CREATE INDEX IF NOT EXISTS idx_telegram_approvers_user_id  ON telegram_approvers(telegram_user_id);

-- Kode one-time pairing grup Telegram ke outlet
CREATE TABLE IF NOT EXISTS telegram_register_codes (
  kode             text PRIMARY KEY,
  outlet_id        integer NOT NULL REFERENCES outlets(id),
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz,
  used_by_chat_id  bigint,
  used_by_user     text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  created_by       text
);

CREATE INDEX IF NOT EXISTS idx_telegram_register_codes_outlet ON telegram_register_codes(outlet_id);

-- Log semua event telegram untuk audit & debug
CREATE TABLE IF NOT EXISTS telegram_log (
  id             bigserial PRIMARY KEY,
  tgl            timestamptz NOT NULL DEFAULT now(),
  arah           text NOT NULL CHECK (arah IN ('IN','OUT')),
  chat_id        bigint,
  from_username  text,
  from_user_id   bigint,
  event          text,        -- 'message','callback','command_register','send_approval_req', dst
  payload        jsonb,
  error          text
);

CREATE INDEX IF NOT EXISTS idx_telegram_log_tgl ON telegram_log(tgl DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_log_chat ON telegram_log(chat_id, tgl DESC);

-- Comments untuk dokumentasi di Supabase Studio
COMMENT ON TABLE  telegram_approvers           IS 'Whitelist username Telegram yang boleh approve/reject transfer & diskon.';
COMMENT ON TABLE  telegram_register_codes      IS 'Kode one-time pairing grup Telegram ke outlet. Expire 15 menit.';
COMMENT ON TABLE  telegram_log                 IS 'Audit log event Telegram bot (incoming & outgoing).';
COMMENT ON COLUMN outlets.telegram_chat_id     IS 'Chat ID grup Telegram untuk notifikasi outlet ini. NULL = belum setup.';
