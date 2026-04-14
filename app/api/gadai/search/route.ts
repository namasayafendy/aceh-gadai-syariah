// ============================================================
// ACEH GADAI SYARIAH - Get Gadai by Barcode / No Faktur
// File: app/api/gadai/search/route.ts
// Cermin getGadaiByBarcode() di GAS Code.gs
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const input = String(body.barcode ?? '').trim().toUpperCase();
    const outletId = parseInt(String(body.outletId ?? '1'), 10) || 1;

    if (!input) {
      return NextResponse.json({ ok: false, msg: 'Barcode / No Faktur wajib diisi.' });
    }

    const { data: outletRow } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const myOutletName = outletRow ? String((outletRow as any).nama) : '';

    // Search tb_gadai: barcode_a, barcode_b, or no_faktur
    const { data: rows } = await db
      .from('tb_gadai')
      .select('*')
      .or(`barcode_a.eq.${input},barcode_b.eq.${input},no_faktur.ilike.${input}`)
      .limit(5);

    // Search tb_sjb too
    const { data: sjbRows } = await db
      .from('tb_sjb')
      .select('*')
      .or(`barcode_a.eq.${input},no_faktur.ilike.${input}`)
      .limit(5);

    const allRows = [
      ...(rows ?? []).map((r: any) => ({ ...r, _source: 'GADAI' })),
      ...(sjbRows ?? []).map((r: any) => ({ ...r, _source: 'SJB' })),
    ];

    if (allRows.length === 0) {
      return NextResponse.json({ ok: false, msg: 'Barcode / No Faktur tidak ditemukan.' });
    }

    const row = allRows[0];

    // ── tanpaSurat detection (cermin GAS getGadaiByBarcode) ──
    // Jika input bukan barcode_a → nasabah pakai No. SBR (surat hilang)
    const matchByBarcodeA = String(row.barcode_a || '').toUpperCase() === input;
    const isTanpaSurat = !matchByBarcodeA;

    // Cross-outlet check
    if (myOutletName && row.outlet && row.outlet !== myOutletName) {
      return NextResponse.json({
        ok: false,
        msg: `⛔ Kontrak ini milik outlet ${row.outlet}. Harus diproses di outlet tersebut.`,
      });
    }

    // Status check - only block truly finished statuses
    // includeAll=true → skip status check (dipakai oleh halaman Edit Transaksi)
    const includeAll = body.includeAll === true;
    const status = String(row.status ?? '').toUpperCase();
    const statusSelesai = ['TEBUS', 'BATAL', 'SITA', 'JUAL', 'BUYBACK'];
    if (!includeAll && status && statusSelesai.includes(status)) {
      return NextResponse.json({
        ok: false,
        msg: `Kontrak ini sudah berstatus ${status} — tidak bisa diproses lagi.`,
        data: row, source: row._source,
      });
    }

    return NextResponse.json({ ok: true, data: row, source: row._source, tanpaSurat: isTanpaSurat });
  } catch (err) {
    console.error('[gadai/search]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
