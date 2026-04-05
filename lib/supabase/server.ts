// ============================================================
// ACEH GADAI SYARIAH - Supabase Server Client
// File: lib/supabase/server.ts
// Dipakai di Server Components, API Routes, Server Actions
// ============================================================

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/types/auth';

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
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
// HANYA dipakai di server-side yang perlu akses penuh
// JANGAN expose ke client
export async function createServiceClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,   // service role key — secret!
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
          } catch { /* diabaikan di Server Components */ }
        },
      },
    }
  );
}
