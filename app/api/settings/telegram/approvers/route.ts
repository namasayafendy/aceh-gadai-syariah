// ============================================================
// ACEH GADAI SYARIAH - Settings: Telegram Approvers CRUD
// File: app/api/settings/telegram/approvers/route.ts
//
// GET: list semua approver
// POST { pin, username, nama, active } : tambah / update
// DELETE ?id=N : hapus approver
//
// Hanya OWNER yang boleh mengubah daftar approver.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

async function requireOwner(request: NextRequest): Promise<
  { ok: true; db: Awaited<ReturnType<typeof createServiceClient>>; ownerName: string }
  | { ok: false; status: number; msg: string }
> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, msg: 'Sesi tidak valid.' };

  const { data: profile } = await supabase
    .from('profiles').select('role, nama, outlet_id, status').eq('id', user.id).single();
  const p = profile as { role: string; nama: string; outlet_id: number; status: string } | null;
  if (!p || p.status !== 'AKTIF') return { ok: false as const, status: 403, msg: 'Akun tidak aktif.' };
  if (p.role !== 'OWNER') return { ok: false as const, status: 403, msg: 'Akses ditolak. Hanya Owner.' };

  const db = await createServiceClient();
  return { ok: true as const, db, ownerName: p.nama };
}

async function validatePin(db: any, pin: string, outletId: number): Promise<{ ok: boolean; msg?: string; role?: string; nama?: string }> {
  const { data } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: outletId });
  return data ?? { ok: false, msg: 'PIN tidak valid.' };
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const { data: rows } = await auth.db.from('telegram_approvers')
    .select('*').order('created_at', { ascending: false });
  return NextResponse.json({ ok: true, rows: rows ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '').trim();
  const username = String(body.username ?? '').trim().replace(/^@/, '');
  const nama = String(body.nama ?? '').trim();
  const active = body.active !== false;

  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });
  if (!username) return NextResponse.json({ ok: false, msg: 'Username Telegram wajib.' });
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    return NextResponse.json({ ok: false, msg: 'Username Telegram tidak valid (5-32 karakter, huruf/angka/underscore).' });
  }

  const pinRes = await validatePin(auth.db, pin, 0);
  if (!pinRes.ok) return NextResponse.json({ ok: false, msg: pinRes.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  // Upsert (username unik)
  const { data: existing } = await auth.db.from('telegram_approvers')
    .select('id').ilike('username', username).maybeSingle();

  if (existing) {
    const { error } = await auth.db.from('telegram_approvers').update({
      username, nama: nama || null, active,
    }).eq('id', (existing as any).id);
    if (error) return NextResponse.json({ ok: false, msg: error.message });
    return NextResponse.json({ ok: true, updated: true });
  }

  const { error } = await auth.db.from('telegram_approvers').insert({
    username, nama: nama || null, active, created_by: pinRes.nama ?? auth.ownerName,
  });
  if (error) return NextResponse.json({ ok: false, msg: error.message });
  return NextResponse.json({ ok: true, created: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const id = request.nextUrl.searchParams.get('id');
  const pin = request.nextUrl.searchParams.get('pin') ?? '';
  if (!id) return NextResponse.json({ ok: false, msg: 'ID wajib.' });
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const pinRes = await validatePin(auth.db, pin, 0);
  if (!pinRes.ok) return NextResponse.json({ ok: false, msg: pinRes.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  const { error } = await auth.db.from('telegram_approvers').delete().eq('id', Number(id));
  if (error) return NextResponse.json({ ok: false, msg: error.message });
  return NextResponse.json({ ok: true });
}
