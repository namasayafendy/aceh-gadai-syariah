-- ============================================================
-- ACEH GADAI SYARIAH - Supabase Auth Schema
-- Migration: 001_auth_schema.sql
-- Phase 2: Login & Auth
-- ============================================================

-- ── OUTLETS TABLE ────────────────────────────────────────────
-- Menyimpan konfigurasi setiap outlet (replaces Setting sheet)
CREATE TABLE IF NOT EXISTS outlets (
  id            INTEGER PRIMARY KEY,          -- 1 = Lhokseumawe, 2 = Langsa, dst
  name          TEXT    NOT NULL,             -- "LHOKSEUMAWE"
  alamat        TEXT,
  kota          TEXT,
  telpon        TEXT,
  waktu_operasional TEXT DEFAULT 'Senin-Minggu & Libur Nasional : 10.00 - 22.00 WIB',
  nama_perusahaan   TEXT DEFAULT 'PT. ACEH GADAI SYARIAH',
  status_kepala_gudang TEXT DEFAULT 'ON',
  biaya_admin   INTEGER DEFAULT 10000,
  web_url       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data outlets dari GAS Setting sheet
INSERT INTO outlets (id, name, alamat, kota, telpon, waktu_operasional, nama_perusahaan, web_url) VALUES
  (1, 'LHOKSEUMAWE', 'Jl Perniagaan no.25',  'Lhokseumawe', '0813100899',
   'Senin-Minggu & Libur Nasional: 10.00 - 22.00 WIB', 'PT. ACEH GADAI SYARIAH', NULL),
  (2, 'LANGSA',      'Jl Teuku Umar no 82',  'Langsa',      '0813100899',
   'Senin-Minggu & Libur Nasional: 10.00 - 22.00 WIB', 'PT. ACEH GADAI SYARIAH', NULL)
ON CONFLICT (id) DO NOTHING;

-- ── PROFILES TABLE ───────────────────────────────────────────
-- Extends auth.users — menyimpan data karyawan & role
-- id harus match dengan auth.users.id (UUID dari Supabase Auth)
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID    PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama        TEXT    NOT NULL,
  username    TEXT    UNIQUE,
  pin         TEXT,                           -- 4-digit plain (sama seperti GAS)
  role        TEXT    NOT NULL DEFAULT 'KASIR'
              CHECK (role IN ('KASIR', 'ADMIN', 'OWNER')),
  outlet_id   INTEGER NOT NULL DEFAULT 1
              REFERENCES outlets(id),         -- 0 tidak bisa FK, handle via check
  status      TEXT    NOT NULL DEFAULT 'AKTIF'
              CHECK (status IN ('AKTIF', 'NONAKTIF')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- outlet_id = 0 berarti OWNER/ADMIN bisa akses semua outlet
-- Perlu disable FK check untuk 0
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_outlet_id_fkey;
ALTER TABLE profiles ADD CONSTRAINT profiles_outlet_id_check
  CHECK (outlet_id >= 0);

-- ── TRIGGER: auto-update updated_at ──────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER outlets_updated_at
  BEFORE UPDATE ON outlets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets  ENABLE ROW LEVEL SECURITY;

-- Profiles: user hanya bisa read profile diri sendiri
-- Admin/Owner bisa read semua profile di outlet mereka
CREATE POLICY "profiles_self_read" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Service role bisa semua (untuk API routes)
CREATE POLICY "profiles_service_all" ON profiles
  FOR ALL USING (auth.role() = 'service_role');

-- Outlets: semua authenticated user bisa read outlet mereka
CREATE POLICY "outlets_read_own" ON outlets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND (p.outlet_id = 0 OR p.outlet_id = outlets.id)
    )
  );

-- Service role bisa semua
CREATE POLICY "outlets_service_all" ON outlets
  FOR ALL USING (auth.role() = 'service_role');

-- ── HELPER FUNCTION: get user profile ────────────────────────
-- Dipakai di API routes untuk ambil profile + outlet info sekaligus
CREATE OR REPLACE FUNCTION get_user_profile(user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'id',         p.id,
    'nama',       p.nama,
    'username',   p.username,
    'role',       p.role,
    'outlet_id',  p.outlet_id,
    'status',     p.status,
    'outlet_name', COALESCE(o.name, 'ALL'),
    'show_branch_selector', (p.outlet_id = 0)
  ) INTO result
  FROM profiles p
  LEFT JOIN outlets o ON o.id = p.outlet_id
  WHERE p.id = user_id AND p.status = 'AKTIF';

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── FUNCTION: validate PIN (untuk kasir operations) ──────────
-- Mirip validatePin() di GAS Code.gs
-- Dipanggil via API route, bukan langsung dari client
CREATE OR REPLACE FUNCTION validate_pin(
  p_pin      TEXT,
  p_outlet_id INTEGER
)
RETURNS JSON AS $$
DECLARE
  result JSON;
  rec    RECORD;
BEGIN
  SELECT p.nama, p.role, p.outlet_id, e.email
  INTO   rec
  FROM   profiles p
  JOIN   auth.users e ON e.id = p.id
  WHERE  p.pin = p_pin
    AND  p.status = 'AKTIF'
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'PIN salah atau karyawan tidak aktif');
  END IF;

  -- Outlet check: outlet_id 0 = bisa di semua outlet
  IF rec.outlet_id != 0 AND rec.outlet_id != p_outlet_id THEN
    RETURN json_build_object('ok', false, 'msg', 'PIN ini terdaftar untuk outlet lain.');
  END IF;

  RETURN json_build_object(
    'ok',        true,
    'nama',      rec.nama,
    'role',      rec.role,
    'outlet_id', rec.outlet_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- CATATAN MIGRASI USERS:
-- Setelah menjalankan migration ini, buat user di Supabase Auth
-- (Authentication → Users → Add User) dengan email yang sama,
-- lalu insert ke profiles dengan UUID yang digenerate Supabase.
-- Script seed tersedia di: supabase/seed/002_seed_users.sql
-- ============================================================
