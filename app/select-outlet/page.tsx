// ============================================================
// ACEH GADAI SYARIAH - Branch Selector
// File: app/select-outlet/page.tsx
// Ditampilkan ke OWNER/ADMIN (outlet_id = 0) setelah login
// Mirip branch selector di GAS Index.html
// ============================================================

import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth/helpers';
import { createServiceClient } from '@/lib/supabase/server';
import SelectOutletClient from './SelectOutletClient';

export const metadata = {
  title: 'Pilih Outlet — Aceh Gadai Syariah',
};

export default async function SelectOutletPage() {
  const user = await getSessionUser();

  if (!user) redirect('/login');

  // Kasir spesifik outlet tidak perlu branch selector
  if (user.outlet_id !== 0) {
    redirect('/');
  }

  // Ambil daftar outlet
  const supabase = await createServiceClient();
  const { data: outlets } = await supabase
    .from('outlets')
    .select('id, name, kota, alamat')
    .order('id');

  return (
    <SelectOutletClient
      user={user}
      outlets={outlets ?? []}
    />
  );
}
