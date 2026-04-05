-- ============================================================
-- ACEH GADAI SYARIAH - Seed Users
-- Migration: 002_seed_users.sql
-- 
-- CARA PAKAI:
-- 1. Buka Supabase Dashboard → Authentication → Users
-- 2. Klik "Add User" untuk setiap email di bawah
-- 3. Setelah user dibuat, Supabase generate UUID otomatis
-- 4. Copy UUID tersebut, replace placeholder di bawah ini
-- 5. Jalankan SQL ini di Supabase SQL Editor
-- ============================================================

-- ── STEP 1: Buat user di Supabase Auth dulu via Dashboard ───
-- Email yang perlu didaftarkan:
--   ariey.steven98@gmail.com       → ADMIN, outlet 0
--   bos@acehgadaisyariah.com       → OWNER, outlet 0
--   farhanmuhammadc867@gmail.com   → KASIR, outlet 2
--
-- Untuk kasir tanpa email (ari, babi, dll):
--   Buat email dummy: ari@lhokseumawe.acehgadai.local (tidak dipakai login)
--   Atau: login via PIN saja tanpa Supabase Auth (hanya untuk transaksi)
--   → Kasir tanpa email TIDAK PERLU ada di auth.users
--   → Mereka login pakai PIN di dalam app setelah OWNER/ADMIN login

-- ── STEP 2: Insert profiles ───────────────────────────────────
-- GANTI UUID placeholder dengan UUID dari Supabase Auth Dashboard

-- OWNER - Fendy
INSERT INTO profiles (id, nama, username, pin, role, outlet_id, status) VALUES
  ('0dbb69bf-bb7c-4a26-805e-7445ece70987', 'Fendy', 'owner', '8888', 'OWNER', 0, 'AKTIF')
ON CONFLICT (id) DO UPDATE SET
  nama = EXCLUDED.nama, pin = EXCLUDED.pin,
  role = EXCLUDED.role, outlet_id = EXCLUDED.outlet_id, updated_at = NOW();

-- ADMIN - Admin Pusat
INSERT INTO profiles (id, nama, username, pin, role, outlet_id, status) VALUES
  ('adf10bb4-f127-4303-9c0b-9c1c2b0537a1', 'Admin Pusat', 'admin', '6666', 'ADMIN', 0, 'AKTIF')
ON CONFLICT (id) DO UPDATE SET
  nama = EXCLUDED.nama, pin = EXCLUDED.pin,
  role = EXCLUDED.role, outlet_id = EXCLUDED.outlet_id, updated_at = NOW();

-- KASIR - kasir test (Outlet 2 Langsa, punya email)
INSERT INTO profiles (id, nama, username, pin, role, outlet_id, status) VALUES
  ('a52304e9-e0ac-43ce-86d0-db361df05770', 'Farhan', 'farhan', '1111', 'KASIR', 2, 'AKTIF')
ON CONFLICT (id) DO UPDATE SET
  nama = EXCLUDED.nama, pin = EXCLUDED.pin, updated_at = NOW();

-- ── CATATAN KASIR TANPA EMAIL ──────────────────────────────────
-- Kasir: ari (PIN 1234, outlet 1), babi (PIN 2345, outlet 2)
-- Mereka TIDAK login ke web app secara mandiri.
-- Mereka dikonfirmasi via PIN saat ADMIN/OWNER sudah login.
-- Data kasir disimpan di tabel karyawan (bukan profiles/auth.users)
-- → Lihat: 003_karyawan_table.sql

-- ── STEP 3: Verifikasi ────────────────────────────────────────
-- Jalankan query ini untuk cek:
-- SELECT p.nama, p.role, p.outlet_id, o.name as outlet_name, u.email
-- FROM profiles p
-- JOIN auth.users u ON u.id = p.id
-- LEFT JOIN outlets o ON o.id = p.outlet_id
-- ORDER BY p.outlet_id, p.role;
