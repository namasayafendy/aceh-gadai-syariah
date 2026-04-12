'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Jatuh Tempo
// File: app/jatuhtempo/page.tsx
// List kontrak AKTIF: LEWAT WAKTU → JATUH TEMPO → BERJALAN
// API: GET /api/gadai/jatuh-tempo?outletId=X
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';
import Link from 'next/link';

type JTStatus = 'LEWAT WAKTU' | 'JATUH TEMPO' | 'BERJALAN';

interface JTRow {
  id: string; no_faktur: string; nama: string; telp1: string;
  kategori: string; barang: string; taksiran: number; jumlah_gadai: number;
  tgl_gadai: string; tgl_jt: string; outlet: string; barcode_a: string;
  _source: string; // GADAI or SJB
  _jtStatus: JTStatus; _sisaHari: number; _lamaHari: number;
}

function calcJTStatus(tglJt: string): { status: JTStatus; sisa: number } {
  const jt = new Date(tglJt);
  const now = new Date();
  now.setHours(0, 0, 0, 0); jt.setHours(0, 0, 0, 0);
  const sisa = Math.floor((jt.getTime() - now.getTime()) / 86400000);
  if (sisa < 0) return { status: 'LEWAT WAKTU', sisa };
  if (sisa <= 3) return { status: 'JATUH TEMPO', sisa };
  return { status: 'BERJALAN', sisa };
}

export default function JatuhTempoPage() {
  const outletId = useOutletId();
  const [rows, setRows] = useState<JTRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | JTStatus>('ALL');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gadai/jatuh-tempo?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok && json.rows) {
        const mapped: JTRow[] = json.rows.map((r: any) => {
          const { status, sisa } = calcJTStatus(r.tgl_jt);
          const tgl1 = new Date(r.tgl_gadai);
          const now = new Date();
          const lama = Math.max(1, Math.floor((now.getTime() - tgl1.getTime()) / 86400000));
          return { ...r, _jtStatus: status, _sisaHari: sisa, _lamaHari: lama };
        });
        // Sort: LEWAT WAKTU first (most overdue), then JATUH TEMPO, then BERJALAN
        mapped.sort((a, b) => a._sisaHari - b._sisaHari);
        setRows(mapped);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [outletId]);

  useEffect(() => { loadData(); }, [loadData]);

  // Stats
  const cntLewat = rows.filter(r => r._jtStatus === 'LEWAT WAKTU').length;
  const cntJT = rows.filter(r => r._jtStatus === 'JATUH TEMPO').length;
  const cntBerjalan = rows.filter(r => r._jtStatus === 'BERJALAN').length;

  // Filtered rows
  const filtered = rows.filter(r => {
    if (filter !== 'ALL' && r._jtStatus !== filter) return false;
    if (search) {
      const s = search.toLowerCase();
      return r.no_faktur.toLowerCase().includes(s) || r.nama.toLowerCase().includes(s) || r.barang.toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <AppShell title="⏰ Jatuh Tempo" subtitle="Kontrak AKTIF diurutkan berdasarkan urgensi">
      <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="🔍 Cari nama / no faktur / barang..."
            style={{ width: 280, padding: '7px 12px', fontSize: 12 }} />
          <button className="btn btn-outline btn-sm" onClick={loadData}>↻ Refresh</button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--red)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Lewat Waktu</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)' }}>{loading ? '—' : cntLewat}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--warn)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Jatuh Tempo ≤3 hr</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--warn)' }}>{loading ? '—' : cntJT}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--green)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Berjalan</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{loading ? '—' : cntBerjalan}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Aktif</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)' }}>{loading ? '—' : rows.length}</div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { val: 'ALL', label: 'Semua', cls: '' },
            { val: 'LEWAT WAKTU', label: '⚠ Lewat Waktu', cls: 'p-red' },
            { val: 'JATUH TEMPO', label: '🔔 Jatuh Tempo', cls: 'p-warn' },
            { val: 'BERJALAN', label: '✓ Berjalan', cls: 'p-green' },
          ].map(p => (
            <button key={p.val} onClick={() => setFilter(p.val as any)}
              style={{
                padding: '4px 13px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${filter === p.val ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === p.val ? (p.val === 'LEWAT WAKTU' ? 'var(--red)' : p.val === 'JATUH TEMPO' ? 'var(--warn)' : p.val === 'BERJALAN' ? 'var(--green)' : 'var(--accent)') : 'transparent',
                color: filter === p.val ? (p.val === 'JATUH TEMPO' || p.val === 'BERJALAN' ? '#000' : '#fff') : 'var(--text2)',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* Info bar */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '7px 14px', fontSize: 11, color: 'var(--text2)', display: 'flex', justifyContent: 'space-between' }}>
          <span>{filtered.length} kontrak ditampilkan</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>

        {/* Table */}
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>No</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>No Faktur</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Nama</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Barang</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Pinjaman</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Tgl JT</th>
                <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Sisa/Lewat</th>
                <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>⏳ Memuat...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Tidak ada data</td></tr>
              ) : filtered.map((r, i) => (
                <tr key={r.id} style={{
                  borderBottom: '1px solid rgba(46,51,73,.5)',
                  background: r._jtStatus === 'LEWAT WAKTU' ? 'rgba(239,68,68,.04)' : r._jtStatus === 'JATUH TEMPO' ? 'rgba(245,158,11,.03)' : 'transparent',
                }}>
                  <td style={{ padding: '8px 10px', fontSize: 11, color: 'var(--text3)' }}>{i + 1}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 11 }}>
                    <Link href={`/tebus?barcode=${r.barcode_a || r.no_faktur}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                      {r.no_faktur}
                    </Link>
                  </td>
                  <td style={{ padding: '8px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nama}</td>
                  <td style={{ padding: '8px 10px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.barang}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatRp(r.jumlah_gadai || r.harga_jual)}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl_jt)}</td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, color: r._jtStatus === 'LEWAT WAKTU' ? 'var(--red)' : r._jtStatus === 'JATUH TEMPO' ? 'var(--warn)' : 'var(--green)' }}>
                    {r._sisaHari < 0 ? `${Math.abs(r._sisaHari)} hr lewat` : r._sisaHari === 0 ? 'HARI INI' : `${r._sisaHari} hari`}
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{
                      display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                      background: r._jtStatus === 'LEWAT WAKTU' ? 'rgba(239,68,68,.15)' : r._jtStatus === 'JATUH TEMPO' ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,.12)',
                      color: r._jtStatus === 'LEWAT WAKTU' ? 'var(--red)' : r._jtStatus === 'JATUH TEMPO' ? 'var(--warn)' : 'var(--green)',
                    }}>{r._jtStatus}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
