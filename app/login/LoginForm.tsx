'use client';

// ============================================================
// ACEH GADAI SYARIAH - Login Form
// File: app/login/LoginForm.tsx
// Client Component — handle form state & submit
// ============================================================

import { useState } from 'react';
import { loginAction } from './actions';

interface LoginFormProps {
  error?: string;
  redirectTo?: string;
}

export default function LoginForm({ error: initialError, redirectTo }: LoginFormProps) {
  const [loading, setLoading]   = useState(false);
  const [showPw,  setShowPw]    = useState(false);
  const [error,   setError]     = useState(initialError || '');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    if (redirectTo) formData.set('redirect', redirectTo);

    try {
      // loginAction akan redirect — tidak return value
      await loginAction(formData);
    } catch (err: unknown) {
      // Next.js redirect melempar NEXT_REDIRECT — itu bukan error
      const e = err as { digest?: string };
      if (e?.digest?.startsWith('NEXT_REDIRECT')) throw err;
      setError('Terjadi kesalahan. Coba lagi.');
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo & Header */}
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 mb-4 shadow-lg shadow-amber-500/20">
          <span className="text-2xl">🏆</span>
        </div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Aceh Gadai Syariah
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          Sistem Manajemen Multi-Outlet
        </p>
      </div>

      {/* Card */}
      <div
        className="bg-[#1e2130] border border-white/8 rounded-2xl p-8 shadow-2xl"
        style={{ backdropFilter: 'blur(20px)' }}
      >
        <h2 className="text-lg font-semibold text-white mb-1">
          Selamat Datang
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          Masuk dengan akun yang terdaftar
        </p>

        {/* Error Banner */}
        {error && (
          <div className="mb-4 flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
            <span className="text-red-400 text-sm mt-0.5">⚠️</span>
            <p className="text-sm text-red-300">{decodeURIComponent(error)}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Email
            </label>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              placeholder="email@domain.com"
              disabled={loading}
              className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border border-white/10
                         text-white placeholder-gray-500 text-sm
                         focus:outline-none focus:border-amber-500/60 focus:bg-white/8
                         disabled:opacity-50 transition-colors"
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                name="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                disabled={loading}
                className="w-full px-3.5 py-2.5 pr-10 rounded-lg bg-white/5 border border-white/10
                           text-white placeholder-gray-500 text-sm
                           focus:outline-none focus:border-amber-500/60 focus:bg-white/8
                           disabled:opacity-50 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPw(v => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200 transition-colors text-sm"
              >
                {showPw ? '🙈' : '👁️'}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg font-semibold text-sm
                       bg-gradient-to-r from-amber-500 to-amber-600
                       hover:from-amber-400 hover:to-amber-500
                       text-white shadow-lg shadow-amber-500/25
                       disabled:opacity-60 disabled:cursor-not-allowed
                       transition-all duration-200 active:scale-[0.98]"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Memverifikasi...
              </span>
            ) : (
              'Masuk →'
            )}
          </button>
        </form>
      </div>

      {/* Footer */}
      <p className="text-center text-xs text-gray-600 mt-6">
        PT. Aceh Gadai Syariah &copy; {new Date().getFullYear()}
      </p>
    </div>
  );
}
