// ============================================================
// ACEH GADAI SYARIAH - Total Aset API
// File: app/api/gadai/stok/aset/route.ts
// GET: Semua barang aktif di gudang, diurutkan per rak
// Replika persis dari getAsetData() di GAS
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const outletId = parseInt(searchParams.get('outletId') ?? '1', 10) || 1;

    // Get outlet name
    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    // Ambil urutan rak
    let rakQ = db.from('tb_rak')
      .select('kode,nama')
      .order('kode', { ascending: true });
    if (outletFilter) {
      rakQ = rakQ.or(`outlet.eq.${outletFilter},outlet.is.null,outlet.eq.`);
    }
    const { data: rakRows } = await rakQ;
    const rakOrder: string[] = [];
    const rakNames: Record<string, string> = {};
    (rakRows ?? []).forEach((r: any) => {
      rakOrder.push(r.kode || '');
      rakNames[r.kode || ''] = r.nama || '';
    });

    const items: any[] = [];

    // Gadai AKTIF
    let gadaiQ = db.from('tb_gadai')
      .select('id,no_faktur,nama,kategori,barang,taksiran,jumlah_gadai,tgl_gadai,tgl_jt,rak,status,outlet')
      .eq('status', 'AKTIF');
    if (outletFilter) gadaiQ = gadaiQ.eq('outlet', outletFilter);
    const { data: gadaiRows } = await gadaiQ;

    (gadaiRows ?? []).forEach((r: any) => {
      items.push({
        noFaktur: r.no_faktur || '',
        tipe:     'GADAI',
        nama:     r.nama || '',
        kategori: r.kategori || '',
        barang:   r.barang || '',
        taksiran: parseFloat(r.taksiran || 0),
        pinjaman: parseFloat(r.jumlah_gadai || 0),
        tglGadai: r.tgl_gadai || '',
        tglJT:    r.tgl_jt || '',
        rak:      String(r.rak || '').trim(),
        warning:  '',  // TODO: compute from tgl_jt if needed
      });
    });

    // SJB AKTIF
    let sjbQ = db.from('tb_sjb')
      .select('id,no_faktur,nama,kategori,barang,taksiran,harga_jual,tgl_gadai,tgl_jt,rak,status,outlet')
      .in('status', ['AKTIF', 'BERJALAN']);
    if (outletFilter) sjbQ = sjbQ.eq('outlet', outletFilter);
    const { data: sjbRows } = await sjbQ;

    (sjbRows ?? []).forEach((r: any) => {
      items.push({
        noFaktur: r.no_faktur || '',
        tipe:     'SJB',
        nama:     r.nama || '',
        kategori: r.kategori || '',
        barang:   r.barang || '',
        taksiran: parseFloat(r.taksiran || 0),
        pinjaman: parseFloat(r.harga_jual || 0),
        tglGadai: r.tgl_gadai || '',
        tglJT:    r.tgl_jt || '',
        rak:      String(r.rak || '').trim(),
        warning:  '',
      });
    });

    // Sort: urut per rak (sesuai tb_rak), lalu tglGadai asc
    items.sort((a, b) => {
      const idxA = rakOrder.indexOf(a.rak);
      const idxB = rakOrder.indexOf(b.rak);
      const rA = idxA >= 0 ? idxA : 9999;
      const rB = idxB >= 0 ? idxB : 9999;
      if (rA !== rB) return rA - rB;
      return (a.tglGadai || '').localeCompare(b.tglGadai || '');
    });

    return NextResponse.json({ ok: true, items, rakOrder, rakNames });
  } catch (err) {
    console.error('[gadai/stok/aset]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
