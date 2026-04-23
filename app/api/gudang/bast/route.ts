// ============================================================
// ACEH GADAI SYARIAH - Riwayat BAST API
// File: app/api/gudang/bast/route.ts
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const outletId = parseInt(request.nextUrl.searchParams.get('outletId') ?? '1', 10) || 1;
    const noBA = request.nextUrl.searchParams.get('noBA');

    // Ambil outlet settings (untuk print)
    const { data: outlet } = await db.from('outlets').select('*').eq('id', outletId).single();
    const outletName = outlet ? String((outlet as any).nama) : '';

    // Jika minta detail (untuk reprint), kembalikan header + items
    if (noBA) {
      const { data: header } = await db.from('tb_serah_terima')
        .select('*').eq('no_ba', noBA).single();
      if (!header) return NextResponse.json({ ok: false, msg: 'BAST tidak ditemukan.' });

      // Hanya boleh akses BAST outlet sendiri
      if (outletName && String((header as any).outlet || '') !== outletName) {
        return NextResponse.json({ ok: false, msg: 'BAST milik outlet lain.' });
      }

      // Item-item yang dimasukkan ke gudang aset dengan no_ba ini
      const { data: asetItems } = await db.from('tb_gudang_aset')
        .select('*').eq('no_ba', noBA);

      // Enrich dengan data tgl_sita dari tb_gudang_sita
      const items: any[] = [];
      for (const it of (asetItems ?? []) as any[]) {
        let tgl_sita: string | null = null;
        if (it.sita_id) {
          const { data: sita } = await db.from('tb_gudang_sita')
            .select('tgl_sita').eq('sita_id', it.sita_id).single();
          tgl_sita = sita ? (sita as any).tgl_sita : null;
        }
        items.push({
          id_aset: it.id_aset, sita_id: it.sita_id, no_faktur: it.no_faktur,
          barang: it.barang, kategori: it.kategori, nama_nasabah: it.nama_nasabah,
          keterangan: it.keterangan, taksiran_modal: Number(it.taksiran_modal || 0),
          tgl_sita,
        });
      }
      const totalModal = items.reduce((s, r) => s + Number(r.taksiran_modal || 0), 0);

      return NextResponse.json({
        ok: true,
        header: {
          noBA: (header as any).no_ba, tgl: (header as any).tgl,
          kasir: (header as any).kasir, jumlah: (header as any).jumlah_item,
          outlet: (header as any).outlet,
        },
        items, totalModal,
        outlet: outletName,
        alamat:   outlet ? ((outlet as any).alamat ?? '') : '',
        kota:     outlet ? ((outlet as any).kota ?? '') : '',
        telpon:   outlet ? ((outlet as any).telepon ?? (outlet as any).telpon ?? '') : '',
        namaPerusahaan:   outlet ? ((outlet as any).nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH') : 'PT. ACEH GADAI SYARIAH',
        waktuOperasional: outlet ? ((outlet as any).waktu_operasional ?? '') : '',
        statusKepalaGudang: outlet ? ((outlet as any).status_kepala_gudang ?? '') : '',
      });
    }

    // Default: list riwayat BAST
    let q = db.from('tb_serah_terima')
      .select('*')
      .order('tgl', { ascending: false })
      .limit(100);
    if (outletName) q = q.eq('outlet', outletName);
    const { data: rows } = await q;

    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (err) {
    console.error('[gudang/bast]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
