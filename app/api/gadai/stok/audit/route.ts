// ============================================================
// ACEH GADAI SYARIAH - Audit Stok API
// File: app/api/gadai/stok/audit/route.ts
// GET: Ambil semua item AKTIF + daftar rak untuk audit stok
// Replika persis dari getAuditData() di GAS
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const outletId = parseInt(searchParams.get('outletId') ?? '1', 10) || 1;

    // Get outlet name for filtering
    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    // 1. Ambil daftar rak (filter by outlet)
    let rakQ = db.from('tb_rak')
      .select('id,kode,nama,kategori,keterangan,outlet')
      .order('kode', { ascending: true });
    if (outletFilter) {
      rakQ = rakQ.or(`outlet.eq.${outletFilter},outlet.is.null,outlet.eq.`);
    }
    const { data: rakRows } = await rakQ;
    const rakList = (rakRows ?? []).map((r: any) => ({
      id: r.id,
      kode: r.kode || '',
      nama: r.nama || '',
      kategori: r.kategori || '',
      ket: r.keterangan || '',
    }));

    // 2. Ambil semua gadai AKTIF
    // scanKey = barcode_b (TIDAK ditampilkan di UI, hanya untuk matching)
    let gadaiQ = db.from('tb_gadai')
      .select('id,no_faktur,nama,kategori,barang,taksiran,jumlah_gadai,tgl_gadai,tgl_jt,rak,barcode_b,status,outlet')
      .eq('status', 'AKTIF');
    if (outletFilter) gadaiQ = gadaiQ.eq('outlet', outletFilter);
    const { data: gadaiRows } = await gadaiQ;

    const items: any[] = [];

    (gadaiRows ?? []).forEach((r: any) => {
      const barcodeB = String(r.barcode_b || '').trim();
      if (!barcodeB) return; // skip jika tidak punya barcode_b
      items.push({
        scanKey:   barcodeB,   // untuk matching scan — TIDAK ditampilkan ke auditor
        noFaktur:  r.no_faktur || '',
        nama:      r.nama || '',
        kategori:  r.kategori || '',
        barang:    r.barang || '',
        taksiran:  parseFloat(r.taksiran || 0),
        pinjaman:  parseFloat(r.jumlah_gadai || 0),
        tglGadai:  r.tgl_gadai || '',
        tglJT:     r.tgl_jt || '',
        rak:       String(r.rak || '').trim(),
        tipe:      'GADAI',
      });
    });

    // 3. Ambil semua SJB AKTIF
    // scanKey untuk SJB = barcode_b (format Jyymmddnnnn), fallback ke id jika kosong
    let sjbQ = db.from('tb_sjb')
      .select('id,no_faktur,nama,kategori,barang,taksiran,harga_jual,tgl_gadai,tgl_jt,rak,barcode_b,status,outlet')
      .in('status', ['AKTIF', 'BERJALAN']);
    if (outletFilter) sjbQ = sjbQ.eq('outlet', outletFilter);
    const { data: sjbRows } = await sjbQ;

    (sjbRows ?? []).forEach((r: any) => {
      const scanKey = String(r.barcode_b || r.id || '').trim();
      if (!scanKey) return;
      items.push({
        scanKey:   scanKey,    // barcode_b atau id — TIDAK ditampilkan ke auditor
        noFaktur:  r.no_faktur || '',
        nama:      r.nama || '',
        kategori:  r.kategori || '',
        barang:    r.barang || '',
        taksiran:  parseFloat(r.taksiran || 0),
        pinjaman:  parseFloat(r.harga_jual || 0),
        tglGadai:  r.tgl_gadai || '',
        tglJT:     r.tgl_jt || '',
        rak:       String(r.rak || '').trim(),
        tipe:      'SJB',
      });
    });

    return NextResponse.json({ ok: true, rak: rakList, items });
  } catch (err) {
    console.error('[gadai/stok/audit]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
