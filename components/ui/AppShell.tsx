'use client';

// ============================================================
// ACEH GADAI SYARIAH - App Shell
// File: components/ui/AppShell.tsx
// Wraps authenticated pages with Sidebar + Topbar
// ============================================================

import Sidebar from '@/components/ui/Sidebar';
import { useAuth } from '@/components/auth/AuthProvider';

interface AppShellProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
}

export default function AppShell({ children, title, subtitle }: AppShellProps) {
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-area">
        {/* Topbar */}
        <div className="topbar">
          <div>
            <div className="topbar-title">{title}</div>
            {subtitle && <div className="topbar-sub">{subtitle}</div>}
          </div>
          <div className="topbar-right">
            <div className="topbar-badge">👤 {user?.nama ?? '—'}</div>
          </div>
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}
