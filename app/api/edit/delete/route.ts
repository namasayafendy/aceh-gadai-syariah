// ============================================================
// ACEH GADAI SYARIAH - Batalkan Kontrak API
// File: app/api/edit/delete/route.ts
//
// POST: set status = BATAL + reverse semua entri kas terkait
// ADMIN/OWNER only — dicatat di audit_log
//
// REVERSE KAS: cermin _reverseKas() di GAS Code.gs
// - Cari semua entri kas dengan no_ref = noFaktur
// - Untuk tiap entri: buat entri kebalikan (flip MASUK↔KELUAR)
// - Tandai entri asli dengan sumber = 'BATAL'
// - Entri baru: sumber = 'BATAL', keterangan = 'BATAL ' + asli
//
// ALUR KAS TIDAK DIUBAH — hanya menambah entri reverse
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // ── 1. Validasi PIN (ADMIN/OWNER only) ────────────────────
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    const role = String(pinResult.role ?? '').toUpperCase();
    if (!['ADMIN', 'OWNER'].includes(role)) {
      return NextResponse.json({ ok: false, msg: 'Akses ditolak. Hanya Admin/Owner.' });
    }
    const kasir = pinResult.nama as string;

    const { id, noFaktur, source } = body;
    if (!id || !noFaktur) return NextResponse.json({ ok: false, msg: 'ID dan No Faktur wajib.' });

    const tableName = source === 'SJB' ? 'tb_sjb' : 'tb_gadai';

    // ── 2. Ambil outlet name ──────────────────────────────────
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = outlet ? String((outlet as any).nama) : '';

    // ── 3. Get current kontrak ────────────────────────────────
    const { data: current } = await db.from(tableName).select('status').eq('id', id).single();
    if (!current) return NextResponse.json({ ok: false, msg: 'Kontrak tidak ditemukan.' });
    const oldStatus = (current as any).status;

    if (oldStatus === 'BATAL') {
      return NextResponse.json({ ok: false, msg: 'Kontrak sudah berstatus BATAL.' });
    }

    // ── 4. Set status = BATAL ─────────────────────────────────
    const { error: updateErr } = await db.from(tableName).update({
      status: 'BATAL',
      updated_at: new Date().toISOString(),
      updated_by: kasir,
    }).eq('id', id);
    if (updateErr) return NextResponse.json({ ok: false, msg: 'Gagal update status: ' + updateErr.message });

    // ── 5. Reverse Kas Entries ────────────────────────────────
    // Cermin _reverseKas() di GAS Code.gs
    // Cari semua entri kas dengan no_ref = noFaktur yang belum di-reverse
    const { data: kasEntries } = await db.from('tb_kas')
      .select('*')
      .eq('no_ref', noFaktur)
      .neq('sumber', 'BATAL')  // skip yang sudah di-reverse
      .order('tgl', { ascending: true });

    let reverseCount = 0;
    if (kasEntries && kasEntries.length > 0) {
      for (const entry of kasEntries) {
        const e = entry as any;
        const tipeAsli = String(e.tipe || '');
        const tipeReverse = tipeAsli === 'MASUK' ? 'KELUAR' : 'MASUK';
        const jumlah = Number(e.jumlah || 0);
        if (jumlah === 0) continue;

        // Generate new kas ID for reverse entry
        const { data: newKasId } = await db.rpc('get_next_id', { p_tipe: 'KAS', p_outlet_id: outletId });

        // Insert reverse entry
        await db.from('tb_kas').insert({
          id: newKasId as string,
          tgl: new Date().toISOString(),
          no_ref: noFaktur,                              // same noRef
          keterangan: 'BATAL ' + String(e.keterangan || ''),  // prefix BATAL
          tipe: tipeReverse,                              // flip MASUK↔KELUAR
          tipe_kas: String(e.tipe_kas || 'CASH'),         // same tipe_kas
          jumlah: jumlah,                                 // same amount (positive)
          jenis: String(e.jenis || ''),                   // same jenis
          sumber: 'BATAL',                                // mark as reversal
          kasir: kasir,
          outlet: outletName,
        });

        // Mark original entry as BATAL (so it won't be reversed again)
        await db.from('tb_kas').update({ sumber: 'BATAL' }).eq('id', e.id);

        reverseCount++;
      }
    }

    // ── 6. Audit log ──────────────────────────────────────────
    await db.from('audit_log').insert({
      user_nama: kasir, tabel: tableName, record_id: noFaktur,
      aksi: 'BATAL', field: 'Status',
      nilai_lama: oldStatus, nilai_baru: 'BATAL',
      outlet: outletName,
      catatan: `${reverseCount} entri kas di-reverse`,
    });

    await db.from('audit_log').insert({
      user_nama: kasir, tabel: 'tb_kas', record_id: noFaktur,
      aksi: 'BATAL_KAS', field: 'reverseKas',
      nilai_lama: noFaktur, nilai_baru: `${reverseCount} entries`,
      outlet: outletName,
    });

    return NextResponse.json({
      ok: true,
      msg: `Kontrak ${noFaktur} dibatalkan. ${reverseCount} entri kas di-reverse.`,
      reverseCount,
    });

  } catch (err) {
    console.error('[edit/delete]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
