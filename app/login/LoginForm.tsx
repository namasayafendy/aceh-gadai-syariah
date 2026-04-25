'use client';

// ============================================================
// ACEH GADAI SYARIAH - Login Form (2-step OTP)
// File: app/login/LoginForm.tsx
//
// Step 1: email + password -> POST /api/auth/login-step1
//   - OWNER (skipOtp:true)         -> langsung signInWithPassword + session-init
//   - KASIR/ADMIN                  -> simpan ticketId, lanjut Step 2
//
// Step 2: kode 6 digit -> POST /api/auth/login-step2
//   - OK -> client signInWithPassword + POST /api/auth/session-init -> redirect /
//   - "Minta OTP Ulang" -> /api/auth/login-otp-resend
//   - "Pakai Kode Master" -> kode di-input dianggap master (server cek)
// ============================================================

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface LoginFormProps {
  error?: string;
  redirectTo?: string;
}

type Step = 'cred' | 'otp';

export default function LoginForm({ error: initialError, redirectTo }: LoginFormProps) {
  const [step, setStep] = useState<Step>('cred');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [otp, setOtp] = useState('');
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [otpExpiresAt, setOtpExpiresAt] = useState<string | null>(null);
  const [otpRemaining, setOtpRemaining] = useState<number>(0);
  const [resendCount, setResendCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [error, setError] = useState(initialError ? decodeURIComponent(initialError) : '');
  const [info, setInfo] = useState('');
  const otpInputRef = useRef<HTMLInputElement>(null);

  // Countdown 5 menit OTP
  useEffect(() => {
    if (!otpExpiresAt) return;
    const t = setInterval(() => {
      const ms = new Date(otpExpiresAt).getTime() - Date.now();
      setOtpRemaining(Math.max(0, Math.floor(ms / 1000)));
    }, 1000);
    return () => clearInterval(t);
  }, [otpExpiresAt]);

  // Cooldown resend (30s)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // Auto focus OTP saat masuk step 2
  useEffect(() => { if (step === 'otp') otpInputRef.current?.focus(); }, [step]);

  async function finishLogin(emailFinal: string, passwordFinal: string) {
    // Client-side signInWithPassword (bikin Supabase cookies)
    const sb = createClient();
    const { error: signinErr } = await sb.auth.signInWithPassword({
      email: emailFinal, password: passwordFinal,
    });
    if (signinErr) {
      setError('Gagal sign in: ' + signinErr.message);
      setLoading(false);
      return;
    }
    // Generate session_id (single-session enforcement)
    try {
      await fetch('/api/auth/session-init', { method: 'POST' });
    } catch { /* silent */ }

    // Redirect ke "/" via full reload supaya server-side AuthProvider re-init
    window.location.href = redirectTo && redirectTo !== '/login' ? redirectTo : '/';
  }

  async function handleStep1(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;
    setLoading(true); setError(''); setInfo('');

    try {
      const res = await fetch('/api/auth/login-step1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.msg || 'Login gagal.');
        setLoading(false); return;
      }
      if (json.skipOtp) {
        // OWNER — langsung lanjut sign in
        await finishLogin(email.trim().toLowerCase(), password);
        return;
      }
      // KASIR / ADMIN — pindah ke step 2
      setTicketId(json.ticketId);
      setOtpExpiresAt(json.expiresAt);
      setResendCooldown(30);
      setStep('otp');
      if (json.otpSendError) {
        setInfo('OTP tersimpan tapi gagal kirim ke Telegram. Pakai "Minta OTP Ulang" atau Kode Master dari Owner.');
      } else {
        setInfo(`Kode OTP terkirim ke grup Telegram. Outlet: ${json.outletNama}.`);
      }
      setLoading(false);
    } catch {
      setError('Network error. Coba lagi.');
      setLoading(false);
    }
  }

  async function handleStep2(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading || !ticketId) return;
    setLoading(true); setError(''); setInfo('');

    try {
      const res = await fetch('/api/auth/login-step2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, code: otp.trim() }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.msg || 'Kode salah.');
        setLoading(false); return;
      }
      // OTP OK — sign in client SDK
      if (json.usedMaster) setInfo('Login pakai Kode Master.');
      await finishLogin(email.trim().toLowerCase(), password);
    } catch {
      setError('Network error. Coba lagi.');
      setLoading(false);
    }
  }

  async function handleResend() {
    if (loading || !ticketId || resendCooldown > 0) return;
    setLoading(true); setError(''); setInfo('');
    try {
      const res = await fetch('/api/auth/login-otp-resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.msg || 'Resend gagal.');
        setLoading(false); return;
      }
      setResendCooldown(30);
      setResendCount(json.resendCount ?? resendCount + 1);
      setInfo(json.otpSendError
        ? 'Resend tersimpan tapi Telegram gagal. Pakai Kode Master.'
        : `Kode OTP baru terkirim. Resend ke-${json.resendCount}/5.`);
      setLoading(false);
    } catch {
      setError('Network error.');
      setLoading(false);
    }
  }

  function handleBack() {
    setStep('cred'); setOtp(''); setTicketId(null);
    setOtpExpiresAt(null); setOtpRemaining(0);
    setResendCount(0); setResendCooldown(0);
    setError(''); setInfo('');
  }

  // ── Styles (sama dgn versi lama) ─────────────────────────
  const wrap: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f1117 0%, #1a1d2e 50%, #0f1117 100%)',
    padding: 20, fontFamily: 'var(--font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
  };
  const card: React.CSSProperties = {
    background: 'rgba(30,33,48,.9)', border: '1px solid rgba(255,255,255,.08)',
    borderRadius: 16, padding: '32px 28px',
    boxShadow: '0 20px 60px rgba(0,0,0,.4)',
    backdropFilter: 'blur(20px)',
  };
  const inputBase: React.CSSProperties = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)',
    color: '#fff', fontSize: 14, outline: 'none', boxSizing: 'border-box',
  };
  const btnPrimary: React.CSSProperties = {
    width: '100%', padding: '11px 16px', borderRadius: 8,
    fontWeight: 700, fontSize: 14, border: 'none', cursor: loading ? 'not-allowed' : 'pointer',
    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
    color: '#fff', boxShadow: '0 4px 16px rgba(245,158,11,.3)',
    opacity: loading ? .6 : 1,
  };
  const btnSec: React.CSSProperties = {
    padding: '8px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,.15)',
    background: 'transparent', color: '#9ca3af', fontSize: 12, cursor: 'pointer',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 11, fontWeight: 600, color: '#9ca3af',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.5px',
  };

  const mm = Math.floor(otpRemaining / 60).toString().padStart(2, '0');
  const ss = (otpRemaining % 60).toString().padStart(2, '0');

  return (
    <div style={wrap}>
      <div style={{ position: 'fixed', top: -200, right: -200, width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,.08) 0%, transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ position: 'fixed', bottom: -150, left: -150, width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, position: 'relative', zIndex: 1 }}>
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
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', margin: 0 }}>Aceh Gadai Syariah</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>Sistem Manajemen Multi-Outlet</p>
        </div>

        <div style={card}>
          <h2 style={{ fontSize: 18, fontWeight: 600, color: '#fff', margin: '0 0 4px' }}>
            {step === 'cred' ? 'Selamat Datang' : 'Verifikasi OTP'}
          </h2>
          <p style={{ fontSize: 13, color: '#6b7280', margin: '0 0 24px' }}>
            {step === 'cred'
              ? 'Masuk dengan akun yang terdaftar'
              : 'Masukkan kode 6 digit dari grup Telegram'}
          </p>

          {error && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)' }}>
              <p style={{ fontSize: 13, color: '#fca5a5', margin: 0 }}>⚠️ {error}</p>
            </div>
          )}
          {info && !error && (
            <div style={{ marginBottom: 16, padding: '10px 12px', borderRadius: 8, background: 'rgba(59,130,246,.1)', border: '1px solid rgba(59,130,246,.3)' }}>
              <p style={{ fontSize: 13, color: '#93c5fd', margin: 0 }}>ℹ️ {info}</p>
            </div>
          )}

          {step === 'cred' ? (
            <form onSubmit={handleStep1}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Email</label>
                <input type="email" required autoComplete="email" placeholder="email@domain.com"
                  value={email} onChange={e => setEmail(e.target.value)} disabled={loading}
                  style={{ ...inputBase, opacity: loading ? .5 : 1 }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <label style={labelStyle}>Password</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPw ? 'text' : 'password'} required autoComplete="current-password" placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)} disabled={loading}
                    style={{ ...inputBase, paddingRight: 40, opacity: loading ? .5 : 1 }} />
                  <button type="button" onClick={() => setShowPw(v => !v)} tabIndex={-1}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: 14, padding: 4 }}>
                    {showPw ? '🙈' : '👁️'}
                  </button>
                </div>
              </div>
              <button type="submit" disabled={loading} style={btnPrimary}>
                {loading ? 'Memverifikasi...' : 'Masuk'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleStep2}>
              <div style={{ marginBottom: 16 }}>
                <label style={labelStyle}>Kode OTP (6 digit)</label>
                <input ref={otpInputRef} type="text" inputMode="numeric" required maxLength={6} pattern="[0-9]{6}"
                  placeholder="000000" value={otp}
                  onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={loading}
                  style={{ ...inputBase, opacity: loading ? .5 : 1, fontSize: 22, letterSpacing: 8, textAlign: 'center', fontFamily: 'var(--mono, monospace)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#6b7280' }}>
                  <span>Berlaku: {otpRemaining > 0 ? `${mm}:${ss}` : 'kedaluwarsa'}</span>
                  <span>Resend: {resendCount}/5</span>
                </div>
              </div>
              <button type="submit" disabled={loading || otp.length !== 6} style={{ ...btnPrimary, marginBottom: 12 }}>
                {loading ? 'Memverifikasi...' : 'Konfirmasi'}
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={handleBack} disabled={loading} style={{ ...btnSec, flex: 1 }}>
                  ← Kembali
                </button>
                <button type="button" onClick={handleResend} disabled={loading || resendCooldown > 0} style={{ ...btnSec, flex: 2, opacity: resendCooldown > 0 ? .5 : 1 }}>
                  {resendCooldown > 0 ? `Resend (${resendCooldown}s)` : '🔄 Minta OTP Ulang'}
                </button>
              </div>
              <p style={{ fontSize: 11, color: '#6b7280', marginTop: 16, textAlign: 'center' }}>
                Kalau OTP tidak masuk, pakai <b>Kode Master</b> 6 digit dari Owner.
              </p>
            </form>
          )}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11, color: '#374151', marginTop: 24 }}>
          PT. Aceh Gadai Syariah &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
