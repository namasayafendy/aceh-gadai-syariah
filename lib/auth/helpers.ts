import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { SessionUser, PinValidationResult } from '@/types/auth';

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return null;

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

export async function requireAuth(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function requireRole(
  allowedRoles: Array<'KASIR' | 'ADMIN' | 'OWNER'>
): Promise<SessionUser> {
  const user = await requireAuth();
  if (!allowedRoles.includes(user.role)) throw new Error('Forbidden');
  return user;
}

export async function validatePin(
  pin: string,
  outletId: number
): Promise<PinValidationResult> {
  if (!pin || pin.length !== 4) return { ok: false, msg: 'PIN harus 4 digit' };
  try {
    const supabase = await createServiceClient();
    const { data, error } = await (supabase as any)
      .rpc('validate_pin', { p_pin: pin, p_outlet_id: outletId });
    if (error) return { ok: false, msg: error.message };
    return data as PinValidationResult;
  } catch (e) {
    return { ok: false, msg: 'Server error: ' + (e as Error).message };
  }
}

export async function getKaryawanList(outletId: number) {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase
      .from('karyawan').select('nama, role').eq('status', 'AKTIF')
      .or(outletId === 0 ? 'outlet_id.gte.0' : `outlet_id.eq.${outletId},outlet_id.eq.0`);
    if (error) return [];
    return data.map((k: any) => ({ nama: k.nama, role: k.role }));
  } catch { return []; }
}

export async function getOutletConfig(outletId: number) {
  try {
    const supabase = await createServiceClient();
    const { data, error } = await supabase.from('outlets').select('*').eq('id', outletId).single();
    if (error) return null;
    return data;
  } catch { return null; }
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}