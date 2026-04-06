// ============================================================
// ACEH GADAI SYARIAH - Auth Helpers
// File: lib/auth/helpers.ts
// Server-side helper untuk get session user info
// ============================================================

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { SessionUser, PinValidationResult } from '@/types/auth';

// ── getSessionUser ────────────────────────────────────────────
// Ambil data user yang sedang login (dari cookies/session)
// Return null jika belum login atau akun nonaktif
export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

    // Ambil profile + outlet name sekaligus via SQL function
    const { data: profile, error: profileError } = await (supabase as any)
      .rpc('get_user_profile', { user_id: user.id });

    if (profileError || !profile) return null;

    return {
      id:                   user.id,
      email:                user.email ?? '',
      nama:                 profile.nama,
      role:                 profile.role,
      outlet_id:            profile.outlet_id,
      outlet_name:          profile.outlet_name,
      show_branch_selector: profile.show_branch_selector,
    };
  } catch {
    return null;
  }
}

// ── requireAuth ───────────────────────────────────────────────
// Dipakai di Server Components / API routes yang wajib login
// Throw jika belum login
export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return user;
}

// ── requireRole ───────────────────────────────────────────────
// Throw jika role tidak sesuai
export async function requireRole(
  allowedRoles: Array<'KASIR' | 'ADMIN' | 'OWNER'>
): Promise<SessionUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) {
    throw new Error('Forbidden: insufficient role');
  }
  return user;
}

// ── validatePin ───────────────────────────────────────────────
// Server-side PIN validation untuk kasir operations
// Mirip validatePin() di GAS Code.gs
// outlet_id diambil dari session user yang login (bukan dari client)
export async function validatePin(
  pin: string,
  outletId: number
): Promise<PinValidationResult> {
  if (!pin || pin.length !== 4) {
    return { ok: false, msg: 'PIN harus 4 digit' };
  }

  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .rpc('validate_pin', { p_pin: pin, p_outlet_id: outletId });

    if (error) return { ok: false, msg: error.message };
    return data as PinValidationResult;
  } catch (e) {
    return { ok: false, msg: 'Server error: ' + (e as Error).message };
  }
}

// ── getKaryawanList ───────────────────────────────────────────
// Ambil list karyawan untuk dropdown di form transaksi
// Mirip getKaryawanList() di GAS Code.gs
export async function getKaryawanList(outletId: number) {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('karyawan')
      .select('nama, role')
      .eq('status', 'AKTIF')
      .or(outletId === 0 ? 'outlet_id.gte.0' : `outlet_id.eq.${outletId},outlet_id.eq.0`);

    if (error) return [];
    return data.map(k => ({ nama: k.nama, role: k.role }));
  } catch {
    return [];
  }
}

// ── getOutletConfig ───────────────────────────────────────────
// Ambil config outlet berdasarkan outlet_id
export async function getOutletConfig(outletId: number) {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('outlets')
      .select('*')
      .eq('id', outletId)
      .single();

    if (error) return null;
    return data;
  } catch {
    return null;
  }
}

// ── signOut ───────────────────────────────────────────────────
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
