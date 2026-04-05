// ============================================================
// ACEH GADAI SYARIAH - Supabase Browser Client
// File: lib/supabase/client.ts
// Dipakai di Client Components ('use client')
// ============================================================

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/auth';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
