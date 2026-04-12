// ============================================================
// ACEH GADAI SYARIAH - Cek Stok API
// File: app/api/gadai/stok/route.ts
// GET: list semua kontrak AKTIF dengan filter kategori
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const outletId = parseInt(searchParams.get('outletId') ?? '1', 10) || 1;
    const kategori = searchParams.get('kategori') ?? '';

    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    // Gadai AKTIF
    let gadaiQ = db.from('tb_gadai')
      .select('id,no_faktur,nama,kategori,barang,taksiran,jumlah_gadai,tgl_gadai,tgl_jt,rak,barcode_a,status,outlet')
      .eq('status', 'AKTIF')
      .order('tgl_gadai', { ascending: false });
    if (outletFilter) gadaiQ = gadaiQ.eq('outlet', outletFilter);
    if (kategori) gadaiQ = gadaiQ.eq('kategori', kategori);
    const { data: gadaiRows } = await gadaiQ;

    // SJB AKTIF
    let sjbQ = db.from('tb_sjb')
      .select('id,no_faktur,nama,kategori,barang,taksiran,harga_jual,tgl_gadai,tgl_jt,rak,barcode_a,status,outlet')
      .in('status', ['AKTIF', 'BERJALAN'])
      .order('tgl_gadai', { ascending: false });
    if (outletFilter) sjbQ = sjbQ.eq('outlet', outletFilter);
    if (kategori) sjbQ = sjbQ.eq('kategori', kategori);
    const { data: sjbRows } = await sjbQ;

    const rows = [
      ...(gadaiRows ?? []).map((r: any) => ({ ...r, _source: 'GADAI' })),
      ...(sjbRows ?? []).map((r: any) => ({ ...r, _source: 'SJB', jumlah_gadai: r.harga_jual })),
    ];

    return NextResponse.json({ ok: true, rows });
  } catch (err) {
    console.error('[gadai/stok]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
