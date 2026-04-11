// ============================================================
// ACEH GADAI SYARIAH - Storage Backup Helper
// File: lib/storage/backup.ts
//
// Upload file ke Supabase Storage bucket 'backups'.
// Struktur folder:
//   /{outlet}/{yyyy-MM}/kontrak/{noFaktur}_{stamp}.html
//   /{outlet}/{yyyy-MM}/laporan/laporan_malam_{tgl}.html
//   /{outlet}/{yyyy-MM}/data/backup_{tgl}.json
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'backups';

function monthFolder(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7); // yyyy-MM
}

function todayStr(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // yyyy-MM-dd
}

function stamp(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .replace(/[: ]/g, '').replace(/-/g, '').substring(0, 13); // yyyyMMddHHmmss → 13 chars
}

// ─── Upload kontrak HTML (per transaksi) ─────────────────────
export async function uploadKontrak(
  db:         SupabaseClient,
  outletName: string,
  noFaktur:   string,
  html:       string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const path = `${outletName}/${monthFolder()}/kontrak/${noFaktur}_${stamp()}.html`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, html, { contentType: 'text/html; charset=utf-8', upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

// ─── Upload laporan malam HTML ────────────────────────────────
export async function uploadLaporanMalam(
  db:         SupabaseClient,
  outletName: string,
  tgl:        string,   // yyyy-MM-dd
  html:       string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const month = tgl.substring(0, 7);
  const path  = `${outletName}/${month}/laporan/laporan_malam_${tgl}.html`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, html, { contentType: 'text/html; charset=utf-8', upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

// ─── Upload backup JSON semua tabel ──────────────────────────
export async function uploadDataBackup(
  db:         SupabaseClient,
  outletName: string,
  tgl:        string,
  json:       string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const month = tgl.substring(0, 7);
  const path  = `${outletName}/${month}/data/backup_${tgl}.json`;
  const { error } = await db.storage
    .from(BUCKET)
    .upload(path, json, { contentType: 'application/json; charset=utf-8', upsert: true });
  if (error) return { ok: false, error: error.message };
  return { ok: true, path };
}

// ─── List backup files per outlet per bulan ──────────────────
export async function listBackups(
  db:         SupabaseClient,
  outletName: string,
  month:      string   // yyyy-MM
): Promise<{ kontrak: string[]; laporan: string[]; data: string[] }> {
  const base = `${outletName}/${month}`;
  const list = async (folder: string) => {
    const { data } = await db.storage.from(BUCKET).list(`${base}/${folder}`);
    return (data ?? []).map(f => f.name).sort().reverse();
  };
  const [kontrak, laporan, data] = await Promise.all([
    list('kontrak'), list('laporan'), list('data'),
  ]);
  return { kontrak, laporan, data };
}
