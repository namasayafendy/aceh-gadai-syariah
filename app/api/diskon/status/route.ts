// ============================================================
// ACEH GADAI SYARIAH - Diskon Status Polling (Fase 3)
// File: app/api/diskon/status/route.ts
//
// GET ?id=DSK-1-...
// Dipakai DiskonApprovalModal untuk polling status row.
// Pakai service client supaya bypass RLS — kasir hanya butuh
// tau status + alasan_reject untuk diskon yang DIA request.
//
// Guard:
// - Harus login
// - Non-OWNER: outlet_id harus match outlet kasir
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

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ ok: false, msg: 'id wajib.' });

  const db = await createServiceClient();
  const { data, error } = await db.from('tb_diskon')
    .select('id_diskon, status, alasan_reject, outlet_id, finalized_at')
    .eq('id_diskon', id)
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, msg: error.message });
  if (!data) return NextResponse.json({ ok: false, msg: 'Diskon tidak ditemukan.' });

  const row = data as any;

  // Non-OWNER: scope ke outlet sendiri
  if (p.role !== 'OWNER' && Number(row.outlet_id ?? 0) !== Number(p.outlet_id)) {
    return NextResponse.json({ ok: false, msg: 'Forbidden.' }, { status: 403 });
  }

  return NextResponse.json({
    ok: true,
    status: row.status,
    alasanReject: row.alasan_reject ?? null,
    finalizedAt: row.finalized_at ?? null,
  });
}
