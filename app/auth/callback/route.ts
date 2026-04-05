// ============================================================
// ACEH GADAI SYARIAH - Supabase Auth Callback
// File: app/auth/callback/route.ts
// Diperlukan untuk exchange code → session (magic link, OAuth)
// Meski kita pakai email+password, tetap perlu untuk email confirm
// ============================================================

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code     = searchParams.get('code');
  const next     = searchParams.get('next') ?? '/';
  const errorMsg = searchParams.get('error_description');

  if (errorMsg) {
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(errorMsg)}`
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host');
      const isLocalEnv    = process.env.NODE_ENV === 'development';

      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Auth+callback+gagal`);
}
