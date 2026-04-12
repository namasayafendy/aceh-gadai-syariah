'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Cek Stok
// File: app/stok/page.tsx
// List semua kontrak AKTIF + filter kategori/outlet
// API: GET /api/gadai/stok?outletId=X&kategori=Y
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';

interface StokRow {
  id: string; no_faktur: string; nama: string; kategori: string;
  barang: string; taksiran: number; jumlah_gadai: number;
  tgl_gadai: string; tgl_jt: string; rak: string;
  barcode_a: string; status: string; outlet: string;
  _source: string;
}

const KATEGORI_ALL = ['', 'HANDPHONE', 'LAPTOP', 'ELEKTRONIK', 'EMAS', 'EMAS PAUN'];

export default function CekStokPage() {
  const outletId = useOutletId();
  const [rows, setRows] = useState<StokRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterKat, setFilterKat] = useState('');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/gadai/stok?outletId=${outletId}`;
      if (filterKat) url += `&kategori=${filterKat}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) setRows(json.rows || []);
    } catch { /* silent */ }
    setLoading(false);
  }, [outletId, filterKat]);

  useEffect(() => { loadData(); }, [loadData]);

  // Filter by search
  const filtered = rows.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return r.no_faktur.toLowerCase().includes(s) || r.nama.toLowerCase().includes(s) || r.barang.toLowerCase().includes(s) || (r.barcode_a || '').toLowerCase().includes(s);
  });

  // Stats
  const totalTaksiran = filtered.reduce((s, r) => s + (r.taksiran || 0), 0);
  const totalPinjaman = filtered.reduce((s, r) => s + (r.jumlah_gadai || 0), 0);

  return (
    <AppShell title="📦 Cek Stok" subtitle="List semua kontrak AKTIF di gudang">
      <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filterKat} onChange={e => setFilterKat(e.target.value)} style={{ padding: '7px 12px', fontSize: 12, width: 160 }}>
            <option value="">Semua Kategori</option>
            {KATEGORI_ALL.filter(Boolean).map(k => <option key={k} value={k}>{k}</option>)}
          </select>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari nama / barcode / barang..."
            style={{ width: 280, padding: '7px 12px', fontSize: 12 }} />
          <button className="btn btn-outline btn-sm" onClick={loadData}>↻ Refresh</button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div className="stat-card blue" style={{ flex: 1, minWidth: 130 }}>
            <div className="s-lbl">Total Kontrak</div>
            <div className="s-val">{loading ? '—' : filtered.length}</div>
          </div>
          <div className="stat-card gold" style={{ flex: 1, minWidth: 130 }}>
            <div className="s-lbl">Total Taksiran</div>
            <div className="s-val">{loading ? '—' : formatRp(totalTaksiran)}</div>
          </div>
          <div className="stat-card green" style={{ flex: 1, minWidth: 130 }}>
            <div className="s-lbl">Total Pinjaman</div>
            <div className="s-val">{loading ? '—' : formatRp(totalPinjaman)}</div>
          </div>
        </div>

        {/* Table */}
        <div className="tbl-wrap" style={{ flex: 1, overflow: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 28 }}>No</th>
                <th>Barcode</th><th>No Faktur</th><th>Nama</th>
                <th>Kategori</th><th>Barang</th><th>Rak</th>
                <th className="num">Taksiran</th><th className="num">Pinjaman</th>
                <th>Tgl Gadai</th><th>JT</th><th>Outlet</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="empty-state">⏳ Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={12} className="empty-state">Tidak ada data</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ fontSize: 11, color: 'var(--text3)' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{r.barcode_a || '—'}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_faktur}</td>
                  <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nama}</td>
                  <td>{r.kategori}</td>
                  <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.barang}</td>
                  <td style={{ fontWeight: 700 }}>{r.rak || '—'}</td>
                  <td className="num">{formatRp(r.taksiran)}</td>
                  <td className="num">{formatRp(r.jumlah_gadai)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl_gadai)}</td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl_jt)}</td>
                  <td style={{ fontSize: 11 }}>{r.outlet}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
