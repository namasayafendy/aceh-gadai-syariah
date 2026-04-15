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
    <Suspense fallback={null}>
      <LoginForm
        error={params.error}
        redirectTo={params.redirect}
      />
    </Suspense>
  );
}
