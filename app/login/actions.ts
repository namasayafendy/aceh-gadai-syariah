// ============================================================
// ACEH GADAI SYARIAH - Login Server Actions
// File: app/login/actions.ts
// 'use server' — dijalankan di server, aman
// ============================================================

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// ── loginAction ───────────────────────────────────────────────
// Dipanggil dari login form submit
export async function loginAction(formData: FormData) {
  const email    = formData.get('email')    as string;
  const password = formData.get('password') as string;
  const redirectTo = formData.get('redirect') as string || '/';

  if (!email || !password) {
    redirect('/login?error=Email+dan+password+wajib+diisi');
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email:    email.trim().toLowerCase(),
    password: password,
  });

  if (error) {
    // Translate error Supabase ke Bahasa Indonesia
    let msg = 'Email atau password salah.';
    if (error.message.includes('Email not confirmed')) {
      msg = 'Email belum dikonfirmasi. Cek inbox email Anda.';
    } else if (error.message.includes('Invalid login credentials')) {
      msg = 'Email atau password salah.';
    } else if (error.message.includes('Too many requests')) {
      msg = 'Terlalu banyak percobaan login. Coba lagi dalam beberapa menit.';
    }
    redirect('/login?error=' + encodeURIComponent(msg));
  }

  if (!data.user) {
    redirect('/login?error=Login+gagal.+Coba+lagi.');
  }

  // ── Cek profile exists & AKTIF ───────────────────────────
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('status, role, outlet_id')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile) {
    await supabase.auth.signOut();
    redirect('/login?error=' + encodeURIComponent(
      'Akun tidak terdaftar di sistem. Hubungi admin.'
    ));
  }

  if (profile.status !== 'AKTIF') {
    await supabase.auth.signOut();
    redirect('/login?error=' + encodeURIComponent(
      'Akun Anda tidak aktif. Hubungi admin.'
    ));
  }

  // ── Redirect setelah login ────────────────────────────────
  revalidatePath('/', 'layout');

  // Owner/Admin dengan outlet_id = 0 → ke branch selector atau langsung dashboard
  // Kasir spesifik outlet → langsung ke outlet mereka
  if (profile.outlet_id === 0) {
    // Tampilkan branch selector
    redirect('/select-outlet');
  } else {
    redirect(redirectTo === '/login' ? '/' : redirectTo);
  }
}

// ── logoutAction ─────────────────────────────────────────────
export async function logoutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/login');
}
