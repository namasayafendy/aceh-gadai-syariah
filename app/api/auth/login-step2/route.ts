// ============================================================
// ACEH GADAI SYARIAH - Login Step 2: Verify OTP / Master Code
// File: app/api/auth/login-step2/route.ts
//
// POST { ticketId, code }
//
// Verify:
//  - Ticket exists, belum used_at, belum expired
//  - code === kode di ticket  ATAU  code === otp_master_code
//  Kalau cocok: mark used_at, return { ok, userId, email }
//  Frontend lalu run signInWithPassword (client SDK) dgn email+password
//  yg disimpan di state, lalu call /api/auth/session-init.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const ticketId = String(body.ticketId ?? '').trim();
  const code = String(body.code ?? '').trim();

  if (!ticketId || !code) {
    return NextResponse.json({ ok: false, msg: 'Ticket dan kode wajib.' });
  }

  const db = await createServiceClient();

  const { data: row } = await db.from('tb_login_otp')
    .select('*').eq('ticket_id', ticketId).maybeSingle();
  const ticket = row as any;
  if (!ticket) {
    return NextResponse.json({ ok: false, msg: 'Ticket tidak ditemukan. Login ulang.' });
  }
  if (ticket.used_at) {
    return NextResponse.json({ ok: false, msg: 'Ticket sudah dipakai. Login ulang.' });
  }
  if (new Date(ticket.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, msg: 'OTP kedaluwarsa. Login ulang.' });
  }

  // Cek master code
  const { data: master } = await db.from('app_settings')
    .select('value').eq('key', 'otp_master_code').maybeSingle();
  const masterCode = (master as any)?.value ?? '';

  let usedMaster = false;
  if (code === ticket.kode) {
    // OK
  } else if (masterCode && code === masterCode) {
    usedMaster = true;
  } else {
    return NextResponse.json({ ok: false, msg: 'Kode salah.' });
  }

  // Mark used
  await db.from('tb_login_otp').update({
    used_at: new Date().toISOString(),
  }).eq('id', ticket.id);

  return NextResponse.json({
    ok: true,
    userId: ticket.user_id,
    email: ticket.email,
    usedMaster,
  });
}
