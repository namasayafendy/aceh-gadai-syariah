// ============================================================
// ACEH GADAI SYARIAH - Unauthorized Page
// File: app/unauthorized/page.tsx
// ============================================================

import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f1117] to-[#1a1d2e] px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">🚫</div>
        <h1 className="text-xl font-bold text-white mb-2">Akses Ditolak</h1>
        <p className="text-sm text-gray-400 mb-6">
          Akun Anda tidak memiliki izin untuk mengakses halaman ini.
          Hubungi admin jika Anda yakin ini adalah kesalahan.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg
                     bg-amber-500 hover:bg-amber-400 text-white text-sm
                     font-medium transition-colors"
        >
          ← Kembali ke Dashboard
        </Link>
      </div>
    </div>
  );
}
