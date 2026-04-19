// ============================================================
// ACEH GADAI SYARIAH - Serah Terima (BAST) API
// File: app/api/gudang/serah-terima/route.ts
// POST: proses serah terima barang sita → gudang aset
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { safeGetNextId } from '@/lib/db/counter';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // Validasi PIN (ADMIN/OWNER only)
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    const role = String(pinResult.role ?? '').toUpperCase();
    if (!['ADMIN', 'OWNER'].includes(role)) {
      return NextResponse.json({ ok: false, msg: 'Akses ditolak. Hanya Admin/Owner.' });
    }
    const kasir = pinResult.nama as string;

    const sitaIds: string[] = body.sitaIds ?? [];
    if (!sitaIds.length) return NextResponse.json({ ok: false, msg: 'Pilih minimal 1 barang.' });

    // Ambil outlet full settings (untuk print BAST)
    const { data: outlet } = await db.from('outlets').select('*').eq('id', outletId).single();
    if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName = String((outlet as any).nama ?? '');

    // Generate No BA
    const noBA = await safeGetNextId(db, 'BA', outletId);
    const now = new Date().toISOString();

    // Insert serah terima header
    await db.from('tb_serah_terima').insert({
      id_ba: noBA, no_ba: noBA, tgl: now, outlet: outletName,
      kasir, jumlah_item: sitaIds.length, status: 'SELESAI',
    });

    // Process each sita item, kumpulkan detail untuk print BAST
    const items: any[] = [];
    let totalModal = 0;
    for (const sitaId of sitaIds) {
      // Get sita data
      const { data: sita } = await db.from('tb_gudang_sita').select('*').eq('sita_id', sitaId).single();
      if (!sita) continue;

      // Update sita status
      await db.from('tb_gudang_sita').update({
        status_gudang: 'DISERAHKAN',
        no_bon_ba: noBA,
        tgl_serah_terima: now,
      }).eq('sita_id', sitaId);

      // Insert to gudang aset
      const asetId = await safeGetNextId(db, 'ASET', outletId);
      await db.from('tb_gudang_aset').insert({
        id_aset: asetId,
        id_ba: noBA, no_ba: noBA,
        sita_id: sitaId,
        no_faktur: (sita as any).no_faktur,
        barang: (sita as any).barang,
        kategori: (sita as any).kategori,
        nama_nasabah: (sita as any).nama_nasabah,
        keterangan: (sita as any).keterangan,
        taksiran_modal: (sita as any).taksiran_modal,
        outlet: outletName,
        tgl_masuk: now,
        status_aset: 'TERSEDIA',
      });

      const modal = Number((sita as any).taksiran_modal || 0);
      totalModal += modal;
      items.push({
        id_aset: asetId,
        sita_id: sitaId,
        no_faktur: (sita as any).no_faktur,
        barang: (sita as any).barang,
        kategori: (sita as any).kategori,
        nama_nasabah: (sita as any).nama_nasabah,
        keterangan: (sita as any).keterangan,
        taksiran_modal: modal,
        tgl_sita: (sita as any).tgl_sita,
      });
    }

    // Audit log
    await db.from('audit_log').insert({
      user_nama: kasir, tabel: 'tb_serah_terima', record_id: noBA,
      aksi: 'SERAH_TERIMA', field: 'ALL',
      nilai_baru: JSON.stringify({ noBA, jumlah: sitaIds.length, sitaIds }),
      outlet: outletName,
    });

    return NextResponse.json({
      ok: true, noBA, jumlah: sitaIds.length, kasir,
      tgl: now, totalModal, items,
      outlet: outletName,
      alamat:   (outlet as any).alamat ?? '',
      kota:     (outlet as any).kota ?? '',
      telpon:   (outlet as any).telpon ?? '',
      namaPerusahaan:   (outlet as any).nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH',
      waktuOperasional: (outlet as any).waktu_operasional ?? '',
      statusKepalaGudang: (outlet as any).status_kepala_gudang ?? '',
    });
  } catch (err) {
    console.error('[gudang/serah-terima]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
