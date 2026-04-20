// ============================================================
// ACEH GADAI SYARIAH - Transfer Request List (Fase 2)
// File: app/api/transfer/list/route.ts
//
// GET ?outletId=&status=&from=&to=&limit=100
// Return: array transfer request urut requested_at DESC.
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
  const status = url.searchParams.get('status');      // PENDING/APPROVED/DONE/REJECTED/ALL
  const from = url.searchParams.get('from');           // yyyy-mm-dd
  const to = url.searchParams.get('to');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);

  // Multi-outlet: Owner boleh cross-outlet, non-Owner dikunci ke outlet-nya
  const outletFilter = p.role === 'OWNER'
    ? (qOutlet && qOutlet !== 'ALL' ? parseInt(qOutlet, 10) : null)
    : p.outlet_id;

  let q = db.from('tb_transfer_request')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(limit);

  if (outletFilter) q = q.eq('outlet_id', outletFilter);
  if (status && status !== 'ALL') q = q.eq('status', status);
  if (from) q = q.gte('requested_at', `${from}T00:00:00`);
  if (to)   q = q.lte('requested_at', `${to}T23:59:59`);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, msg: error.message });

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
