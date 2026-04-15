'use client';

// ============================================================
// ACEH GADAI SYARIAH - Select Outlet Client
// File: app/select-outlet/SelectOutletClient.tsx
// Inline styles — consistent with rest of app (no Tailwind)
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
    router.push(`/?outlet=${outletId}`);
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f1117 0%, #1a1d2e 50%, #0f1117 100%)',
      padding: 20, fontFamily: 'var(--font, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif)',
    }}>
      {/* Decorative elements */}
      <div style={{
        position: 'fixed', top: -200, right: -200, width: 500, height: 500,
        borderRadius: '50%', background: 'radial-gradient(circle, rgba(245,158,11,.08) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      <div style={{ width: '100%', maxWidth: 520, position: 'relative', zIndex: 1 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: 16,
            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
            boxShadow: '0 8px 32px rgba(245,158,11,.3)',
            marginBottom: 16, fontSize: 28,
          }}>
            <span>&#x1F3EC;</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#fff', margin: 0 }}>Pilih Outlet</h1>
          <p style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
            Halo, <strong style={{ color: '#f59e0b' }}>{user.nama}</strong> — pilih outlet yang ingin Anda kelola
          </p>
        </div>

        {/* Outlet Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {outlets.map((outlet) => (
            <button key={outlet.id} onClick={() => handleSelect(outlet.id)}
              style={{
                width: '100%', textAlign: 'left', padding: '16px 20px', borderRadius: 14,
                background: 'rgba(30,33,48,.9)', border: '1px solid rgba(255,255,255,.08)',
                cursor: 'pointer', transition: 'all .2s',
                boxShadow: '0 4px 16px rgba(0,0,0,.2)',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'rgba(245,158,11,.4)'; (e.target as HTMLElement).style.background = 'rgba(37,40,64,.9)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(255,255,255,.08)'; (e.target as HTMLElement).style.background = 'rgba(30,33,48,.9)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>&#x1F3E2;</span>
                    <span style={{ fontWeight: 700, color: '#fff', fontSize: 15 }}>{outlet.name}</span>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(16,185,129,.15)', color: '#34d399',
                      border: '1px solid rgba(16,185,129,.25)', fontWeight: 600,
                    }}>AKTIF</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0, paddingLeft: 26 }}>
                    {outlet.alamat || outlet.kota || '—'}
                  </p>
                </div>
                <span style={{ fontSize: 20, color: '#4b5563' }}>&#x2192;</span>
              </div>
            </button>
          ))}

          {/* Owner: option to see all outlets */}
          {user.role === 'OWNER' && (
            <button onClick={() => handleSelect(0)}
              style={{
                width: '100%', textAlign: 'left', padding: '16px 20px', borderRadius: 14,
                background: 'rgba(245,158,11,.05)', border: '1px solid rgba(245,158,11,.2)',
                cursor: 'pointer', transition: 'all .2s',
              }}
              onMouseEnter={e => { (e.target as HTMLElement).style.borderColor = 'rgba(245,158,11,.5)'; (e.target as HTMLElement).style.background = 'rgba(245,158,11,.1)'; }}
              onMouseLeave={e => { (e.target as HTMLElement).style.borderColor = 'rgba(245,158,11,.2)'; (e.target as HTMLElement).style.background = 'rgba(245,158,11,.05)'; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 18 }}>&#x1F4CA;</span>
                    <span style={{ fontWeight: 700, color: '#f59e0b', fontSize: 15 }}>Semua Outlet</span>
                    <span style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(245,158,11,.15)', color: '#f59e0b',
                      border: '1px solid rgba(245,158,11,.25)', fontWeight: 600,
                    }}>KONSOLIDASI</span>
                  </div>
                  <p style={{ fontSize: 12, color: '#6b7280', margin: 0, paddingLeft: 26 }}>
                    Laporan gabungan semua outlet
                  </p>
                </div>
                <span style={{ fontSize: 20, color: 'rgba(245,158,11,.4)' }}>&#x2192;</span>
              </div>
            </button>
          )}
        </div>

        {/* Logout */}
        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <form action="/api/auth/logout" method="POST">
            <button type="submit" style={{
              background: 'none', border: 'none', fontSize: 11, color: '#4b5563',
              cursor: 'pointer', padding: 4,
            }}>
              Logout dari akun {user.email}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
