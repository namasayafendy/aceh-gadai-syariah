// ============================================================
// ACEH GADAI SYARIAH - Get Gadai by Barcode / No Faktur
// File: app/api/gadai/search/route.ts
//
// Cermin getGadaiByBarcode() di GAS Code.gs.
// Dipakai di halaman Tebus untuk lookup kontrak.
// Blok cross-outlet: gadai outlet lain tidak bisa diproses.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body     = await request.json();
    const input    = String(body.barcode ?? '').trim().toUpperCase();
    const outletId = parseInt(String(body.outletId ?? '1'), 10) || 1;

    if (!input) {
      return NextResponse.json({ ok: false, msg: 'Barcode / No Faktur wajib diisi.' });
    }

    // Ambil nama outlet untuk cross-outlet check
    const { data: outletRow } = await db
      .from('outlets')
      .select('nama')
      .eq('id', outletId)
      .single();
    const myOutletName = outletRow ? String((outletRow as any).nama) : '';

    // Cari di tb_gadai: match barcode_a ATAU no_faktur
    const { data: rows, error } = await db
      .from('tb_gadai')
      .select('*')
      .or(`barcode_a.eq.${input},no_faktur.ilike.${input}`)
      .limit(5);

    if (error) {
      return NextResponse.json({ ok: false, msg: 'Error query: ' + error.message }, { status: 500 });
    }

    // Cari juga di tb_sjb (untuk kasus no_faktur SJB)
    const { data: sjbRows } = await db
      .from('tb_sjb')
      .select('*')
      .or(`barcode_a.eq.${input},no_faktur.ilike.${input}`)
      .limit(5);

    const allRows = [
      ...(rows ?? []).map(r => ({ ...r, _source: 'GADAI' })),
      ...(sjbRows ?? []).map(r => ({ ...r, _source: 'SJB' })),
    ];

    if (allRows.length === 0) {
      return NextResponse.json({ ok: false, msg: 'Barcode / No Faktur tidak ditemukan.' });
    }

    const row = allRows[0];

    // ── Cross-outlet check ────────────────────────────────────
    if (myOutletName && row.outlet && row.outlet !== myOutletName) {
      return NextResponse.json({
        ok: false,
        msg: `⛔ Kontrak ini milik outlet ${row.outlet}. Harus diproses di outlet tersebut.`,
      });
    }

    // ── Status check ──────────────────────────────────────────
    const status = String(row.status ?? '').toUpperCase();
    if (status && status !== 'AKTIF') {
      return NextResponse.json({
        ok: false,
        msg: `Kontrak ini sudah berstatus ${status} — tidak bisa diproses lagi.`,
      });
    }

    return NextResponse.json({ ok: true, data: row, source: row._source });

  } catch (err) {
    console.error('[gadai/search]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
