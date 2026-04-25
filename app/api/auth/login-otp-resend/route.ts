// ============================================================
// ACEH GADAI SYARIAH - Login Step 1.5: Resend OTP
// File: app/api/auth/login-otp-resend/route.ts
//
// POST { ticketId }
// Generate kode baru utk ticket existing (selama belum expired/used).
// Increment resend_count, batas 5x supaya tidak abuse.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendTelegram, escapeMd } from '@/lib/telegram';

function genCode6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ticketId = String(body.ticketId ?? '').trim();
  if (!ticketId) {
    return NextResponse.json({ ok: false, msg: 'Ticket wajib.' });
  }

  const db = await createServiceClient();
  const { data: row } = await db.from('tb_login_otp')
    .select('*').eq('ticket_id', ticketId).maybeSingle();
  const ticket = row as any;
  if (!ticket) return NextResponse.json({ ok: false, msg: 'Ticket tidak ditemukan.' });
  if (ticket.used_at) return NextResponse.json({ ok: false, msg: 'Ticket sudah dipakai.' });
  if (new Date(ticket.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, msg: 'Ticket kedaluwarsa. Login ulang.' });
  }
  if ((ticket.resend_count ?? 0) >= 5) {
    return NextResponse.json({ ok: false, msg: 'Batas resend 5x. Login ulang.' });
  }

  // Generate kode baru
  const newKode = genCode6();
  await db.from('tb_login_otp').update({
    kode: newKode,
    resend_count: (ticket.resend_count ?? 0) + 1,
  }).eq('id', ticket.id);

  // Kirim ulang ke grup
  const { data: chatSetting } = await db.from('app_settings')
    .select('value').eq('key', 'otp_login_chat_id').maybeSingle();
  const chatId = Number((chatSetting as any)?.value ?? 0);
  if (!chatId) {
    return NextResponse.json({
      ok: false, msg: 'Grup OTP belum di-setup. Pakai kode master dari Owner.',
    });
  }

  const tgl = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const msg =
    `🔐 *Kode OTP Login \\(RESEND\\)*\n\n` +
    `*Outlet:* ${escapeMd(ticket.outlet_nama ?? '-')}\n` +
    `*Role:* ${escapeMd(ticket.role ?? '-')}\n` +
    `*User:* ${escapeMd(ticket.email ?? '-')}\n` +
    `*Waktu:* ${escapeMd(tgl)}\n\n` +
    `*Kode baru:* \`${escapeMd(newKode)}\`\n\n` +
    `_Resend ke\\-${(ticket.resend_count ?? 0) + 1} dari 5\\._`;

  const sendRes = await sendTelegram(chatId, msg, { parseMode: 'MarkdownV2' });
  return NextResponse.json({
    ok: true,
    expiresAt: ticket.expires_at,
    otpSendError: sendRes.ok ? null : sendRes.error,
    resendCount: (ticket.resend_count ?? 0) + 1,
  });
}
