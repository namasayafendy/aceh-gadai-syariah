// ============================================================
// ACEH GADAI SYARIAH - Login Page
// File: app/login/page.tsx
// ============================================================

import { Suspense } from 'react';
import LoginForm from './LoginForm';

interface LoginPageProps {
  searchParams: Promise<{ error?: string; redirect?: string }>;
}

export const metadata = {
  title: 'Login — Aceh Gadai Syariah',
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1117] to-[#1a1d2e] px-4">
      <Suspense fallback={null}>
        <LoginForm
          error={params.error}
          redirectTo={params.redirect}
        />
      </Suspense>
    </div>
  );
}
