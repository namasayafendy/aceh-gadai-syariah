// ============================================================
// ACEH GADAI SYARIAH - Jatuh Tempo API
// File: app/api/gadai/jatuh-tempo/route.ts
// GET: list semua kontrak AKTIF dari tb_gadai + tb_sjb
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

    // Query tb_gadai AKTIF
    let gadaiQ = db.from('tb_gadai')
      .select('id,no_faktur,nama,telp1,kategori,barang,taksiran,jumlah_gadai,tgl_gadai,tgl_jt,outlet,barcode_a,status')
      .eq('status', 'AKTIF');
    if (outletFilter) gadaiQ = gadaiQ.eq('outlet', outletFilter);
    const { data: gadaiRows } = await gadaiQ;

    // Query tb_sjb AKTIF
    let sjbQ = db.from('tb_sjb')
      .select('id,no_faktur,nama,telp1,kategori,barang,taksiran,harga_jual,tgl_gadai,tgl_jt,outlet,barcode_a,status')
      .in('status', ['AKTIF', 'BERJALAN']);
    if (outletFilter) sjbQ = sjbQ.eq('outlet', outletFilter);
    const { data: sjbRows } = await sjbQ;

    const rows = [
      ...(gadaiRows ?? []).map((r: any) => ({ ...r, _source: 'GADAI', jumlah_gadai: r.jumlah_gadai })),
      ...(sjbRows ?? []).map((r: any) => ({ ...r, _source: 'SJB', jumlah_gadai: r.harga_jual })),
    ];

    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    console.error('[gadai/jatuh-tempo]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
