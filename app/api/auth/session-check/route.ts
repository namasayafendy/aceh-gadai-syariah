// ============================================================
// ACEH GADAI SYARIAH - Session Check (polling 15 detik)
// File: app/api/auth/session-check/route.ts
//
// GET
// Dipanggil AuthProvider tiap 15 detik utk validasi sesi:
//
//  - OWNER       -> selalu { valid: true } (bypass)
//  - KASIR/ADMIN -> valid kalau:
//                   cookie ag_sid === profiles.active_session_id
//                   AND now() - session_started_at < 20 jam
//
// Return { valid, reason } supaya frontend tau alasan logout.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'ag_sid';
const TIMEOUT_HOURS = 20;

export async function GET(request: NextRequest) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ valid: false, reason: 'no_session' }, { status: 200 });
  }

  const db = await createServiceClient();
  const { data: profile } = await db.from('profiles')
    .select('role, status, active_session_id, session_started_at').eq('id', user.id).maybeSingle();
  const p = profile as {
    role: string; status: string;
    active_session_id: string | null; session_started_at: string | null;
  } | null;

  if (!p || p.status !== 'AKTIF') {
    return NextResponse.json({ valid: false, reason: 'profile_inactive' });
  }

  // OWNER bypass
  if (p.role === 'OWNER') {
    return NextResponse.json({ valid: true, role: 'OWNER' });
  }

  // KASIR / ADMIN
  const cookieSid = request.cookies.get(COOKIE_NAME)?.value ?? '';
  if (!cookieSid) {
    return NextResponse.json({ valid: false, reason: 'no_cookie' });
  }
  if (!p.active_session_id) {
    return NextResponse.json({ valid: false, reason: 'no_db_session' });
  }
  if (cookieSid !== p.active_session_id) {
    return NextResponse.json({ valid: false, reason: 'session_kicked' });
  }
  if (p.session_started_at) {
    const started = new Date(p.session_started_at).getTime();
    const ageHours = (Date.now() - started) / 3_600_000;
    if (ageHours > TIMEOUT_HOURS) {
      return NextResponse.json({ valid: false, reason: 'timeout_20h' });
    }
  }
  return NextResponse.json({ valid: true, role: p.role });
}
