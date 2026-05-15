// ============================================================
// File: app/api/wa/cron-reminder/route.ts
//
// CRON harian — kirim reminder WA H-1, H, H+1 untuk:
//   - tgl_jt (jatuh tempo)  → template JT_GADAI_* / JT_SJB_*
//   - tgl_sita (masa sita)  → template SITA_GADAI_* (gadai only)
//
// Schedule (vercel.json): "0 2 * * *" = 09:00 WIB tiap hari
// Dilindungi CRON_SECRET (header Authorization: Bearer <secret>)
//
// SAFETY:
// - Hanya kontrak status=AKTIF yang di-pickup (status SITA/JUAL/TEBUS auto-skip)
// - reminder_state HUMAN_HANDLING / MANUAL_CONTACTED skip (kasir sedang nego)
// - opt_out_wa=true skip
// - Dedupe by template_code + ref_id dalam 12 jam (built-in di sender)
// - Fire-and-forget queueWA — kalau provider gagal, lanjut ke kontrak berikut
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { queueWA } from '@/lib/wa/sender';

export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
}

/**
 * Get today's date as 'YYYY-MM-DD' in Asia/Jakarta timezone.
 */
function todayWIB(): string {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/**
 * Get day-diff between two dates (date-only, Asia/Jakarta).
 * Return: target_date - reference_date in DAYS.
 * Positive = target is in the future. Negative = past.
 */
function dayDiffWIB(target: string | Date | null | undefined, ref: string): number | null {
  if (!target) return null;
  const t = typeof target === 'string' ? new Date(target) : target;
  if (isNaN(t.getTime())) return null;
  const targetIsoDate = t.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
  const t2 = new Date(targetIsoDate + 'T00:00:00Z').getTime();
  const r2 = new Date(ref + 'T00:00:00Z').getTime();
  return Math.round((t2 - r2) / 86400000);
}

/**
 * Format YYYY-MM-DD ISO date ke dd/mm/yyyy untuk template.
 */
function fmtDateID(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta',
  });
}

interface JobStats {
  scannedGadai: number;
  scannedSjb: number;
  fired: number;
  skipped: number;
  byTemplate: Record<string, number>;
}

async function runJob(): Promise<JobStats> {
  const db = await createServiceClient();
  const today = todayWIB();

  const stats: JobStats = {
    scannedGadai: 0,
    scannedSjb: 0,
    fired: 0,
    skipped: 0,
    byTemplate: {},
  };

  // Range: ambil kontrak yang tgl_jt ATAU tgl_sita dalam ±2 hari dari today
  // (lebih luas dikit untuk jaga timezone edge case)
  const rangeStart = new Date(new Date(today + 'T00:00:00+07:00').getTime() - 2 * 86400000).toISOString();
  const rangeEnd = new Date(new Date(today + 'T23:59:59+07:00').getTime() + 2 * 86400000).toISOString();

  // ── 1. Scan tb_gadai AKTIF dengan tgl_jt/tgl_sita di range ──
  const { data: gadaiRows } = await db
    .from('tb_gadai')
    .select('id, no_faktur, outlet_id, nama, telp1, telp2, barang, jumlah_gadai, ujrah_nominal, tgl_jt, tgl_sita, reminder_state, reminder_next_at, opt_out_wa')
    .eq('status', 'AKTIF')
    .or(`tgl_jt.gte.${rangeStart},tgl_sita.gte.${rangeStart}`)
    .or(`tgl_jt.lte.${rangeEnd},tgl_sita.lte.${rangeEnd}`);

  for (const r of (gadaiRows ?? []) as any[]) {
    stats.scannedGadai++;
    const skip = skipCheck(r);
    if (skip) { stats.skipped++; continue; }

    const diffJt = dayDiffWIB(r.tgl_jt, today);
    const diffSita = dayDiffWIB(r.tgl_sita, today);

    // Pilih template berdasarkan jarak. Prioritas: sita > jt karena sita lebih urgent.
    let tplCode = '';
    if (diffSita === 1) tplCode = 'SITA_GADAI_H_MIN_1';
    else if (diffSita === 0) tplCode = 'SITA_GADAI_H_0';
    else if (diffSita === -1) tplCode = 'SITA_GADAI_H_PLUS_1';
    else if (diffJt === 1) tplCode = 'JT_GADAI_H_MIN_1';
    else if (diffJt === 0) tplCode = 'JT_GADAI_H_0';
    else if (diffJt === -1) tplCode = 'JT_GADAI_H_PLUS_1';

    if (!tplCode) { continue; } // kontrak ini bukan due hari ini

    const ujrah = Number(r.ujrah_nominal || 0);
    const jmlGadai = Number(r.jumlah_gadai || 0);

    try {
      queueWA({
        outletId: Number(r.outlet_id),
        templateCode: tplCode,
        vars: {
          nama: r.nama ?? '',
          no_faktur: r.no_faktur ?? '',
          barang: r.barang ?? '',
          tgl_jt: fmtDateID(r.tgl_jt),
          tgl_sita: fmtDateID(r.tgl_sita),
          estimasi_tebus: jmlGadai + ujrah,
          estimasi_ujrah: ujrah,
        },
        toNumber: r.telp1 ?? '',
        toNumber2: r.telp2 ?? undefined,
        refTable: 'tb_gadai',
        refId: r.id,
        noFaktur: r.no_faktur,
        namaNasabah: r.nama,
        dedupeHours: 20, // 20 jam: 1 reminder per kontrak per hari
      });
      stats.fired++;
      stats.byTemplate[tplCode] = (stats.byTemplate[tplCode] ?? 0) + 1;
    } catch (e) {
      console.error('[wa/cron-reminder] gadai queue err:', e);
      stats.skipped++;
    }
  }

  // ── 2. Scan tb_sjb AKTIF — hanya JT reminder (sita SJB tidak ada reminder ulang,
  // notif SITA_SJB_OK fire saat sita beneran terjadi dari /api/sjb/buyback)
  const { data: sjbRows } = await db
    .from('tb_sjb')
    .select('id, no_faktur, outlet_id, nama, telp1, telp2, barang, harga_jual, harga_buyback, tgl_jt, tgl_sita, reminder_state, reminder_next_at, opt_out_wa')
    .eq('status', 'AKTIF')
    .gte('tgl_jt', rangeStart)
    .lte('tgl_jt', rangeEnd);

  for (const r of (sjbRows ?? []) as any[]) {
    stats.scannedSjb++;
    const skip = skipCheck(r);
    if (skip) { stats.skipped++; continue; }

    const diffJt = dayDiffWIB(r.tgl_jt, today);

    let tplCode = '';
    if (diffJt === 1) tplCode = 'JT_SJB_H_MIN_1';
    else if (diffJt === 0) tplCode = 'JT_SJB_H_0';
    else if (diffJt === -1) tplCode = 'JT_SJB_H_PLUS_1';

    if (!tplCode) continue;

    try {
      queueWA({
        outletId: Number(r.outlet_id),
        templateCode: tplCode,
        vars: {
          nama: r.nama ?? '',
          no_faktur: r.no_faktur ?? '',
          barang: r.barang ?? '',
          harga_jual: Number(r.harga_jual || 0),
          harga_buyback: Number(r.harga_buyback || 0),
          tgl_jt: fmtDateID(r.tgl_jt),
          tgl_sita: fmtDateID(r.tgl_sita),
        },
        toNumber: r.telp1 ?? '',
        toNumber2: r.telp2 ?? undefined,
        refTable: 'tb_sjb',
        refId: r.id,
        noFaktur: r.no_faktur,
        namaNasabah: r.nama,
        dedupeHours: 20,
      });
      stats.fired++;
      stats.byTemplate[tplCode] = (stats.byTemplate[tplCode] ?? 0) + 1;
    } catch (e) {
      console.error('[wa/cron-reminder] sjb queue err:', e);
      stats.skipped++;
    }
  }

  return stats;
}

/**
 * Skip kalau:
 * - opt_out_wa=true (konsumen request tidak di-reminder)
 * - reminder_state HUMAN_HANDLING / MANUAL_CONTACTED (kasir lagi nego)
 * - reminder_state RESCHEDULED dan reminder_next_at > now (belum waktunya)
 */
function skipCheck(r: any): boolean {
  if (r.opt_out_wa === true) return true;
  const state = String(r.reminder_state || 'AUTO').toUpperCase();
  if (state === 'HUMAN_HANDLING' || state === 'MANUAL_CONTACTED' || state === 'OPT_OUT') return true;
  if (state === 'RESCHEDULED' && r.reminder_next_at) {
    const nextAt = new Date(r.reminder_next_at).getTime();
    if (nextAt > Date.now()) return true; // belum waktunya kirim ulang
  }
  return false;
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized();
  try {
    const stats = await runJob();
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    console.error('[wa/cron-reminder POST]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized();
  try {
    const stats = await runJob();
    return NextResponse.json({ ok: true, ...stats });
  } catch (e) {
    console.error('[wa/cron-reminder GET]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}
