-- ============================================================
-- ACEH GADAI SYARIAH - OTP Login + Single Session (Migration 012)
-- File: supabase/migrations/012_otp_login_session.sql
--
-- Tujuan:
--  1. Single-session per user (KASIR + ADMIN auto-kick saat login di
--     browser baru). OWNER bypass.
--  2. Auto-logout 20 jam (KASIR + ADMIN). OWNER bypass.
--  3. OTP via Telegram setiap login KASIR + ADMIN. OWNER bypass.
--     Master OTP fallback yg dikelola Owner di dashboard.
--
-- Semua additive — tidak menyentuh kolom existing.
-- ============================================================

-- 1. profiles: tambah kolom session
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS active_session_id text NULL;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS session_started_at timestamptz NULL;

COMMENT ON COLUMN profiles.active_session_id IS
  'UUID sesi aktif. AuthProvider polling tiap 15 detik membandingkan dgn cookie. Mismatch -> auto logout. NULL utk OWNER (bypass).';
COMMENT ON COLUMN profiles.session_started_at IS
  'Waktu login terakhir. Dipakai utk auto-logout 20 jam (KASIR/ADMIN).';

-- 2. tb_login_otp: ticket OTP login
CREATE TABLE IF NOT EXISTS tb_login_otp (
  id           bigserial PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  outlet_id    integer,
  outlet_nama  text,
  role         text,
  kode         text NOT NULL,                       -- 6 digit
  ticket_id    text NOT NULL UNIQUE,                -- UUID, dipegang client
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz NULL,
  resend_count integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS tb_login_otp_user_idx
  ON tb_login_otp (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tb_login_otp_ticket_idx
  ON tb_login_otp (ticket_id) WHERE used_at IS NULL;

COMMENT ON TABLE tb_login_otp IS
  'OTP login KASIR/ADMIN via Telegram. Ticket berlaku 5 menit, sekali pakai.';

-- 3. app_settings: 4 key baru utk OTP
INSERT INTO app_settings (key, value, updated_by)
VALUES ('otp_login_chat_id', NULL, 'migration_012')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_by)
VALUES ('otp_login_group_title', NULL, 'migration_012')
ON CONFLICT (key) DO NOTHING;

INSERT INTO app_settings (key, value, updated_by)
VALUES ('otp_login_registered_at', NULL, 'migration_012')
ON CONFLICT (key) DO NOTHING;

-- Master OTP awal random 6 digit. Owner ubah di Owner Dashboard.
INSERT INTO app_settings (key, value, updated_by)
VALUES (
  'otp_master_code',
  lpad(floor(random() * 1000000)::text, 6, '0'),
  'migration_012'
)
ON CONFLICT (key) DO NOTHING;

-- 4. Cleanup OTP expired (>1 hari) — best-effort, tidak crucial
-- Bisa dipanggil dari cron nanti kalau perlu. Untuk saat ini tidak auto.
