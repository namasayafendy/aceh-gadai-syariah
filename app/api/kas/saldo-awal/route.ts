// ============================================================
// ACEH GADAI SYARIAH - Set Saldo Awal Kas
// File: app/api/kas/saldo-awal/route.ts
//
// Cermin setSaldoAwal() di GAS Code.gs.
// Hanya OWNER / ADMIN yang bisa.
// Hapus entri SALDO_AWAL lama dulu, lalu insert baru.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body     = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // Validasi PIN + role
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) {
      return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    }
    if (!['OWNER','ADMIN'].includes(String(pinResult.role ?? '').toUpperCase())) {
      return NextResponse.json({ ok: false, msg: 'Hanya Owner/Admin yang bisa set saldo awal.' });
    }
    const kasir = pinResult.nama as string;

    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = (outlet?.nama as string) ?? '';

    // Hapus entri SALDO_AWAL lama
    await db.from('tb_kas')
      .delete()
      .eq('outlet', outletName)
      .eq('jenis', 'SALDO_AWAL');

    const now = new Date().toISOString();
    const toInsert = [];

    if (Number(body.cash ?? 0) !== 0) {
      const { data: id1 } = await db.rpc('get_next_id', { p_tipe: 'KAS', p_outlet_id: outletId });
      toInsert.push({
        id:         id1 as string,
        tgl:        now,
        no_ref:     'SALDO_AWAL',
        keterangan: 'Saldo Awal Cash',
        tipe:       'MASUK',
        tipe_kas:   'CASH',
        jumlah:     Number(body.cash),
        jenis:      'SALDO_AWAL',
        sumber:     'MANUAL',
        kasir,
        outlet:     outletName,
      });
    }

    if (Number(body.bank ?? 0) !== 0) {
      const { data: id2 } = await db.rpc('get_next_id', { p_tipe: 'KAS', p_outlet_id: outletId });
      toInsert.push({
        id:         id2 as string,
        tgl:        now,
        no_ref:     'SALDO_AWAL',
        keterangan: 'Saldo Awal Bank',
        tipe:       'MASUK',
        tipe_kas:   'BANK',
        jumlah:     Number(body.bank),
        jenis:      'SALDO_AWAL',
        sumber:     'MANUAL',
        kasir,
        outlet:     outletName,
      });
    }

    if (toInsert.length > 0) {
      const { error } = await db.from('tb_kas').insert(toInsert);
      if (error) {
        return NextResponse.json({ ok: false, msg: 'Gagal simpan saldo awal: ' + error.message });
      }
    }

    return NextResponse.json({ ok: true, msg: 'Saldo awal berhasil disimpan.' });

  } catch (err) {
    console.error('[kas/saldo-awal]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
