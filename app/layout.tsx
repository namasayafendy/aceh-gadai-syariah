// ============================================================
// ACEH GADAI SYARIAH - Root Layout
// File: app/layout.tsx
// Server Component — ambil session user, inject ke AuthProvider
// ============================================================

import type { Metadata } from 'next';
import { getSessionUser } from '@/lib/auth/helpers';
import { AuthProvider } from '@/components/auth/AuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Aceh Gadai Syariah',
  description: 'Sistem Manajemen Gadai Multi-Outlet',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  const sessionUser = await getSessionUser();

  return (
    <html lang="id">
      <body>
        <AuthProvider initialUser={sessionUser}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
