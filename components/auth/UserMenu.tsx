'use client';

// ============================================================
// ACEH GADAI SYARIAH - User Menu Component
// File: components/auth/UserMenu.tsx
// Menampilkan info user + tombol logout di header
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from './AuthProvider';
import type { UserRole } from '@/types/auth';

const ROLE_COLOR: Record<UserRole, { bg: string; text: string }> = {
  OWNER: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  ADMIN: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
  KASIR: { bg: 'rgba(107,114,128,0.15)', text: '#9ca3af' },
};

export default function UserMenu() {
  const { user, outletId }  = useAuth();
  const router              = useRouter();
  const [open,    setOpen]  = useState(false);
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  const roleColor = ROLE_COLOR[user.role] ?? ROLE_COLOR.KASIR;

  async function handleLogout() {
    setLoading(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/login');
    router.refresh();
  }

  function handleBranchSwitch() {
    setOpen(false);
    router.push('/select-outlet');
  }

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg
                   bg-white/5 hover:bg-white/10 border border-white/10
                   transition-colors text-sm"
      >
        <span className="text-base">👤</span>
        <span className="text-white font-medium hidden sm:inline">
          {user.nama}
        </span>
        <span
          className="text-xs font-bold px-1.5 py-0.5 rounded"
          style={{ background: roleColor.bg, color: roleColor.text }}
        >
          {user.role}
        </span>
        <span className="text-gray-400 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <>
          {/* Overlay untuk close */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute right-0 top-full mt-2 w-56 z-50
                       bg-[#1e2130] border border-white/10 rounded-xl
                       shadow-2xl overflow-hidden"
          >
            {/* User info */}
            <div className="px-4 py-3 border-b border-white/8">
              <p className="text-sm font-semibold text-white">{user.nama}</p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{user.email}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Outlet:{' '}
                <span className="text-amber-400 font-medium">
                  {outletId === 0 ? 'Semua' : user.outlet_name}
                </span>
              </p>
            </div>

            {/* Actions */}
            <div className="p-1.5">
              {/* Branch switch — hanya untuk Owner/Admin */}
              {user.outlet_id === 0 && (
                <button
                  onClick={handleBranchSwitch}
                  className="w-full text-left flex items-center gap-2 px-3 py-2
                             rounded-lg text-sm text-gray-300 hover:bg-white/5
                             hover:text-white transition-colors"
                >
                  <span>🏬</span>
                  Ganti Outlet
                </button>
              )}

              {/* Logout */}
              <button
                onClick={handleLogout}
                disabled={loading}
                className="w-full text-left flex items-center gap-2 px-3 py-2
                           rounded-lg text-sm text-red-400 hover:bg-red-500/10
                           hover:text-red-300 transition-colors disabled:opacity-50"
              >
                <span>🚪</span>
                {loading ? 'Keluar...' : 'Logout'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
