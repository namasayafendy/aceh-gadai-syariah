// ============================================================
// ACEH GADAI SYARIAH - Storage Backup Helper
// File: lib/storage/backup.ts
//
// Upload file ke Supabase Storage bucket 'backups'.
// Struktur folder:
//   /{outlet}/{yyyy-MM}/kontrak/{noFaktur}_{stamp}.html
//   /{outlet}/{yyyy-MM}/laporan/laporan_malam_{tgl}.html
//   /{outlet}/{yyyy-MM}/data/backup_{tgl}.json
//
// NOTE: Upload pakai Buffer (bukan plain string) supaya reliable
// di Node.js / Vercel serverless environment.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKET = 'backups';

function monthFolder(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7); // yyyy-MM
}

function stamp(): string {
  return new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .replace(/[: ]/g, '').replace(/-/g, '').substring(0, 13); // yyyyMMddHHmmss → 13 chars
}

// Helper: upload with Buffer + detailed error
async function doUpload(
  db: SupabaseClient, path: string, content: string, contentType: string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const buf = Buffer.from(content, 'utf-8');
    const { error } = await db.storage
      .from(BUCKET)
      .upload(path, buf, { contentType, upsert: true });
    if (error) return { ok: false, error: `Storage upload error [${path}]: ${error.message}` };
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: `Upload exception [${path}]: ${String(e)}` };
  }
}

// ─── Upload kontrak HTML (per transaksi) ─────────────────────
export async function uploadKontrak(
  db:         SupabaseClient,
  outletName: string,
  noFaktur:   string,
  html:       string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const path = `${outletName}/${monthFolder()}/kontrak/${noFaktur}_${stamp()}.html`;
  return doUpload(db, path, html, 'text/html; charset=utf-8');
}

// ─── Upload laporan malam HTML ────────────────────────────────
export async function uploadLaporanMalam(
  db:         SupabaseClient,
  outletName: string,
  tgl:        string,
  html:       string
): Promise<{ ok: boolean; path?: string; error?: string }> {
  const month = tgl.substring(0, 7);
  const path  = `${outletName}/${month}/laporan/laporan_malam_${tgl}.html`;
  return doUpload(db, path, html, 'text/html; charset=utf-8');
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
  return doUpload(db, path, json, 'application/json; charset=utf-8');
}

// ─── List backup files per outlet per bulan ──────────────────
export async function listBackups(
  db:         SupabaseClient,
  outletName: string,
  month:      string
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
