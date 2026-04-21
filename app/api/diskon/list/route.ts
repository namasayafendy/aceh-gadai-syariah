// ============================================================
// ACEH GADAI SYARIAH - Diskon List (Fase 3)
// File: app/api/diskon/list/route.ts
//
// GET ?outletId=&status=&from=&to=&limit=300
// Return: array tb_diskon urut tgl DESC.
//
// - Owner boleh cross-outlet (outletId=ALL atau specific id).
// - Non-Owner dikunci ke outlet-nya sendiri.
// - Filter status: PENDING/APPROVED/REJECTED/DONE/CANCELLED/ALL
//   (legacy rows tanpa status akan muncul di ALL).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, msg: 'Sesi tidak valid.' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles').select('role, status, outlet_id').eq('id', user.id).single();
  const p = profile as { role: string; status: string; outlet_id: number } | null;
  if (!p || p.status !== 'AKTIF') {
    return NextResponse.json({ ok: false, msg: 'Akun tidak aktif.' }, { status: 403 });
  }

  const db = await createServiceClient();
  const url = request.nextUrl;
  const qOutlet = url.searchParams.get('outletId');
  const status  = url.searchParams.get('status');      // PENDING/APPROVED/REJECTED/DONE/CANCELLED/ALL
  const from    = url.searchParams.get('from');        // yyyy-mm-dd
  const to      = url.searchParams.get('to');
  const limit   = Math.min(Number(url.searchParams.get('limit') ?? 300), 1000);

  // Multi-outlet: Owner bebas, non-Owner dikunci.
  const outletFilter = p.role === 'OWNER'
    ? (qOutlet && qOutlet !== 'ALL' ? parseInt(qOutlet, 10) : null)
    : p.outlet_id;

  let q = db.from('tb_diskon')
    .select('*')
    .order('tgl', { ascending: false })
    .limit(limit);

  if (outletFilter) q = q.eq('outlet_id', outletFilter);
  if (status && status !== 'ALL') q = q.eq('status', status);
  if (from) q = q.gte('tgl', `${from}T00:00:00`);
  if (to)   q = q.lte('tgl', `${to}T23:59:59`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, msg: error.message });

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
