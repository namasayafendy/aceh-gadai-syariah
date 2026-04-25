// ============================================================
// ACEH GADAI SYARIAH - Settings: Generate OTP-Login Register Code
// File: app/api/settings/telegram/otp-code/route.ts
//
// Setup grup Telegram global utk OTP login KASIR/ADMIN.
// Pola sama dgn /api/settings/telegram/laporan-code, beda key prefix:
//   otp_login_chat_id / group_title / registered_at
// purpose='OTP_LOGIN' di telegram_register_codes.
//
// GET    -> status registrasi (chat_id + group title + registered_at)
// POST   -> generate kode one-time (PIN owner)
// DELETE -> unregister grup (PIN owner)
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
  return `AGS-OTP-${out}`;
}

async function readSettings(db: any) {
  const { data } = await db.from('app_settings')
    .select('key, value')
    .in('key', ['otp_login_chat_id', 'otp_login_group_title', 'otp_login_registered_at']);
  const map: Record<string, string | null> = {};
  (data ?? []).forEach((r: any) => { map[r.key] = r.value; });
  return {
    chatId:        map['otp_login_chat_id']        ? Number(map['otp_login_chat_id']) : null,
    groupTitle:    map['otp_login_group_title']    ?? null,
    registeredAt:  map['otp_login_registered_at']  ?? null,
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

  await db.from('telegram_register_codes')
    .update({ used_at: new Date().toISOString(), used_by_user: 'EXPIRED' })
    .eq('purpose', 'OTP_LOGIN').is('used_at', null);

  const kode = randomCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await db.from('telegram_register_codes').insert({
    kode, outlet_id: null, expires_at: expiresAt,
    purpose: 'OTP_LOGIN',
    created_by: pinRes.nama ?? auth.ownerName,
  });
  if (error) return NextResponse.json({ ok: false, msg: error.message });

  return NextResponse.json({
    ok: true,
    kode,
    expiresAt,
    instruction: [
      `1. Buat (atau buka) grup Telegram tujuan OTP login`,
      `2. Invite bot @sistem_gadai_bot ke grup, jadikan admin`,
      `3. Kirim pesan di grup: /register-otp ${kode}`,
      `Kode berlaku 15 menit. Setelah terdaftar, OTP login KASIR/ADMIN akan masuk ke grup ini.`,
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
    { key: 'otp_login_chat_id',       value: null, updated_at: nowIso, updated_by: pinRes.nama ?? 'owner' },
    { key: 'otp_login_group_title',   value: null, updated_at: nowIso, updated_by: pinRes.nama ?? 'owner' },
    { key: 'otp_login_registered_at', value: null, updated_at: nowIso, updated_by: pinRes.nama ?? 'owner' },
  ];
  for (const row of updates) {
    const { error } = await db.from('app_settings').upsert(row, { onConflict: 'key' });
    if (error) return NextResponse.json({ ok: false, msg: error.message });
  }
  return NextResponse.json({ ok: true });
}
