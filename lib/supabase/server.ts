// ============================================================
// ACEH GADAI SYARIAH - Supabase Server Client
// File: lib/supabase/server.ts
// Dipakai di Server Components, API Routes, Server Actions
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

// ── Browser-session client (pakai anon key + cookie) ─────────
// Dipakai di Server Components yang perlu tahu user session
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component — set cookie harus lewat middleware
            // Error ini normal, diabaikan
          }
        },
      },
    }
  );
}

// ── Service role client (bypass RLS) ─────────────────────────
// TANPA cookie — dijamin bypass RLS karena pakai supabase-js langsung
// HANYA dipakai di server-side (API routes) yang perlu akses penuh
// JANGAN expose ke client
export async function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
