// ============================================================
// ACEH GADAI SYARIAH - Jatuh Tempo API
// File: app/api/gadai/jatuh-tempo/route.ts
// GET: list semua kontrak AKTIF dari tb_gadai + tb_sjb
// Include: tgl_sita, telp1, telp2, ujrah fields untuk kalkulasi
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? request.nextUrl.searchParams.get('outletId') ?? '1', 10) || 1;

    // Ambil outlet name (0 = semua outlet)
    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    // Query tb_gadai AKTIF — include tgl_sita, telp2, ujrah fields
    let gadaiQ = db.from('tb_gadai')
      .select('id,no_faktur,nama,telp1,telp2,kategori,barang,taksiran,jumlah_gadai,ujrah_persen,ujrah_nominal,tgl_gadai,tgl_jt,tgl_sita,outlet,barcode_a,status')
      .eq('status', 'AKTIF');
    if (outletFilter) gadaiQ = gadaiQ.eq('outlet', outletFilter);
    const { data: gadaiRows } = await gadaiQ;

    // Query tb_sjb AKTIF — include lama_titip, harga_buyback
    let sjbQ = db.from('tb_sjb')
      .select('id,no_faktur,nama,telp1,telp2,kategori,barang,taksiran,harga_jual,harga_buyback,lama_titip,tgl_gadai,tgl_jt,tgl_sita,outlet,barcode_a,status')
      .in('status', ['AKTIF', 'BERJALAN']);
    if (outletFilter) sjbQ = sjbQ.eq('outlet', outletFilter);
    const { data: sjbRows } = await sjbQ;

    // Map rows with _source identifier
    const gadai = (gadaiRows ?? []).map((r: any) => ({
      ...r, _source: 'GADAI',
    }));
    const sjb = (sjbRows ?? []).map((r: any) => ({
      ...r, _source: 'SJB',
      jumlah_gadai: r.harga_jual, // normalize for display
    }));

    return NextResponse.json({ ok: true, gadai, sjb });
  } catch (err) {
    console.error('[gadai/jatuh-tempo]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
