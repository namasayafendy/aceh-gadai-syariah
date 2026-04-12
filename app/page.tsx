'use client';

// ============================================================
// ACEH GADAI SYARIAH - Dashboard
// File: app/page.tsx
// Halaman utama: ringkasan saldo kas + transaksi hari ini
// ============================================================

import { useEffect, useState } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, todayISO } from '@/lib/format';

interface DashboardData {
  saldo: { cash: number; bank: number };
  gadaiCount: number;
  gadaiTotal: number;
  tebusCount: number;
  tebusTotal: number;
  sjbCount: number;
  sjbTotal: number;
}

export default function DashboardPage() {
  const outletId = useOutletId();
  const [data, setData] = useState<DashboardData>({
    saldo: { cash: 0, bank: 0 },
    gadaiCount: 0, gadaiTotal: 0,
    tebusCount: 0, tebusTotal: 0,
    sjbCount: 0, sjbTotal: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDashboard() {
      setLoading(true);
      try {
        // Fetch kas saldo
        const kasRes = await fetch(`/api/kas?outletId=${outletId}`);
        const kasJson = await kasRes.json();

        // Fetch laporan harian for today's stats
        const tgl = todayISO();
        const lapRes = await fetch(`/api/laporan/harian?tgl=${tgl}&outletId=${outletId}`);
        const lapJson = await lapRes.json();

        setData({
          saldo: kasJson.ok ? kasJson.saldo : { cash: 0, bank: 0 },
          gadaiCount: lapJson.ok ? (lapJson.gadai?.length ?? 0) : 0,
          gadaiTotal: lapJson.ok ? (lapJson.gadai?.reduce((s: number, r: any) => s + (r.jumlah_gadai ?? 0), 0) ?? 0) : 0,
          tebusCount: lapJson.ok ? (lapJson.tebus?.length ?? 0) : 0,
          tebusTotal: lapJson.ok ? (lapJson.tebus?.reduce((s: number, r: any) => s + (r.jumlah_bayar ?? 0), 0) ?? 0) : 0,
          sjbCount: lapJson.ok ? (lapJson.sjb?.length ?? 0) : 0,
          sjbTotal: lapJson.ok ? (lapJson.sjb?.reduce((s: number, r: any) => s + (r.harga_jual ?? 0), 0) ?? 0) : 0,
        });
      } catch { /* silent */ }
      setLoading(false);
    }
    fetchDashboard();
  }, [outletId]);

  return (
    <AppShell title="Dashboard" subtitle={`Ringkasan hari ini — ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}>
      <div className="content-area">
        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card gold">
            <div className="s-lbl">Saldo Cash</div>
            <div className="s-val">{loading ? '...' : formatRp(data.saldo.cash)}</div>
            <div className="s-sub">Laci / Tunai</div>
          </div>
          <div className="stat-card">
            <div className="s-lbl">Saldo Bank</div>
            <div className="s-val">{loading ? '...' : formatRp(data.saldo.bank)}</div>
            <div className="s-sub">Transfer</div>
          </div>
          <div className="stat-card blue">
            <div className="s-lbl">Gadai Hari Ini</div>
            <div className="s-val">{loading ? '...' : data.gadaiCount}</div>
            <div className="s-sub">{formatRp(data.gadaiTotal)}</div>
          </div>
          <div className="stat-card green">
            <div className="s-lbl">Tebus Hari Ini</div>
            <div className="s-val">{loading ? '...' : data.tebusCount}</div>
            <div className="s-sub">{formatRp(data.tebusTotal)}</div>
          </div>
        </div>

        {/* Placeholder for today's transaction list */}
        <div className="section-title">Transaksi Terbaru</div>
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>No Faktur</th>
                <th>Nama</th>
                <th>Barang</th>
                <th className="num">Nominal</th>
                <th>Status</th>
                <th>Kasir</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="empty-state">
                  {loading ? 'Memuat...' : 'Belum ada transaksi hari ini'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
