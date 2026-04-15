'use client';

// ============================================================
// ACEH GADAI SYARIAH - Login Form
// File: app/login/LoginForm.tsx
// Client Component — handle form state & submit
// Inline styles (no Tailwind) — consistent with rest of app
// ============================================================

import { useState } from 'react';
import { loginAction } from './actions';

interface LoginFormProps {
  error?: string;
  redirectTo?: string;
}

export default function LoginForm({ error: initialError, redirectTo }: LoginFormProps) {
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState(initialError || '');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    if (redirectTo) formData.set('redirect', redirectTo);

    try {
      await loginAction(formData);
    } catch (err: unknown) {
      const e = err as { digest?: string };
      if (e?.digest?.startsWith('NEXT_REDIRECT')) throw err;
      setError('Terjadi kesalahan. Coba lagi.');
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f1117 0%, #1a1d2e 50%, #0f1117 100%)',
      padding: 20, fontFamily: 'var(--font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
    }}>
      {/* Decorative background elements */}
      <div style={{
        position: 'fixed', top: -200, right: -200, width: 500, height: 500,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'fixed', bottom: -150, left: -150, width: 400, height: 400,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.06) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
        {/* Logo & Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            boxShadow: '0 8px 32px rgba(245,158,11,.3)',
            marginBottom: 16, fontSize: 28,
          }}>
            <span role="img" aria-label="logo">&#x1F3C6;</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>
            Aceh Gadai Syariah
          </h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
            Sistem Manajemen Multi-Outlet
          </p>
        </div>

        {/* Card */}
        <div style={{
          background: 'rgba(30,33,48,.9)', border: '1px solid rgba(255,255,255,.08)',
          borderRadius: 16, padding: '32px 28px',
          boxShadow: '0 20px 60px rgba(0,0,0,.4)',
          backdropFilter: 'blur(20px)',
        }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>
            Selamat Datang
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
            Masuk dengan akun yang terdaftar
          </p>

          {/* Error Banner */}
          {error && (
            <div style={{
              marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8,
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)',
            }}>
              <span style={{ color: '#f87171', fontSize: 13 }}>&#x26A0;&#xFE0F;</span>
              <p style={{ fontSize: 13, color: '#fca5a5', margin: 0 }}>{decodeURIComponent(error)}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Email
              </label>
              <input
                type="email" name="email" required autoComplete="email"
                placeholder="email@domain.com" disabled={loading}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                  color: '#fff', fontSize: 14, outline: 'none',
                  transition: 'border-color .2s, background .2s',
                  opacity: loading ? .5 : 1, boxSizing: 'border-box',
                }}
                onFocus={e => { e.target.style.borderColor = 'rgba(245,158,11,.5)'; e.target.style.background = 'rgba(255,255,255,.08)'; }}
                onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,.1)'; e.target.style.background = 'rgba(255,255,255,.05)'; }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} name="password" required
                  autoComplete="current-password" placeholder="••••••••" disabled={loading}
                  style={{
                    width: '100%', padding: '10px 14px', paddingRight: 40, borderRadius: 8,
                    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
                    color: '#fff', fontSize: 14, outline: 'none',
                    transition: 'border-color .2s, background .2s',
                    opacity: loading ? .5 : 1, boxSizing: 'border-box',
                  }}
                  onFocus={e => { e.target.style.borderColor = 'rgba(245,158,11,.5)'; e.target.style.background = 'rgba(255,255,255,.08)'; }}
                  onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,.1)'; e.target.style.background = 'rgba(255,255,255,.05)'; }}
                />
                <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                  style={{
                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer',
                    fontSize: 14, padding: 4,
                  }}>
                  {showPw ? '\uD83D\uDE48' : '\uD83D\uDC41\uFE0F'}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              style={{
                width: '100%', padding: '11px 16px', borderRadius: 8,
                fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                color: '#fff', boxShadow: '0 4px 16px rgba(245,158,11,.3)',
                opacity: loading ? .6 : 1,
                transition: 'all .2s',
              }}>
              {loading ? 'Memverifikasi...' : 'Masuk'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 24 }}>
          PT. Aceh Gadai Syariah &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
