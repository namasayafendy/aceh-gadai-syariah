// ============================================================
// ACEH GADAI SYARIAH - Settings: Generate Laporan-Malam Register Code
// File: app/api/settings/telegram/laporan-code/route.ts
//
// Fitur Fase 4: setup grup Telegram global utk PDF laporan malam.
//
// GET    → status registrasi (chat_id + group title + registered_at)
// POST   → generate kode one-time (PIN owner), purpose='LAPORAN_MALAM'
// DELETE → unregister grup (PIN owner)
//
// Pola sama dgn /api/settings/telegram/register-code, tapi tanpa
// outlet_id (chat_id disimpan di app_settings, bukan outlets).
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

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `AGS-LP-${out}`;
}

async function readSettings(db: any) {
  const { data } = await db.from('app_settings')
    .select('key, value')
    .in('key', ['laporan_malam_chat_id', 'laporan_malam_group_title', 'laporan_malam_registered_at']);
  const map: Record<string, string | null> = {};
  (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
  return {
    chatId:        map['laporan_malam_chat_id']        ? Number(map['laporan_malam_chat_id']) : null,
    groupTitle:    map['laporan_malam_group_title']    ?? null,
    registeredAt:  map['laporan_malam_registered_at']  ?? null,
  };
}

export async function GET(_request: NextRequest) {
  const auth = await checkOwner();
  if (auth.err) return auth.err;
  const settings = await readSettings(auth.db!);
  return NextResponse.json({ ok: true, settings });
}

export async function POST(request: NextRequest) {
  const auth = await checkOwner();
  if (auth.err) return auth.err;
  const db = auth.db!;

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '').trim();
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  // Invalidate kode LAPORAN_MALAM lama yg masih aktif
  await db.from('telegram_register_codes')
    .update({ used_at: new Date().toISOString(), used_by_user: 'EXPIRED' })
    .eq('purpose', 'LAPORAN_MALAM').is('used_at', null);

  const kode = randomCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  // outlet_id NULL karena bukan per-outlet (purpose='LAPORAN_MALAM')
  const { error } = await db.from('telegram_register_codes').insert({
    kode, outlet_id: null, expires_at: expiresAt,
    purpose: 'LAPORAN_MALAM',
    created_by: pinRes.nama ?? auth.ownerName,
  });
  if (error) return NextResponse.json({ ok: false, msg: error.message });

  return NextResponse.json({
    ok: true,
    kode,
    expiresAt,
    instruction: [
      `1. Buat (atau buka) grup Telegram tujuan laporan malam`,
      `2. Invite bot @sistem_gadai_bot ke grup, jadikan admin`,
      `3. Kirim pesan di grup: /register-laporan ${kode}`,
      `Kode berlaku 15 menit. Setelah terdaftar, semua laporan outlet akan dikirim ke grup ini setiap jam 01:00 WIB.`,
    ],
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await checkOwner();
  if (auth.err) return auth.err;
  const db = auth.db!;

  const pin = request.nextUrl.searchParams.get('pin') ?? '';
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  const nowIso = new Date().toISOString();
  const updates = [
    { key: 'laporan_malam_chat_id',       value: null, updated_at: nowIso, updated_by: pinRes.nama ?? 'owner' },
    { key: 'laporan_malam_group_title',   value: null, updated_at: nowIso, updated_by: pinRes.nama ?? 'owner' },
    { key: 'laporan_malam_registered_at', value: null, updated_at: nowIso, updated_by: pinRes.nama ?? 'owner' },
  ];
  for (const row of updates) {
    const { error } = await db.from('app_settings').upsert(row, { onConflict: 'key' });
    if (error) return NextResponse.json({ ok: false, msg: error.message });
  }
  return NextResponse.json({ ok: true });
}
