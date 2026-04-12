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

    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    let q = db.from('tb_serah_terima')
      .select('*')
      .order('tgl', { ascending: false })
      .limit(100);
    if (outletFilter) q = q.eq('outlet', outletFilter);
    const { data: rows } = await q;

    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (err) {
    console.error('[gudang/bast]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
