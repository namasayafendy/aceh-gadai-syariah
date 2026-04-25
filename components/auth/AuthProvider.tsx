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
  useEffect,
  useRef,
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

  // ── Polling /api/auth/session-check tiap 15 detik ──
  // Auto-kick kalau session_id mismatch (login di browser lain) atau
  // umur sesi > 20 jam. OWNER selalu valid (server-side bypass).
  const polledRef = useRef(false);
  useEffect(() => {
    if (!initialUser) return;        // Tidak login -> skip polling
    if (initialUser.role === 'OWNER') return; // OWNER bypass
    if (polledRef.current) return;
    polledRef.current = true;

    const POLL_MS = 15_000;
    let stopped = false;

    async function check() {
      if (stopped) return;
      try {
        const res = await fetch('/api/auth/session-check', { cache: 'no-store' });
        const json = await res.json();
        if (!stopped && json && json.valid === false) {
          // Force logout
          stopped = true;
          const reason = json.reason || 'invalid';
          const reasonMsg: Record<string, string> = {
            session_kicked: 'Akun Anda login di perangkat lain.',
            timeout_20h:    'Sesi 20 jam habis. Silakan login ulang.',
            no_cookie:      'Sesi tidak ditemukan.',
            no_db_session:  'Sesi tidak terdaftar.',
            no_session:     'Sesi Supabase hilang.',
            profile_inactive: 'Akun nonaktif.',
          };
          const msg = reasonMsg[reason] ?? 'Sesi tidak valid. Login ulang.';
          // Reload via /api/auth/logout (POST) -> redirect /login
          alert(msg);
          try {
            await fetch('/api/auth/logout', { method: 'POST', redirect: 'manual' });
          } catch { /* silent */ }
          window.location.href = '/login';
        }
      } catch { /* silent — network blip */ }
    }

    // First check ~3 detik setelah mount (kasih waktu app stable)
    const first = setTimeout(check, 3_000);
    const interval = setInterval(check, POLL_MS);
    return () => {
      stopped = true;
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [initialUser]);

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
