'use client';

// ============================================================
// ACEH GADAI SYARIAH - Select Outlet Client
// File: app/select-outlet/SelectOutletClient.tsx
// ============================================================

import { useRouter } from 'next/navigation';
import type { SessionUser } from '@/types/auth';

interface Outlet {
  id: number;
  name: string;
  kota: string | null;
  alamat: string | null;
}

interface Props {
  user: SessionUser;
  outlets: Outlet[];
}

export default function SelectOutletClient({ user, outlets }: Props) {
  const router = useRouter();

  function handleSelect(outletId: number) {
    // Simpan outlet yang dipilih di cookie/searchParam
    // Redirect ke main app dengan outlet yang dipilih
    router.push(`/?outlet=${outletId}`);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1117] to-[#1a1d2e] px-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 mb-4 shadow-lg shadow-amber-500/20">
            <span className="text-2xl">🏬</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Pilih Outlet</h1>
          <p className="text-sm text-gray-400 mt-1">
            Halo, <strong className="text-amber-400">{user.nama}</strong>
            {' '}— pilih outlet yang ingin Anda kelola
          </p>
        </div>

        {/* Outlet Cards */}
        <div className="space-y-3">
          {outlets.map((outlet) => (
            <button
              key={outlet.id}
              onClick={() => handleSelect(outlet.id)}
              className="w-full text-left p-5 rounded-2xl
                         bg-[#1e2130] border border-white/8
                         hover:border-amber-500/40 hover:bg-[#252840]
                         transition-all duration-200 active:scale-[0.99]
                         group shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">🏢</span>
                    <span className="font-bold text-white text-base">
                      {outlet.name}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/25">
                      AKTIF
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 ml-7">
                    {outlet.alamat || outlet.kota || '-'}
                  </p>
                </div>
                <span className="text-gray-500 group-hover:text-amber-400 transition-colors text-xl">
                  →
                </span>
              </div>
            </button>
          ))}

          {/* Opsi lihat semua outlet (laporan konsolidasi) */}
          {user.role === 'OWNER' && (
            <button
              onClick={() => handleSelect(0)}
              className="w-full text-left p-5 rounded-2xl
                         bg-amber-500/5 border border-amber-500/20
                         hover:border-amber-500/50 hover:bg-amber-500/10
                         transition-all duration-200 active:scale-[0.99]
                         group"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">📊</span>
                    <span className="font-bold text-amber-400 text-base">
                      Semua Outlet
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/25">
                      KONSOLIDASI
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 ml-7">
                    Laporan gabungan semua outlet
                  </p>
                </div>
                <span className="text-amber-500/40 group-hover:text-amber-400 transition-colors text-xl">
                  →
                </span>
              </div>
            </button>
          )}
        </div>

        {/* Logout link */}
        <div className="text-center mt-6">
          <form action="/api/auth/logout" method="POST">
            <button
              type="submit"
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Logout dari akun {user.email}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
