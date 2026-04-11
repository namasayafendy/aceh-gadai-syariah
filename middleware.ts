// ============================================================
// ACEH GADAI SYARIAH - Next.js Middleware
// File: middleware.ts (di root project, sejajar /app)
// Melindungi semua route kecuali /login dan /auth/*
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — PENTING: jangan hapus ini
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // ── Public routes (tidak perlu auth) ──────────────────────
  const isPublicRoute =
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth') ||      // Supabase auth callback
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/api/');    // Auth API routes

  if (!isPublicRoute && !user) {
    // Belum login → redirect ke /login
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    // Simpan URL tujuan agar bisa redirect kembali setelah login
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (user && pathname === '/login') {
    // Sudah login tapi buka /login → redirect ke dashboard
    const dashUrl = request.nextUrl.clone();
    dashUrl.pathname = '/';
    return NextResponse.redirect(dashUrl);
  }

  // ── Outlet isolation check ────────────────────────────────
  // Route /outlet/[id]/* hanya boleh diakses user yang punya akses outlet tsb
  // Contoh: /outlet/2/gadai hanya untuk outlet_id 2 atau outlet_id 0
  if (user && pathname.startsWith('/outlet/')) {
    const parts = pathname.split('/');
    const outletIdFromUrl = parseInt(parts[2] || '0');

    if (outletIdFromUrl > 0) {
      // Ambil outlet_id user dari database
      const { data: profile } = await supabase
        .from('profiles')
        .select('outlet_id, status')
        .eq('id', user.id)
        .single();

      if (!profile || profile.status !== 'AKTIF') {
        const loginUrl = request.nextUrl.clone();
        loginUrl.pathname = '/login';
        loginUrl.searchParams.set('error', 'akun_nonaktif');
        return NextResponse.redirect(loginUrl);
      }

      // Kasir spesifik outlet tidak boleh akses outlet lain
      if (profile.outlet_id !== 0 && profile.outlet_id !== outletIdFromUrl) {
        const forbiddenUrl = request.nextUrl.clone();
        forbiddenUrl.pathname = '/unauthorized';
        return NextResponse.redirect(forbiddenUrl);
      }
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match semua routes kecuali:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - File statis (svg, png, jpg, dll)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
