// ============================================================
// ACEH GADAI SYARIAH - Core Backup Runner
// File: lib/backup/runBackup.ts
//
// Shared backup logic dipanggil dari:
//   1. /api/backup/nightly (Vercel Cron, 23:00 WIB)
//   2. /api/backup/list POST (manual trigger via tombol)
//
// Untuk SETIAP outlet aktif:
//   - Dump semua tabel transaksi ke JSON → upload ke Storage
//   - Build laporan malam HTML → upload ke Storage
//   - Catat di audit_log
//
// ALUR KAS TIDAK DIUBAH
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadDataBackup, uploadLaporanMalam } from '@/lib/storage/backup';

const BACKUP_TABLES = [
  'tb_gadai', 'tb_sjb', 'tb_tebus', 'tb_buyback',
  'tb_kas', 'tb_gudang_sita', 'tb_serah_terima',
  'tb_gudang_aset', 'tb_jual_bon', 'tb_jual_bon_detail',
  'tb_diskon', 'karyawan', 'tb_rak',
  'tb_transfer_request',            // Fase 2: audit transfer approval
] as const;

export interface BackupResult {
  ok: boolean;
  tgl: string;
  results: Record<string, { json?: string; laporan?: string; error?: string }>;
  message: string;
}

export async function runNightlyBackup(db: SupabaseClient): Promise<BackupResult> {
  const tgl = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const results: Record<string, { json?: string; laporan?: string; error?: string }> = {};

  // Ambil semua outlet aktif
  const { data: outlets } = await db.from('outlets').select('id, nama').order('id');
  if (!outlets || outlets.length === 0) {
    return { ok: false, tgl, results, message: 'Tidak ada outlet.' };
  }

  for (const outlet of outlets) {
    const outletName = String((outlet as any).nama);
    const outletId = Number((outlet as any).id);
    results[outletName] = {};

    try {
      // ── 1. Dump semua tabel ke JSON ───────────────────────
      const backup: Record<string, unknown[]> = {
        _meta: {
          outlet: outletName,
          outlet_id: outletId,
          tgl_backup: tgl,
          dibuat: new Date().toISOString(),
          versi: '1.0',
        } as unknown as unknown[],
      };

      for (const tabel of BACKUP_TABLES) {
        try {
          let query;
          if (['tb_gadai', 'tb_sjb', 'tb_rak', 'tb_transfer_request'].includes(tabel)) {
            query = db.from(tabel).select('*').eq('outlet_id', outletId);
          } else if (tabel === 'karyawan') {
            query = db.from(tabel).select('*')
              .or(`outlet_id.eq.${outletId},outlet_id.eq.0`);
          } else {
            query = db.from(tabel).select('*').eq('outlet', outletName);
          }

          const { data: rows, error } = await query;
          if (error) {
            backup[tabel] = [{ _error: error.message }];
          } else {
            backup[tabel] = rows ?? [];
          }
        } catch (e) {
          backup[tabel] = [{ _error: String(e) }];
        }
      }

      const json = JSON.stringify(backup, null, 2);
      const jsonResult = await uploadDataBackup(db, outletName, tgl, json);
      if (jsonResult.ok) {
        results[outletName].json = jsonResult.path;
      } else {
        results[outletName].error = 'JSON: ' + jsonResult.error;
      }

      // ── 2. Build & upload laporan malam HTML ──────────────
      const laporanHtml = buildLaporanMalamHtml(outletName, tgl, backup);
      const laporanResult = await uploadLaporanMalam(db, outletName, tgl, laporanHtml);
      if (laporanResult.ok) {
        results[outletName].laporan = laporanResult.path;
      } else {
        results[outletName].error = (results[outletName].error ?? '')
          + ' Laporan: ' + laporanResult.error;
      }

    } catch (outletErr) {
      results[outletName].error = String(outletErr);
    }
  }

  // Audit log
  await db.from('audit_log').insert({
    user_nama: 'SYSTEM',
    tabel: 'backup_nightly',
    record_id: tgl,
    aksi: 'BACKUP',
    field: 'ALL',
    nilai_baru: JSON.stringify({ outlets: Object.keys(results), tgl }),
    outlet: 'ALL',
  });

  return {
    ok: true,
    tgl,
    results,
    message: `Backup selesai untuk ${Object.keys(results).length} outlet.`,
  };
}

// ─── Build laporan malam HTML sederhana untuk backup ─────────
function buildLaporanMalamHtml(
  outletName: string,
  tgl: string,
  backup: Record<string, unknown[]>
): string {
  const fmtRp = (v: unknown) => 'Rp ' + (parseFloat(String(v ?? 0)) || 0).toLocaleString('id-ID');
  const now = new Date().toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' });

  const gadaiRows = (backup['tb_gadai'] as Record<string, unknown>[] ?? [])
    .filter(r => String(r.tgl_gadai ?? '').substring(0, 10) === tgl && r.status !== 'BATAL');
  const sjbRows = (backup['tb_sjb'] as Record<string, unknown>[] ?? [])
    .filter(r => String(r.tgl_gadai ?? '').substring(0, 10) === tgl && r.status !== 'BATAL');
  const tebusRows = (backup['tb_tebus'] as Record<string, unknown>[] ?? [])
    .filter(r => String(r.tgl ?? '').substring(0, 10) === tgl && r.status !== 'BATAL');
  const buybackRows = (backup['tb_buyback'] as Record<string, unknown>[] ?? [])
    .filter(r => String(r.tgl ?? '').substring(0, 10) === tgl && r.status !== 'BATAL');
  const kasRows = (backup['tb_kas'] as Record<string, unknown>[] ?? [])
    .filter(r => String(r.tgl ?? '').substring(0, 10) === tgl);

  const totalGadai = gadaiRows.reduce((s, r) => s + (parseFloat(String(r.jumlah_gadai ?? 0))), 0);
  const totalSJB = sjbRows.reduce((s, r) => s + (parseFloat(String(r.harga_jual ?? 0))), 0);
  const totalTebus = tebusRows.reduce((s, r) => s + (parseFloat(String(r.jumlah_bayar ?? 0))), 0);
  const totalBuyback = buybackRows.reduce((s, r) => s + (parseFloat(String(r.jumlah_bayar ?? 0))), 0);
  const kasMasuk = kasRows.filter(r => r.tipe === 'MASUK').reduce((s, r) => s + parseFloat(String(r.jumlah ?? 0)), 0);
  const kasKeluar = kasRows.filter(r => r.tipe === 'KELUAR').reduce((s, r) => s + parseFloat(String(r.jumlah ?? 0)), 0);

  const ts = `padding:6px 8px;background:#f0f0f0;border:1px solid #ccc;text-align:left;font-size:10px`;
  const td = `padding:5px 8px;border:1px solid #ddd`;
  const tbl = `width:100%;border-collapse:collapse;font-size:11px;margin-bottom:16px`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Laporan Malam ${outletName} ${tgl}</title>
    <style>
      body{font-family:Arial,sans-serif;font-size:12px;padding:20px;max-width:900px;margin:auto}
      h1{font-size:16px;margin-bottom:4px} h2{font-size:13px;margin:16px 0 8px;border-bottom:2px solid #000;padding-bottom:4px}
      .rekap{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px}
      .rekap-card{border:1px solid #ccc;border-radius:4px;padding:8px 10px;text-align:center}
      .rekap-card .lbl{font-size:9px;color:#666;margin-bottom:4px}
      .rekap-card .val{font-size:13px;font-weight:bold;font-family:monospace}
      @media print{body{padding:10px}}
    </style></head><body>
    <h1>LAPORAN MALAM — ${outletName.toUpperCase()}</h1>
    <p style="font-size:11px;color:#666;margin-bottom:12px">Tanggal: <b>${tgl}</b> | Dibuat: ${now}</p>
    <div class="rekap">
      <div class="rekap-card"><div class="lbl">Gadai Keluar</div><div class="val" style="color:#dc2626">${fmtRp(totalGadai)}</div></div>
      <div class="rekap-card"><div class="lbl">SJB Keluar</div><div class="val" style="color:#d97706">${fmtRp(totalSJB)}</div></div>
      <div class="rekap-card"><div class="lbl">Tebus Masuk</div><div class="val" style="color:#059669">${fmtRp(totalTebus)}</div></div>
      <div class="rekap-card"><div class="lbl">Buyback Masuk</div><div class="val" style="color:#0891b2">${fmtRp(totalBuyback)}</div></div>
    </div>
    <div class="rekap">
      <div class="rekap-card"><div class="lbl">Gadai Baru</div><div class="val">${gadaiRows.length} trx</div></div>
      <div class="rekap-card"><div class="lbl">SJB Baru</div><div class="val">${sjbRows.length} trx</div></div>
      <div class="rekap-card"><div class="lbl">Kas Masuk</div><div class="val" style="color:#059669">${fmtRp(kasMasuk)}</div></div>
      <div class="rekap-card"><div class="lbl">Kas Keluar</div><div class="val" style="color:#dc2626">${fmtRp(kasKeluar)}</div></div>
    </div>
    <h2>Gadai Baru (${gadaiRows.length})</h2>
    <table style="${tbl}"><thead><tr><th style="${ts}">No Faktur</th><th style="${ts}">Nama</th><th style="${ts}">Barang</th><th style="${ts};text-align:right">Jumlah</th><th style="${ts}">Kasir</th></tr></thead><tbody>
    ${gadaiRows.map(r => `<tr><td style="${td}">${r.no_faktur ?? ''}</td><td style="${td}">${r.nama ?? ''}</td><td style="${td}">${r.kategori ?? ''} / ${r.barang ?? ''}</td><td style="${td};text-align:right;font-family:monospace">${fmtRp(r.jumlah_gadai)}</td><td style="${td}">${r.kasir ?? ''}</td></tr>`).join('')}
    </tbody></table>
    <h2>SJB Baru (${sjbRows.length})</h2>
    ${sjbRows.length === 0 ? '<p style="color:#888;font-size:11px">Tidak ada.</p>' : `<table style="${tbl}"><thead><tr><th style="${ts}">No SJB</th><th style="${ts}">Nama</th><th style="${ts}">Barang</th><th style="${ts};text-align:right">Harga Jual</th><th style="${ts}">Kasir</th></tr></thead><tbody>
    ${sjbRows.map(r => `<tr><td style="${td}">${r.no_faktur ?? ''}</td><td style="${td}">${r.nama ?? ''}</td><td style="${td}">${r.kategori ?? ''} / ${r.barang ?? ''}</td><td style="${td};text-align:right;font-family:monospace">${fmtRp(r.harga_jual)}</td><td style="${td}">${r.kasir ?? ''}</td></tr>`).join('')}
    </tbody></table>`}
    <h2>Tebus & Buyback (${tebusRows.length + buybackRows.length})</h2>
    ${[...tebusRows, ...buybackRows].length === 0 ? '<p style="color:#888;font-size:11px">Tidak ada.</p>' : `<table style="${tbl}"><thead><tr><th style="${ts}">No Faktur</th><th style="${ts}">Nama</th><th style="${ts}">Status</th><th style="${ts};text-align:right">Jumlah Bayar</th><th style="${ts}">Kasir</th></tr></thead><tbody>
    ${[...tebusRows, ...buybackRows].map(r => `<tr><td style="${td}">${r.no_faktur ?? ''}</td><td style="${td}">${r.nama_nasabah ?? r.nama ?? ''}</td><td style="${td}">${r.status ?? ''}</td><td style="${td};text-align:right;font-family:monospace">${fmtRp(r.jumlah_bayar)}</td><td style="${td}">${r.kasir ?? ''}</td></tr>`).join('')}
    </tbody></table>`}
    <p style="font-size:10px;color:#999;margin-top:20px;border-top:1px solid #eee;padding-top:8px">
      File ini dibuat otomatis oleh sistem Aceh Gadai Syariah.
    </p>
  </body></html>`;
}
