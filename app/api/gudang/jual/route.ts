// ============================================================
// ACEH GADAI SYARIAH - Jual Bon API (jual barang dari gudang aset)
// File: app/api/gudang/jual/route.ts
// GET ?outletId=N           → riwayat jual bon (filter outlet)
// GET ?outletId=N&noBon=... → detail 1 bon + items (untuk reprint)
// POST                      → proses jual barang dari gudang aset
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { safeGetNextId } from '@/lib/db/counter';

// ── GET: list riwayat atau detail 1 bon (multi-outlet) ──
export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const outletId = parseInt(request.nextUrl.searchParams.get('outletId') ?? '1', 10) || 1;
    const noBon = request.nextUrl.searchParams.get('noBon');

    const { data: outlet } = await db.from('outlets').select('*').eq('id', outletId).single();
    const outletName = outlet ? String((outlet as any).nama) : '';

    // Detail mode (untuk reprint)
    if (noBon) {
      const { data: header } = await db.from('tb_jual_bon').select('*').eq('no_bon', noBon).single();
      if (!header) return NextResponse.json({ ok: false, msg: 'Bon tidak ditemukan.' });

      // Scope by outlet (legacy rows may have outlet=null — bypass check kalau null)
      const rowOutlet = (header as any).outlet;
      if (outletName && rowOutlet && String(rowOutlet) !== outletName) {
        return NextResponse.json({ ok: false, msg: 'Bon milik outlet lain.' });
      }

      const { data: details } = await db.from('tb_jual_bon_detail')
        .select('*').eq('id_bon', (header as any).id_bon);

      // Enrich dengan nama_nasabah dari tb_gudang_aset
      const items: any[] = [];
      for (const d of (details ?? []) as any[]) {
        let nama_nasabah: string | null = null;
        if (d.id_aset) {
          const { data: aset } = await db.from('tb_gudang_aset')
            .select('nama_nasabah').eq('id_aset', d.id_aset).single();
          nama_nasabah = aset ? (aset as any).nama_nasabah : null;
        }
        items.push({
          id_aset: d.id_aset, sita_id: d.sita_id, no_faktur: d.no_faktur,
          barang: d.barang, kategori: d.kategori, nama_nasabah,
          modal: Number(d.modal || 0), harga_jual: Number(d.harga_jual || 0),
          laba: Number(d.laba || 0),
        });
      }

      return NextResponse.json({
        ok: true,
        header: {
          noBon: (header as any).no_bon, tgl: (header as any).tgl,
          kasir: (header as any).kasir, jumlah: (header as any).jumlah_item,
          totalModal: Number((header as any).total_modal || 0),
          totalJual: Number((header as any).total_jual || 0),
          totalLaba: Number((header as any).laba || 0),
          catatan: (header as any).catatan,
        },
        items,
        outlet: outletName,
        alamat:   outlet ? ((outlet as any).alamat ?? '') : '',
        kota:     outlet ? ((outlet as any).kota ?? '') : '',
        telpon:   outlet ? ((outlet as any).telpon ?? '') : '',
        namaPerusahaan:   outlet ? ((outlet as any).nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH') : 'PT. ACEH GADAI SYARIAH',
      });
    }

    // Default: list
    let q = db.from('tb_jual_bon').select('*').order('tgl', { ascending: false }).limit(100);
    if (outletName) q = q.eq('outlet', outletName);
    const { data: rows } = await q;
    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (err) {
    console.error('[gudang/jual GET]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

// ── POST: proses jual barang dari gudang aset ──
// NOTE: kas MASUK otomatis dicatat di sini (fitur baru, tidak menyentuh lib/db/kas.ts)
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

    // body.items: [{ id_aset, harga_jual }]
    const inputItems: any[] = Array.isArray(body.items) ? body.items : [];
    if (!inputItems.length) return NextResponse.json({ ok: false, msg: 'Pilih minimal 1 aset.' });

    // Validate harga_jual
    for (const it of inputItems) {
      if (!it.id_aset) return NextResponse.json({ ok: false, msg: 'id_aset wajib diisi.' });
      if (!it.harga_jual || Number(it.harga_jual) <= 0) {
        return NextResponse.json({ ok: false, msg: `Harga jual untuk ${it.id_aset} harus > 0.` });
      }
    }

    // Ambil outlet settings
    const { data: outlet } = await db.from('outlets').select('*').eq('id', outletId).single();
    if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName = String((outlet as any).nama ?? '');

    // Generate No Bon
    const noBon = await safeGetNextId(db, 'JUALBON', outletId);
    const now = new Date().toISOString();

    // Fetch aset data for each item
    const details: any[] = [];
    let totalModal = 0, totalJual = 0;
    for (const it of inputItems) {
      const { data: aset } = await db.from('tb_gudang_aset').select('*').eq('id_aset', it.id_aset).single();
      if (!aset) return NextResponse.json({ ok: false, msg: `Aset ${it.id_aset} tidak ditemukan.` });

      // Multi-outlet guard: hanya aset milik outlet ini
      if (String((aset as any).outlet || '') !== outletName) {
        return NextResponse.json({ ok: false, msg: `Aset ${it.id_aset} bukan milik outlet ini.` });
      }
      if (String((aset as any).status_aset || '').toUpperCase() !== 'TERSEDIA') {
        return NextResponse.json({ ok: false, msg: `Aset ${it.id_aset} sudah terjual/tidak tersedia.` });
      }

      const modal = Number((aset as any).taksiran_modal || 0);
      const jual = Number(it.harga_jual);
      const laba = jual - modal;
      totalModal += modal; totalJual += jual;

      details.push({
        aset, modal, jual, laba,
        no_faktur: (aset as any).no_faktur,
        sita_id: (aset as any).sita_id,
        barang: (aset as any).barang,
        kategori: (aset as any).kategori,
        nama_nasabah: (aset as any).nama_nasabah,
      });
    }
    const totalLaba = totalJual - totalModal;

    // Insert header jual bon
    const { error: hdrErr } = await db.from('tb_jual_bon').insert({
      id_bon: noBon, no_bon: noBon, tgl: now, kasir,
      jumlah_item: details.length, total_modal: totalModal, total_jual: totalJual, laba: totalLaba,
      catatan: body.catatan || null, outlet: outletName,
    });
    if (hdrErr) return NextResponse.json({ ok: false, msg: 'Gagal simpan bon: ' + hdrErr.message });

    // Insert details, update aset status
    for (let i = 0; i < details.length; i++) {
      const d = details[i];
      const detailId = `${noBon}-${i + 1}`;
      await db.from('tb_jual_bon_detail').insert({
        id: detailId, id_bon: noBon, no_bon: noBon,
        id_aset: (d.aset as any).id_aset, sita_id: d.sita_id, no_faktur: d.no_faktur,
        barang: d.barang, kategori: d.kategori,
        modal: d.modal, harga_jual: d.jual, laba: d.laba,
      });

      await db.from('tb_gudang_aset').update({
        status_aset: 'TERJUAL',
        id_bon: noBon,
        tgl_jual: now,
        harga_jual: d.jual,
      }).eq('id_aset', (d.aset as any).id_aset);
    }

    // Kas MASUK CASH untuk total_jual (fitur baru, pencatatan arus kas jual bon)
    if (totalJual > 0) {
      const kasId = await safeGetNextId(db, 'KAS', outletId);
      await db.from('tb_kas').insert({
        id: kasId, tgl: now, no_ref: noBon,
        keterangan: `Jual Bon ${noBon} (${details.length} barang)`,
        tipe: 'MASUK', tipe_kas: 'CASH', jumlah: totalJual,
        jenis: 'JUALBON', sumber: 'AUTO', kasir, outlet: outletName,
      });
    }

    // Audit log
    await db.from('audit_log').insert({
      user_nama: kasir, tabel: 'tb_jual_bon', record_id: noBon,
      aksi: 'JUAL', field: 'ALL',
      nilai_baru: JSON.stringify({ noBon, jumlah: details.length, totalJual, totalLaba }),
      outlet: outletName,
    });

    // Build items for print response
    const items = details.map(d => ({
      id_aset: (d.aset as any).id_aset, sita_id: d.sita_id, no_faktur: d.no_faktur,
      barang: d.barang, kategori: d.kategori, nama_nasabah: d.nama_nasabah,
      modal: d.modal, harga_jual: d.jual, laba: d.laba,
    }));

    return NextResponse.json({
      ok: true, noBon, kasir, tgl: now,
      jumlah: details.length, totalModal, totalJual, totalLaba,
      catatan: body.catatan || '',
      items,
      outlet: outletName,
      alamat:   (outlet as any).alamat ?? '',
      kota:     (outlet as any).kota ?? '',
      telpon:   (outlet as any).telpon ?? '',
      namaPerusahaan: (outlet as any).nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH',
    });

  } catch (err) {
    console.error('[gudang/jual POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
