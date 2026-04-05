// ============================================================
// ACEH GADAI SYARIAH - Root Layout
// File: app/layout.tsx
// Server Component — ambil session user, inject ke AuthProvider
// ============================================================

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { getSessionUser } from '@/lib/auth/helpers';
import { AuthProvider } from '@/components/auth/AuthProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Aceh Gadai Syariah',
  description: 'Sistem Manajemen Gadai Multi-Outlet',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default async function RootLayout({ children }: RootLayoutProps) {
  // Ambil session user di server — tidak bisa di-cache karena per-request
  const sessionUser = await getSessionUser();

  return (
    <html lang="id">
      <body className={inter.className}>
        {/*
          AuthProvider meneruskan sessionUser ke seluruh client components.
          Page /login dan /auth tidak butuh user — null aman.
        */}
        <AuthProvider initialUser={sessionUser}>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
