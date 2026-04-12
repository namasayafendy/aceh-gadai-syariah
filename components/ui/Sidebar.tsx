'use client';

// ============================================================
// ACEH GADAI SYARIAH - Sidebar Navigation
// File: components/ui/Sidebar.tsx
// Mirroring GAS Index.html sidebar
// ============================================================

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/components/auth/AuthProvider';
import { useState, useEffect } from 'react';
import { formatRp } from '@/lib/format';

interface NavItem {
  href: string;
  icon: string;
  label: string;
  section?: string;
  roles?: Array<'KASIR' | 'ADMIN' | 'OWNER'>;
}

const NAV_ITEMS: NavItem[] = [
  // Utama
  { href: '/',          icon: '📊', label: 'Dashboard',          section: 'Utama' },
  // Transaksi
  { href: '/gadai',     icon: '💰', label: 'Gadai Baru',         section: 'Transaksi' },
  { href: '/tebus',     icon: '🔓', label: 'Tebus / Perpanjang', section: 'Transaksi' },
  { href: '/sjb',       icon: '📄', label: 'Jual Titip (SJB)',   section: 'Transaksi' },
  { href: '/jatuhtempo',icon: '⏰', label: 'Jatuh Tempo',        section: 'Transaksi' },
  // Gudang
  { href: '/stok',      icon: '📦', label: 'Cek Stok',           section: 'Gudang',  roles: ['ADMIN','OWNER'] },
  { href: '/sita',      icon: '🔒', label: 'Gudang Sita',        section: 'Gudang',  roles: ['ADMIN','OWNER'] },
  // Laporan
  { href: '/laporan',   icon: '📋', label: 'Laporan Malam',      section: 'Laporan', roles: ['ADMIN','OWNER'] },
  { href: '/kas',       icon: '💼', label: 'Buku Kas',           section: 'Laporan', roles: ['ADMIN','OWNER'] },
  // Admin
  { href: '/edit',      icon: '✏️', label: 'Edit Transaksi',     section: 'Admin',   roles: ['ADMIN','OWNER'] },
  { href: '/backup',    icon: '💾', label: 'Backup & Bon',       section: 'Admin',   roles: ['ADMIN','OWNER'] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, outletId } = useAuth();
  const [saldoCash, setSaldoCash] = useState<number>(0);
  const [saldoBank, setSaldoBank] = useState<number>(0);
  const [clock, setClock] = useState('');

  // Fetch saldo kas
  useEffect(() => {
    async function fetchSaldo() {
      try {
        const res = await fetch(`/api/kas?outletId=${outletId}`);
        const json = await res.json();
        if (json.ok) {
          setSaldoCash(json.saldo?.cash ?? 0);
          setSaldoBank(json.saldo?.bank ?? 0);
        }
      } catch { /* silent */ }
    }
    fetchSaldo();
    const interval = setInterval(fetchSaldo, 60000); // refresh tiap 1 menit
    return () => clearInterval(interval);
  }, [outletId]);

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, []);

  // Filter nav items by role
  const userRole = user?.role;
  const visibleItems = NAV_ITEMS.filter(item => {
    if (!item.roles) return true;
    return userRole && item.roles.includes(userRole);
  });

  // Group by section
  let lastSection = '';

  return (
    <div style={{
      width: 220, minWidth: 220, background: 'var(--surface)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', height: '100vh',
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5 }}>
          <span style={{
            display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
            background: 'var(--green)', marginRight: 6,
            animation: 'pulse 2s infinite',
          }} />
          ACEH GADAI
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2, fontFamily: 'var(--mono)' }}>
          {user?.outlet_name ?? 'Loading...'}
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ flex: 1, padding: '12px 8px', overflowY: 'auto' }}>
        {visibleItems.map((item) => {
          const showSection = item.section && item.section !== lastSection;
          if (showSection) lastSection = item.section!;
          const isActive = pathname === item.href;

          return (
            <div key={item.href}>
              {showSection && (
                <div style={{
                  fontSize: 10, color: 'var(--text3)', fontWeight: 600,
                  letterSpacing: 1, padding: '8px 8px 4px', textTransform: 'uppercase',
                }}>
                  {item.section}
                </div>
              )}
              <Link href={item.href} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px',
                  borderRadius: 7, cursor: 'pointer', fontSize: 13, marginBottom: 2,
                  color: isActive ? 'var(--accent)' : 'var(--text2)',
                  background: isActive ? 'rgba(59,130,246,.15)' : 'transparent',
                  transition: 'all .15s',
                }}>
                  <span style={{ width: 18, textAlign: 'center', fontSize: 15 }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Footer: Saldo + Clock */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text3)' }}>
        {/* User info */}
        <div style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', marginBottom: 8 }}>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.email}
          </div>
          <div style={{ marginTop: 3 }}>
            <span className={`badge ${user?.role?.toLowerCase()}`}>{user?.role}</span>
          </div>
        </div>

        {/* Saldo */}
        <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: .5 }}>
            💵 Saldo Cash (Laci)
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--green)', fontWeight: 500 }}>
            {formatRp(saldoCash)}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, marginBottom: 4, textTransform: 'uppercase', letterSpacing: .5 }}>
            🏦 Saldo Bank
          </div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
            {formatRp(saldoBank)}
          </div>
        </div>

        {/* Clock */}
        <div style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text3)' }}>
          {clock}
        </div>
      </div>
    </div>
  );
}
