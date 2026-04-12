// ============================================================
// ACEH GADAI SYARIAH - Gudang Sita API
// File: app/api/gudang/sita/route.ts
// GET: list barang di gudang sita (belum serah terima)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const outletId = parseInt(request.nextUrl.searchParams.get('outletId') ?? '1', 10) || 1;

    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    let q = db.from('tb_gudang_sita')
      .select('*')
      .eq('status_gudang', 'DI_GUDANG_SITA')
      .order('tgl_sita', { ascending: false });
    if (outletFilter) q = q.eq('outlet', outletFilter);
    const { data: rows } = await q;

    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (err) {
    console.error('[gudang/sita]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
