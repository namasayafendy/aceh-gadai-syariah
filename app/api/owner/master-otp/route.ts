// ============================================================
// ACEH GADAI SYARIAH - Master OTP (Owner only)
// File: app/api/owner/master-otp/route.ts
//
// GET  -> kode + updatedAt + updatedBy (auth: OWNER only via session)
// POST -> rotate (PIN owner). Body { pin, kode? }
//         Kalau kode dikirim, harus 6 digit. Kalau tidak, generate random.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function checkOwner() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { err: NextResponse.json({ ok: false, msg: 'Sesi tidak valid.' }, { status: 401 }) };
  const { data: profile } = await sb.from('profiles').select('role, status, nama').eq('id', user.id).single();
  const p = profile as { role: string; status: string; nama: string } | null;
  if (!p || p.status !== 'AKTIF') return { err: NextResponse.json({ ok: false, msg: 'Akun tidak aktif.' }, { status: 403 }) };
  if (p.role !== 'OWNER') return { err: NextResponse.json({ ok: false, msg: 'Akses ditolak. Hanya Owner.' }, { status: 403 }) };
  const db = await createServiceClient();
  return { err: null, db, ownerName: p.nama };
}

export async function GET() {
  const auth = await checkOwner();
  if (auth.err) return auth.err;
  const { data } = await auth.db!.from('app_settings')
    .select('value, updated_at, updated_by').eq('key', 'otp_master_code').maybeSingle();
  const row = data as any;
  return NextResponse.json({
    ok: true,
    kode: row?.value ?? null,
    updatedAt: row?.updated_at ?? null,
    updatedBy: row?.updated_by ?? null,
  });
}

export async function POST(request: NextRequest) {
  const auth = await checkOwner();
  if (auth.err) return auth.err;
  const db = auth.db!;

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '').trim();
  const inputKode = String(body.kode ?? '').trim();

  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  let kode = inputKode;
  if (kode) {
    if (!/^\d{6}$/.test(kode)) {
      return NextResponse.json({ ok: false, msg: 'Kode harus tepat 6 digit angka.' });
    }
  } else {
    kode = String(Math.floor(100000 + Math.random() * 900000));
  }

  const nowIso = new Date().toISOString();
  const { error } = await db.from('app_settings').upsert({
    key: 'otp_master_code',
    value: kode,
    updated_at: nowIso,
    updated_by: pinRes.nama ?? auth.ownerName,
  }, { onConflict: 'key' });
  if (error) return NextResponse.json({ ok: false, msg: error.message });

  return NextResponse.json({ ok: true, kode, updatedAt: nowIso });
}
