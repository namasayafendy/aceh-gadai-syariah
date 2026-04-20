// ============================================================
// ACEH GADAI SYARIAH - Settings: Kirim test message ke grup outlet
// File: app/api/settings/telegram/test/route.ts
//
// POST { pin, outletId } → kirim "✅ Test dari dashboard" ke grup.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendTelegram, escapeMd } from '@/lib/telegram';

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, msg: 'Sesi tidak valid.' }, { status: 401 });

  const { data: profile } = await supabase.from('profiles')
    .select('role, nama, status').eq('id', user.id).single();
  const p = profile as { role: string; nama: string; status: string } | null;
  if (!p || p.status !== 'AKTIF') return NextResponse.json({ ok: false, msg: 'Akun tidak aktif.' }, { status: 403 });
  if (p.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'Hanya Owner.' }, { status: 403 });

  const db = await createServiceClient();
  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '').trim();
  const outletId = Number(body.outletId ?? 0);
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });
  if (!outletId) return NextResponse.json({ ok: false, msg: 'Outlet wajib.' });

  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  const { data: outlet } = await db.from('outlets')
    .select('id, nama, telegram_chat_id, telegram_group_title').eq('id', outletId).single();
  if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
  if (!(outlet as any).telegram_chat_id) {
    return NextResponse.json({ ok: false, msg: 'Grup Telegram outlet ini belum terdaftar.' });
  }

  const text =
    `✅ *Test dari Dashboard*\n` +
    `Outlet: ${escapeMd((outlet as any).nama)}\n` +
    `Grup: ${escapeMd((outlet as any).telegram_group_title ?? '-')}\n` +
    `Waktu: ${escapeMd(new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }))}\n\n` +
    `Konfigurasi bot berhasil\\. Bot siap menerima notifikasi transfer & diskon\\.`;

  const res = await sendTelegram((outlet as any).telegram_chat_id, text, { parseMode: 'MarkdownV2' });

  // Log
  await db.from('telegram_log').insert({
    arah: 'OUT',
    chat_id: (outlet as any).telegram_chat_id,
    event: 'test_send',
    payload: { outlet_id: outletId, message_id: res.messageId ?? null },
    error: res.ok ? null : res.error,
  }).then(() => {}, () => {});

  if (!res.ok) return NextResponse.json({ ok: false, msg: `Gagal kirim: ${res.error}` });
  return NextResponse.json({ ok: true, messageId: res.messageId });
}
