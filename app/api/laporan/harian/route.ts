// ============================================================
// ACEH GADAI SYARIAH - Laporan Harian API
// File: app/api/laporan/harian/route.ts
// GET: return gadai, tebus, sjb, buyback for a date + saldo kas
// Used by: Dashboard + Laporan Malam page
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const tgl = searchParams.get('tgl') ?? new Date().toISOString().slice(0, 10);
    const outletId = parseInt(searchParams.get('outletId') ?? '1', 10) || 1;

    // Get outlet name
    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    const dayStart = tgl + 'T00:00:00';
    const dayEnd = tgl + 'T23:59:59';

    // Gadai for this date (exclude BATAL)
    let gadaiQ = db.from('tb_gadai')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .neq('status', 'BATAL')
      .order('created_at', { ascending: false });
    if (outletFilter) gadaiQ = gadaiQ.eq('outlet', outletFilter);
    const { data: gadai } = await gadaiQ;

    // Tebus for this date
    let tebusQ = db.from('tb_tebus')
      .select('*')
      .gte('tgl', dayStart)
      .lte('tgl', dayEnd)
      .order('tgl', { ascending: false });
    if (outletFilter) tebusQ = tebusQ.eq('outlet', outletFilter);
    const { data: tebus } = await tebusQ;

    // SJB for this date
    let sjbQ = db.from('tb_sjb')
      .select('*')
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .neq('status', 'BATAL')
      .order('created_at', { ascending: false });
    if (outletFilter) sjbQ = sjbQ.eq('outlet', outletFilter);
    const { data: sjb } = await sjbQ;

    // Buyback for this date
    let buybackQ = db.from('tb_buyback')
      .select('*')
      .gte('tgl', dayStart)
      .lte('tgl', dayEnd)
      .order('tgl', { ascending: false });
    if (outletFilter) buybackQ = buybackQ.eq('outlet', outletFilter);
    const { data: buyback } = await buybackQ;

    // Saldo kas (running total of all kas entries for this outlet)
    let kasQ = db.from('tb_kas').select('tipe, tipe_kas, jumlah');
    if (outletFilter) kasQ = kasQ.eq('outlet', outletFilter);
    const { data: kasRows } = await kasQ;

    let saldoCash = 0, saldoBank = 0;
    if (kasRows) {
      for (const k of kasRows) {
        const row = k as any;
        const jml = Number(row.jumlah || 0);
        const tipe = String(row.tipe || '').toUpperCase();
        const tipeKas = String(row.tipe_kas || '').toUpperCase();
        if (tipeKas === 'CASH' || tipeKas === '') {
          saldoCash += tipe === 'MASUK' ? jml : -jml;
        } else if (tipeKas === 'BANK') {
          saldoBank += tipe === 'MASUK' ? jml : -jml;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      tgl,
      gadai: gadai ?? [],
      tebus: tebus ?? [],
      sjb: sjb ?? [],
      buyback: buyback ?? [],
      saldoCash,
      saldoBank,
    });
  } catch (err) {
    console.error('[laporan/harian]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
