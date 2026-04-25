// ============================================================
// ACEH GADAI SYARIAH - Logout API Route
// File: app/api/auth/logout/route.ts
//
// Clear active_session_id di DB + clear cookie ag_sid + signOut Supabase.
// Redirect ke /login.
// ============================================================

import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

const COOKIE_NAME = 'ag_sid';

export async function POST() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();

  // Clear active_session_id di profiles (best effort)
  if (user) {
    try {
      const db = await createServiceClient();
      await db.from('profiles')
        .update({ active_session_id: null, session_started_at: null })
        .eq('id', user.id);
    } catch { /* silent */ }
  }

  await sb.auth.signOut();

  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL!), {
    status: 302,
  });
  res.cookies.set(COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return res;
}
