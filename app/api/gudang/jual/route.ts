// ============================================================
// ACEH GADAI SYARIAH - Riwayat Jual Bon API
// File: app/api/gudang/jual/route.ts
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { data: rows } = await db.from('tb_jual_bon')
      .select('*')
      .order('tgl', { ascending: false })
      .limit(100);
    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (err) {
    console.error('[gudang/jual]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
