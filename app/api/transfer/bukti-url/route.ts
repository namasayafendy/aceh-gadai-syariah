// ============================================================
// ACEH GADAI SYARIAH - Transfer Bukti Signed URL (Fase 2)
// File: app/api/transfer/bukti-url/route.ts
//
// GET ?id=N → return short-lived signed URL untuk download foto bukti
// dari bucket 'backups'.
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

  const id = Number(request.nextUrl.searchParams.get('id') ?? 0);
  if (!id) return NextResponse.json({ ok: false, msg: 'ID wajib.' });

  const db = await createServiceClient();
  const { data: row } = await db.from('tb_transfer_request')
    .select('outlet_id, bukti_storage_path')
    .eq('id', id).maybeSingle();
  if (!row) return NextResponse.json({ ok: false, msg: 'Request tidak ditemukan.' });
  const r = row as any;
  if (!r.bukti_storage_path) return NextResponse.json({ ok: false, msg: 'Bukti belum diupload.' });

  // Multi-outlet safety: non-Owner & bukan cross-outlet (outlet_id=0 = Admin Pusat) scope ke outlet sendiri
  const crossOutlet = p.role === 'OWNER' || Number(p.outlet_id) === 0;
  if (!crossOutlet && r.outlet_id !== p.outlet_id) {
    return NextResponse.json({ ok: false, msg: 'Akses ditolak.' }, { status: 403 });
  }

  const { data: signed, error } = await db.storage.from('backups')
    .createSignedUrl(r.bukti_storage_path, 300); // 5 menit
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ ok: false, msg: error?.message ?? 'Gagal generate URL.' });
  }
  return NextResponse.json({ ok: true, url: signed.signedUrl });
}
