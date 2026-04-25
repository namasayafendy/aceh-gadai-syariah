// ============================================================
// ACEH GADAI SYARIAH - Session Init (single-session enforcement)
// File: app/api/auth/session-init/route.ts
//
// POST (no body)
// Dipanggil frontend SEGERA SETELAH signInWithPassword sukses.
// - Generate UUID session_id baru
// - Update profiles.active_session_id + session_started_at
// - Set HTTP-only cookie 'ag_sid' dgn UUID tsb
//
// AuthProvider polling /api/auth/session-check membandingkan cookie
// vs DB. Login di browser baru akan generate session_id baru ->
// browser lama auto kick.
//
// OWNER bypass: tidak set session_id (NULL di DB), polling akan
// selalu return valid utk OWNER.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'ag_sid';
const COOKIE_MAX_AGE = 24 * 3600; // 24 jam (longer than 20-jam timeout supaya cookie tetap ada utk polling)

export async function POST(_request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, msg: 'Sesi tidak valid.' }, { status: 401 });
  }

  const db = await createServiceClient();
  const { data: profile } = await db.from('profiles')
    .select('role, status').eq('id', user.id).maybeSingle();
  const p = profile as { role: string; status: string } | null;
  if (!p || p.status !== 'AKTIF') {
    return NextResponse.json({ ok: false, msg: 'Akun tidak aktif.' }, { status: 403 });
  }

  // OWNER bypass — tidak track session, polling selalu lolos
  if (p.role === 'OWNER') {
    await db.from('profiles')
      .update({ active_session_id: null, session_started_at: null })
      .eq('id', user.id);
    const res = NextResponse.json({ ok: true, role: 'OWNER', skipSession: true });
    // Clear cookie kalau ada residu
    res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
    return res;
  }

  // KASIR / ADMIN — generate session_id baru (auto-kick browser lama)
  const sessionId = (globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));
  const startedAt = new Date().toISOString();
  await db.from('profiles')
    .update({ active_session_id: sessionId, session_started_at: startedAt })
    .eq('id', user.id);

  const res = NextResponse.json({ ok: true, role: p.role, sessionId, startedAt });
  res.cookies.set(COOKIE_NAME, sessionId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}
