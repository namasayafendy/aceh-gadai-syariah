// ============================================================
// ACEH GADAI SYARIAH - Settings: Generate Register Code
// File: app/api/settings/telegram/register-code/route.ts
//
// POST { pin, outletId } → generate kode one-time, expire 15 menit.
// GET  → list outlet + status registrasi Telegram
// DELETE ?outletId=N&pin=... → unregister (clear chat_id)
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
    .from('profiles').select('role, nama, status').eq('id', user.id).single();
  const p = profile as { role: string; nama: string; status: string } | null;
  if (!p || p.status !== 'AKTIF') return { ok: false as const, status: 403, msg: 'Akun tidak aktif.' };
  if (p.role !== 'OWNER') return { ok: false as const, status: 403, msg: 'Akses ditolak. Hanya Owner.' };
  const db = await createServiceClient();
  return { ok: true as const, db, ownerName: p.nama };
}

function randomCode(): string {
  // Format: AGS-TG-XXXXXX (6 karakter alfanumerik random, uppercase, tanpa O/0/I/1 untuk hindari confuse)
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return `AGS-TG-${out}`;
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const { data: outlets } = await auth.db.from('outlets')
    .select('id, nama, telegram_chat_id, telegram_group_title, telegram_registered_at')
    .order('id');
  return NextResponse.json({ ok: true, outlets: outlets ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '').trim();
  const outletId = Number(body.outletId ?? 0);
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });
  if (!outletId) return NextResponse.json({ ok: false, msg: 'Outlet wajib.' });

  const { data: pinRes } = await auth.db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  // Cek outlet exists
  const { data: outlet } = await auth.db.from('outlets').select('id, nama').eq('id', outletId).single();
  if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });

  // Invalidate kode lama yang masih aktif untuk outlet ini
  await auth.db.from('telegram_register_codes').update({ used_at: new Date().toISOString(), used_by_user: 'EXPIRED' })
    .eq('outlet_id', outletId).is('used_at', null);

  const kode = randomCode();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 menit

  const { error } = await auth.db.from('telegram_register_codes').insert({
    kode, outlet_id: outletId, expires_at: expiresAt, created_by: pinRes.nama ?? auth.ownerName,
  });
  if (error) return NextResponse.json({ ok: false, msg: error.message });

  return NextResponse.json({
    ok: true,
    kode,
    expiresAt,
    outletNama: (outlet as any).nama,
    instruction: [
      `1. Buat grup Telegram baru (misal "AGS ${(outlet as any).nama}")`,
      `2. Invite bot @sistem_gadai_bot ke grup, jadikan admin`,
      `3. Kirim pesan di grup: /register ${kode}`,
      `Kode berlaku 15 menit.`,
    ],
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const outletId = Number(request.nextUrl.searchParams.get('outletId') ?? 0);
  const pin = request.nextUrl.searchParams.get('pin') ?? '';
  if (!outletId) return NextResponse.json({ ok: false, msg: 'Outlet wajib.' });
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const { data: pinRes } = await auth.db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  const { error } = await auth.db.from('outlets').update({
    telegram_chat_id: null, telegram_registered_at: null, telegram_group_title: null,
  }).eq('id', outletId);
  if (error) return NextResponse.json({ ok: false, msg: error.message });
  return NextResponse.json({ ok: true });
}
