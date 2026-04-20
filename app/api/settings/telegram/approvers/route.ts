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

async function checkOwner() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { err: NextResponse.json({ ok: false, msg: 'Sesi tidak valid.' }, { status: 401 }) };

  const { data: profile } = await supabase
    .from('profiles').select('role, nama, status').eq('id', user.id).single();
  const p = profile as { role: string; nama: string; status: string } | null;
  if (!p || p.status !== 'AKTIF') {
    return { err: NextResponse.json({ ok: false, msg: 'Akun tidak aktif.' }, { status: 403 }) };
  }
  if (p.role !== 'OWNER') {
    return { err: NextResponse.json({ ok: false, msg: 'Akses ditolak. Hanya Owner.' }, { status: 403 }) };
  }
  const db = await createServiceClient();
  return { err: null, db, ownerName: p.nama };
}

export async function GET(_request: NextRequest) {
  const auth = await checkOwner();
  if (auth.err) return auth.err;

  const { data: rows } = await auth.db!.from('telegram_approvers')
    .select('*').order('created_at', { ascending: false });
  return NextResponse.json({ ok: true, rows: rows ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await checkOwner();
  if (auth.err) return auth.err;
  const db = auth.db!;

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

  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  // Upsert (username unik)
  const { data: existing } = await db.from('telegram_approvers')
    .select('id').ilike('username', username).maybeSingle();

  if (existing) {
    const { error } = await db.from('telegram_approvers').update({
      username, nama: nama || null, active,
    }).eq('id', (existing as any).id);
    if (error) return NextResponse.json({ ok: false, msg: error.message });
    return NextResponse.json({ ok: true, updated: true });
  }

  const { error } = await db.from('telegram_approvers').insert({
    username, nama: nama || null, active, created_by: pinRes.nama ?? auth.ownerName,
  });
  if (error) return NextResponse.json({ ok: false, msg: error.message });
  return NextResponse.json({ ok: true, created: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await checkOwner();
  if (auth.err) return auth.err;
  const db = auth.db!;

  const id = request.nextUrl.searchParams.get('id');
  const pin = request.nextUrl.searchParams.get('pin') ?? '';
  if (!id) return NextResponse.json({ ok: false, msg: 'ID wajib.' });
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  const { error } = await db.from('telegram_approvers').delete().eq('id', Number(id));
  if (error) return NextResponse.json({ ok: false, msg: error.message });
  return NextResponse.json({ ok: true });
}
