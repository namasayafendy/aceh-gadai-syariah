// ============================================================
// ACEH GADAI SYARIAH - Setup Telegram Webhook (one-time)
// File: app/api/telegram/set-webhook/route.ts
//
// POST { pin } dari dashboard Owner → register webhook URL ke Telegram.
// Pakai TELEGRAM_WEBHOOK_SECRET sebagai shared secret supaya request
// masuk ke /api/telegram/webhook divalidasi berasal dari Telegram.
//
// GET → show current webhook info & bot info (untuk debug)
// DELETE ?pin=... → hapus webhook
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { setWebhook, deleteWebhook, getWebhookInfo, getMe } from '@/lib/telegram';

async function requireOwner(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, status: 401, msg: 'Sesi tidak valid.' };
  const { data: profile } = await supabase.from('profiles').select('role, status').eq('id', user.id).single();
  const p = profile as { role: string; status: string } | null;
  if (!p || p.status !== 'AKTIF') return { ok: false as const, status: 403, msg: 'Akun tidak aktif.' };
  if (p.role !== 'OWNER') return { ok: false as const, status: 403, msg: 'Hanya Owner.' };
  return { ok: true as const };
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  try {
    const [info, me] = await Promise.all([getWebhookInfo(), getMe()]);
    return NextResponse.json({
      ok: true,
      me: me.result ?? null,
      webhook: info.result ?? null,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const body = await request.json().catch(() => ({}));
  const pin = String(body.pin ?? '').trim();
  const customUrl = String(body.url ?? '').trim(); // optional override

  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const db = await createServiceClient();
  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ ok: false, msg: 'TELEGRAM_WEBHOOK_SECRET belum di-set di env.' });

  // Construct webhook URL — auto-detect dari request, kecuali di-override
  let url = customUrl;
  if (!url) {
    const origin = request.nextUrl.origin; // https://your-app.vercel.app
    url = `${origin}/api/telegram/webhook`;
  }

  try {
    const res = await setWebhook(url, secret);
    if (!res.ok) return NextResponse.json({ ok: false, msg: res.description ?? 'Gagal set webhook.' });
    return NextResponse.json({ ok: true, url, info: res.result });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireOwner(request);
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: auth.status });

  const pin = request.nextUrl.searchParams.get('pin') ?? '';
  if (!pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });

  const db = await createServiceClient();
  const { data: pinRes } = await db.rpc('validate_pin', { p_pin: pin, p_outlet_id: 0 });
  if (!pinRes?.ok) return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
  if (pinRes.role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'PIN bukan milik Owner.' });

  const res = await deleteWebhook();
  return NextResponse.json({ ok: !!res.ok, info: res });
}
