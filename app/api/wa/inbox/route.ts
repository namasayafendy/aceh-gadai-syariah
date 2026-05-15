// ============================================================
// File: app/api/wa/inbox/route.ts
//
// GET endpoint untuk halaman /wa-inbox dashboard.
//
// Query params:
//   ?outletId=N           — owner/admin filter outlet. Kalau kosong & user=OWNER, ambil semua
//   ?state=NEW|IN_PROGRESS|HANDLED|STALE|ALL
//   ?refId=xxx            — kalau set, return detail conversation (incoming+outgoing for 1 ref)
//   ?days=7               — default 7 hari ke belakang
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// Stale threshold: 4 jam dalam jam kerja (10:00-21:00 WIB)
const STALE_HOURS = 4;
const WORK_START = 10; // 10:00 WIB
const WORK_END = 21;   // 21:00 WIB

/**
 * Hitung jam kerja yang sudah berlalu sejak received_at sampai sekarang
 * (hanya hitung 10:00-21:00 WIB tiap hari).
 *
 * Cara sederhana: tiap hari kontribusi maks (WORK_END - WORK_START) jam.
 * Untuk first day & last day: hitung sebagian.
 */
function businessHoursElapsed(receivedAt: Date, now: Date): number {
  const tzOffset = 7; // WIB
  const receivedWib = new Date(receivedAt.getTime() + tzOffset * 3600 * 1000);
  const nowWib = new Date(now.getTime() + tzOffset * 3600 * 1000);

  let total = 0;
  const cursor = new Date(receivedWib);
  while (cursor < nowWib) {
    const dayStart = new Date(cursor);
    dayStart.setUTCHours(WORK_START, 0, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(WORK_END, 0, 0, 0);

    const intervalStart = cursor > dayStart ? cursor : dayStart;
    const intervalEnd = nowWib < dayEnd ? nowWib : dayEnd;

    if (intervalEnd > intervalStart) {
      total += (intervalEnd.getTime() - intervalStart.getTime()) / 3600000;
    }

    // pindah ke hari berikutnya jam 00:00
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(0, 0, 0, 0);
  }
  return total;
}

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const url = new URL(request.url);
    const outletIdParam = url.searchParams.get('outletId');
    const state = url.searchParams.get('state') ?? 'ALL';
    const refIdParam = url.searchParams.get('refId');
    const days = Math.max(1, Math.min(90, Number(url.searchParams.get('days')) || 7));

    const since = new Date(Date.now() - days * 86400000).toISOString();

    // ── Mode 1: Detail conversation per refId ──
    if (refIdParam) {
      const [{ data: incoming }, { data: outgoing }] = await Promise.all([
        db.from('tb_wa_incoming')
          .select('*')
          .eq('ref_id', refIdParam)
          .order('received_at', { ascending: true }),
        db.from('tb_wa_outgoing')
          .select('*')
          .eq('ref_id', refIdParam)
          .order('created_at', { ascending: true }),
      ]);

      // Resolve kontrak info
      let kontrak: any = null;
      const inFirst = (incoming as any[])?.[0];
      const outFirst = (outgoing as any[])?.[0];
      const refTable = inFirst?.ref_table ?? outFirst?.ref_table;
      if (refTable === 'tb_gadai') {
        const { data: g } = await db.from('tb_gadai')
          .select('id, no_faktur, nama, telp1, telp2, barang, jumlah_gadai, tgl_jt, tgl_sita, status, reminder_state, reminder_next_at, opt_out_wa, outlet_id')
          .eq('id', refIdParam).maybeSingle();
        kontrak = g;
      } else if (refTable === 'tb_sjb') {
        const { data: s } = await db.from('tb_sjb')
          .select('id, no_faktur, nama, telp1, telp2, barang, harga_jual, harga_buyback, tgl_jt, tgl_sita, status, reminder_state, reminder_next_at, opt_out_wa, outlet_id')
          .eq('id', refIdParam).maybeSingle();
        kontrak = s;
      }

      return NextResponse.json({
        ok: true,
        kontrak,
        incoming: incoming ?? [],
        outgoing: outgoing ?? [],
      });
    }

    // ── Mode 2: List conversations ──
    // Filter
    let qIn = db.from('tb_wa_incoming').select('*').gte('received_at', since);
    if (outletIdParam) qIn = qIn.eq('outlet_id', Number(outletIdParam));
    if (state !== 'ALL' && state !== 'STALE') qIn = qIn.eq('state', state);

    const { data: incomings } = await qIn.order('received_at', { ascending: false }).limit(200);
    const now = new Date();

    // Compute stale flag per row + filter
    let rows = (incomings ?? []).map((r: any) => {
      const elapsed = businessHoursElapsed(new Date(r.received_at), now);
      const isStale = r.state === 'NEW' && elapsed >= STALE_HOURS;
      return { ...r, isStale, businessHoursElapsed: Math.round(elapsed * 10) / 10 };
    });

    if (state === 'STALE') {
      rows = rows.filter((r: any) => r.isStale);
    }

    // ── Stats (24 jam terakhir) ──
    const since24 = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    let qStat = db.from('tb_wa_outgoing').select('status, outlet_id').gte('created_at', since24);
    if (outletIdParam) qStat = qStat.eq('outlet_id', Number(outletIdParam));
    const { data: outStat } = await qStat;

    const stats = { sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0 };
    for (const o of outStat ?? []) {
      const s = String((o as any).status);
      if (s === 'SENT') stats.sent++;
      else if (s === 'DELIVERED') stats.delivered++;
      else if (s === 'READ') stats.read++;
      else if (s === 'FAILED') stats.failed++;
      else if (s === 'SKIPPED') stats.skipped++;
    }

    // Reply stats
    let qReply = db.from('tb_wa_incoming').select('state, outlet_id').gte('received_at', since24);
    if (outletIdParam) qReply = qReply.eq('outlet_id', Number(outletIdParam));
    const { data: replyStat } = await qReply;
    const repliedCount = (replyStat ?? []).length;
    const staleCount = (replyStat ?? []).filter((r: any) => {
      if (r.state !== 'NEW') return false;
      // simplified: assume rows here within 24h, so we just count NEW state
      return true;
    }).length;

    // List outlets (untuk filter dropdown owner)
    const { data: outlets } = await db.from('outlets').select('id, nama').order('id');

    return NextResponse.json({
      ok: true,
      conversations: rows,
      stats: { ...stats, replied: repliedCount, stale_open: staleCount },
      outlets: outlets ?? [],
    });
  } catch (e) {
    console.error('[wa/inbox GET]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}
