// ============================================================
// ACEH GADAI SYARIAH - Login Step 1: Verify Password + Send OTP
// File: app/api/auth/login-step1/route.ts
//
// POST { email, password }
//
// Flow:
//  1. Verify password via signInWithPassword (lalu signOut)
//  2. Cek profile status='AKTIF'
//  3. Kalau OWNER -> return { ok, role:'OWNER', skipOtp:true } —
//     frontend langsung lanjut signInWithPassword normal.
//  4. Kalau KASIR/ADMIN -> generate ticket UUID + kode 6 digit,
//     simpan di tb_login_otp (5 menit), kirim ke grup OTP global,
//     return { ok, ticketId, expiresAt, role, outletNama }.
//
// TIDAK menyentuh session existing — selalu signOut setelah verify.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { sendTelegram, escapeMd } from '@/lib/telegram';

function genCode6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function genTicketId(): string {
  // crypto.randomUUID di Node 19+/Edge
  return (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!email || !password) {
    return NextResponse.json({ ok: false, msg: 'Email dan password wajib.' });
  }

  // 1. Verify password
  const sb = await createClient();
  const { data: signinData, error: signinErr } = await sb.auth.signInWithPassword({ email, password });

  if (signinErr || !signinData?.user) {
    return NextResponse.json({ ok: false, msg: 'Email atau password salah.' });
  }
  const userId = signinData.user.id;

  // 2. Cek profile
  const db = await createServiceClient();
  const { data: profile } = await db.from('profiles')
    .select('role, status, outlet_id, nama').eq('id', userId).maybeSingle();
  const p = profile as { role: string; status: string; outlet_id: number; nama: string } | null;

  if (!p || p.status !== 'AKTIF') {
    await sb.auth.signOut();
    return NextResponse.json({ ok: false, msg: 'Akun tidak aktif. Hubungi Owner.' });
  }

  // 3. OWNER langsung lanjut tanpa OTP
  if (p.role === 'OWNER') {
    await sb.auth.signOut();
    return NextResponse.json({
      ok: true, role: 'OWNER', skipOtp: true, outletId: p.outlet_id,
    });
  }

  // 4. KASIR/ADMIN — generate OTP
  await sb.auth.signOut();

  // Cek grup OTP global terdaftar?
  const { data: chatSetting } = await db.from('app_settings')
    .select('value').eq('key', 'otp_login_chat_id').maybeSingle();
  const chatIdRaw = (chatSetting as any)?.value;
  if (!chatIdRaw) {
    return NextResponse.json({
      ok: false,
      msg: 'Grup OTP login belum di-setup oleh Owner. Hubungi Owner untuk setup grup di Settings Telegram.',
    });
  }
  const chatId = Number(chatIdRaw);

  // Outlet name (kalau outlet_id > 0)
  let outletNama = '';
  if (p.outlet_id > 0) {
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', p.outlet_id).maybeSingle();
    outletNama = (outlet as any)?.nama ?? '';
  } else {
    outletNama = 'PUSAT (cross-outlet)';
  }

  // Generate ticket + kode
  const ticketId = genTicketId();
  const kode = genCode6();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: insErr } = await db.from('tb_login_otp').insert({
    user_id: userId,
    email,
    outlet_id: p.outlet_id,
    outlet_nama: outletNama,
    role: p.role,
    kode,
    ticket_id: ticketId,
    expires_at: expiresAt,
  });
  if (insErr) {
    return NextResponse.json({ ok: false, msg: 'Gagal generate OTP: ' + insErr.message });
  }

  // Kirim ke grup OTP
  const tgl = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const msg =
    `🔐 *Kode OTP Login*\n\n` +
    `*Outlet:* ${escapeMd(outletNama)}\n` +
    `*Role:* ${escapeMd(p.role)}\n` +
    `*User:* ${escapeMd(p.nama)} \\(${escapeMd(email)}\\)\n` +
    `*Waktu:* ${escapeMd(tgl)}\n\n` +
    `*Kode:* \`${escapeMd(kode)}\`\n\n` +
    `_Berlaku 5 menit, sekali pakai\\._`;

  const sendRes = await sendTelegram(chatId, msg, { parseMode: 'MarkdownV2' });
  if (!sendRes.ok) {
    // OTP tetap valid di DB — kasir bisa pakai master atau resend
    return NextResponse.json({
      ok: true,
      ticketId, expiresAt,
      role: p.role,
      outletNama,
      otpSendError: sendRes.error ?? 'Gagal kirim ke Telegram',
    });
  }

  return NextResponse.json({
    ok: true,
    ticketId, expiresAt,
    role: p.role,
    outletNama,
  });
}
