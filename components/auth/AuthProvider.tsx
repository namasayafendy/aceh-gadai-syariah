'use client';

// ============================================================
// ACEH GADAI SYARIAH - Auth Context Provider
// File: components/auth/AuthProvider.tsx
//
// Menyediakan SessionUser ke semua Client Components via context.
// Wrap di root layout. Data awal diambil dari Server Component.
// ============================================================

import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { SessionUser } from '@/types/auth';

// ── Context ────────────────────────────────────────────────
interface AuthContextValue {
  user: SessionUser | null;
  outletId: number;           // Outlet yang sedang aktif (bisa berbeda dari user.outlet_id kalau owner pilih outlet)
  setActiveOutlet: (id: number) => void;
  isOwner: boolean;
  isAdmin: boolean;
  isAdminOrOwner: boolean;
  canAccessOutlet: (id: number) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ────────────────────────────────────────────────
interface AuthProviderProps {
  children: ReactNode;
  initialUser: SessionUser | null;
  initialOutletId?: number;   // Dari query param ?outlet=
}

export function AuthProvider({
  children,
  initialUser,
  initialOutletId,
}: AuthProviderProps) {
  // Active outlet: untuk Owner yang sudah pilih di branch selector
  const [activeOutletId, setActiveOutletId] = useState<number>(
    initialOutletId ?? initialUser?.outlet_id ?? 1
  );

  const setActiveOutlet = useCallback((id: number) => {
    setActiveOutletId(id);
  }, []);

  const isOwner         = initialUser?.role === 'OWNER';
  const isAdmin         = initialUser?.role === 'ADMIN';
  const isAdminOrOwner  = isOwner || isAdmin;

  const canAccessOutlet = useCallback(
    (id: number) => {
      if (!initialUser) return false;
      if (initialUser.outlet_id === 0) return true; // Owner/Admin bisa semua
      return initialUser.outlet_id === id;
    },
    [initialUser]
  );

  const value: AuthContextValue = {
    user:           initialUser,
    outletId:       activeOutletId,
    setActiveOutlet,
    isOwner,
    isAdmin,
    isAdminOrOwner,
    canAccessOutlet,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam <AuthProvider>');
  }
  return ctx;
}

// ── Convenience hooks ────────────────────────────────────────
export function useSessionUser(): SessionUser | null {
  return useAuth().user;
}

export function useOutletId(): number {
  return useAuth().outletId;
}
