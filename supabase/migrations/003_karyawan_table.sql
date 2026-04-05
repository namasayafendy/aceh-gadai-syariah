-- ============================================================
-- ACEH GADAI SYARIAH - Karyawan Table
-- Migration: 003_karyawan_table.sql
--
-- Tabel ini menyimpan data kasir yang hanya pakai PIN
-- (tidak perlu login Supabase Auth mandiri)
-- Untuk validasi PIN di transaksi, mirip Users sheet GAS
-- ============================================================

CREATE TABLE IF NOT EXISTS karyawan (
  id          TEXT    PRIMARY KEY,             -- USR001, USR002, dst
  nama        TEXT    NOT NULL,
  username    TEXT    UNIQUE,
  pin         TEXT,                            -- 4-digit plain
  role        TEXT    NOT NULL DEFAULT 'KASIR'
              CHECK (role IN ('KASIR', 'ADMIN', 'OWNER')),
  outlet_id   INTEGER NOT NULL DEFAULT 1
              CHECK (outlet_id >= 0),
  status      TEXT    NOT NULL DEFAULT 'AKTIF'
              CHECK (status IN ('AKTIF', 'NONAKTIF')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER karyawan_updated_at
  BEFORE UPDATE ON karyawan
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS: hanya service_role yang bisa akses (via API routes)
ALTER TABLE karyawan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "karyawan_service_all" ON karyawan
  FOR ALL USING (auth.role() = 'service_role');

-- Kasir authenticated user bisa read semua karyawan di outlet yang sama
-- (untuk dropdown kasir di form transaksi)
CREATE POLICY "karyawan_read_own_outlet" ON karyawan
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'AKTIF'
        AND (p.outlet_id = 0 OR p.outlet_id = karyawan.outlet_id)
    )
  );

-- ── Seed karyawan dari GAS Users sheet ────────────────────────
INSERT INTO karyawan (id, nama, username, pin, role, outlet_id, status) VALUES
  -- Outlet Lhokseumawe (outlet_id = 1)
  ('USR001', 'Outlet Lhokseumawe', 'lhok',   NULL,   'KASIR', 1, 'AKTIF'),
  ('USR005', 'Ari',                'ari',    '1234', 'KASIR', 1, 'AKTIF'),
  -- Outlet Langsa (outlet_id = 2)
  ('USR002', 'Outlet Langsa',      'langsa', NULL,   'KASIR', 2, 'AKTIF'),
  ('USR006', 'Babi',               'babi',  '2345', 'KASIR', 2, 'AKTIF'),
  ('USR007', 'Farhan',             'farhan', '1111', 'KASIR', 2, 'AKTIF'),
  -- Owner/Admin (outlet_id = 0, bisa semua outlet)
  ('USR003', 'Admin Pusat',        'admin',  '6666', 'ADMIN', 0, 'AKTIF'),
  ('USR004', 'Fendy',              'owner',  '8888', 'OWNER', 0, 'AKTIF')
ON CONFLICT (id) DO NOTHING;

-- ── Update fungsi validate_pin untuk pakai tabel karyawan ────
-- (Lebih simpel, tidak perlu join auth.users)
CREATE OR REPLACE FUNCTION validate_pin(
  p_pin       TEXT,
  p_outlet_id INTEGER
)
RETURNS JSON AS $$
DECLARE
  rec RECORD;
BEGIN
  SELECT nama, role, outlet_id
  INTO   rec
  FROM   karyawan
  WHERE  pin = p_pin
    AND  status = 'AKTIF'
  LIMIT  1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'msg', 'PIN salah atau karyawan tidak aktif');
  END IF;

  -- outlet_id 0 = bisa di semua outlet
  IF rec.outlet_id != 0 AND rec.outlet_id != p_outlet_id THEN
    RETURN json_build_object(
      'ok',  false,
      'msg', 'PIN ini terdaftar untuk outlet lain. Gunakan PIN yang sesuai.'
    );
  END IF;

  RETURN json_build_object(
    'ok',        true,
    'nama',      rec.nama,
    'role',      rec.role,
    'outlet_id', rec.outlet_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
