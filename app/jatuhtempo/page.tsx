'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Jatuh Tempo
// File: app/jatuhtempo/page.tsx
// List kontrak AKTIF: LEWAT WAKTU → JATUH TEMPO → BERJALAN
// Gadai diatas, SJB dibawah, sort by lama gadai (desc)
// Kolom: tgl sita, total bayar sistem, no hp, lama gadai
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';
import Link from 'next/link';

type JTStatus = 'LEWAT WAKTU' | 'JATUH TEMPO' | 'BERJALAN';

interface JTRow {
  id: string; no_faktur: string; nama: string; telp1: string; telp2: string;
  kategori: string; barang: string; taksiran: number; jumlah_gadai: number;
  ujrah_nominal: number; ujrah_persen: number;
  tgl_gadai: string; tgl_jt: string; tgl_sita: string;
  outlet: string; barcode_a: string;
  _source: string;
  // SJB specific
  harga_jual?: number; harga_buyback?: number; lama_titip?: number;
  // Computed
  _jtStatus: JTStatus; _sisaHari: number; _lamaHari: number;
  _totalBayar: number;
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

// Hitung ujrah berjalan — cermin tebus/page.tsx
function hitungUjrah(r: any, lamaHari: number): number {
  const taksiran = Number(r.taksiran || 0);
  const jmlGadai = Number(r.jumlah_gadai || 0);
  const ujrahSheet = Number(r.ujrah_nominal || 0);
  const kat = String(r.kategori || '').toUpperCase();
  const emasFlag = ['EMAS', 'EMAS PAUN'].includes(kat);

  if (ujrahSheet > 0) {
    if (emasFlag) {
      return Math.ceil((ujrahSheet / 30) * lamaHari / 1000) * 1000;
    } else {
      const hDihitung = Math.ceil(lamaHari / 5) * 5;
      const per5 = Math.round(ujrahSheet / 6);
      return Math.ceil(per5 * (hDihitung / 5) / 1000) * 1000;
    }
  } else {
    if (emasFlag) {
      return Math.round((2.8 / 100 / 30) * taksiran * lamaHari);
    } else {
      const persen = jmlGadai <= 3000000 ? 8 : 7;
      const hDihitung = Math.ceil(lamaHari / 5) * 5;
      return Math.round((persen / 100 / 30) * 5 * taksiran * (hDihitung / 5));
    }
  }
}

function mapRow(r: any): JTRow {
  const { status, sisa } = calcJTStatus(r.tgl_jt);
  const now = new Date();
  const tgl1 = new Date(r.tgl_gadai);
  const lama = Math.max(1, Math.floor((now.getTime() - tgl1.getTime()) / 86400000));

  let totalBayar: number;
  if (r._source === 'SJB') {
    totalBayar = Number(r.harga_buyback || r.harga_jual || 0);
  } else {
    const ujrah = hitungUjrah(r, lama);
    totalBayar = Math.ceil((Number(r.jumlah_gadai || 0) + ujrah) / 1000) * 1000;
  }

  return { ...r, _jtStatus: status, _sisaHari: sisa, _lamaHari: lama, _totalBayar: totalBayar };
}

export default function JatuhTempoPage() {
  const outletId = useOutletId();
  const [gadaiRows, setGadaiRows] = useState<JTRow[]>([]);
  const [sjbRows, setSjbRows] = useState<JTRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | JTStatus>('ALL');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gadai/jatuh-tempo?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) {
        const g = (json.gadai || []).map(mapRow);
        const s = (json.sjb || []).map(mapRow);
        // Sort by lama gadai descending (longest first)
        g.sort((a: JTRow, b: JTRow) => b._lamaHari - a._lamaHari);
        s.sort((a: JTRow, b: JTRow) => b._lamaHari - a._lamaHari);
        setGadaiRows(g);
        setSjbRows(s);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [outletId]);

  useEffect(() => { loadData(); }, [loadData]);

  const allRows = [...gadaiRows, ...sjbRows];
  const cntLewat = allRows.filter(r => r._jtStatus === 'LEWAT WAKTU').length;
  const cntJT = allRows.filter(r => r._jtStatus === 'JATUH TEMPO').length;
  const cntBerjalan = allRows.filter(r => r._jtStatus === 'BERJALAN').length;

  // Filter function
  function applyFilter(rows: JTRow[]): JTRow[] {
    return rows.filter(r => {
      if (filter !== 'ALL' && r._jtStatus !== filter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.no_faktur.toLowerCase().includes(s) || r.nama.toLowerCase().includes(s) || r.barang.toLowerCase().includes(s) || (r.telp1 || '').includes(s);
      }
      return true;
    });
  }

  const filteredGadai = applyFilter(gadaiRows);
  const filteredSjb = applyFilter(sjbRows);

  // Table header style
  const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const thR: React.CSSProperties = { ...th, textAlign: 'right' };

  function renderRow(r: JTRow, i: number) {
    const isSJB = r._source === 'SJB';
    return (
      <tr key={r.id} style={{
        borderBottom: '1px solid rgba(46,51,73,.5)',
        background: r._jtStatus === 'LEWAT WAKTU' ? 'rgba(239,68,68,.04)' : r._jtStatus === 'JATUH TEMPO' ? 'rgba(245,158,11,.03)' : 'transparent',
      }}>
        <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text3)' }}>{i + 1}</td>
        <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 11 }}>
          <Link href={`/tebus?barcode=${r.barcode_a || r.no_faktur}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            {r.no_faktur}
          </Link>
        </td>
        <td style={{ padding: '7px 10px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nama}</td>
        <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text2)' }}>
          {r.telp1 || '—'}
          {r.telp2 ? <span style={{ color: 'var(--text3)', fontSize: 10 }}><br />{r.telp2}</span> : null}
        </td>
        <td style={{ padding: '7px 10px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{r.barang}</td>
        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{formatRp(r.jumlah_gadai)}</td>
        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
          {formatRp(r._totalBayar)}
        </td>
        <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{r._lamaHari} hr</td>
        <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl_jt)}</td>
        <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{r.tgl_sita ? formatDate(r.tgl_sita) : '—'}</td>
        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, color: r._jtStatus === 'LEWAT WAKTU' ? 'var(--red)' : r._jtStatus === 'JATUH TEMPO' ? 'var(--warn)' : 'var(--green)' }}>
          {r._sisaHari < 0 ? `${Math.abs(r._sisaHari)} hr lewat` : r._sisaHari === 0 ? 'HARI INI' : `${r._sisaHari} hari`}
        </td>
        <td style={{ padding: '7px 10px' }}>
          <span style={{
            display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: r._jtStatus === 'LEWAT WAKTU' ? 'rgba(239,68,68,.15)' : r._jtStatus === 'JATUH TEMPO' ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,.12)',
            color: r._jtStatus === 'LEWAT WAKTU' ? 'var(--red)' : r._jtStatus === 'JATUH TEMPO' ? 'var(--warn)' : 'var(--green)',
          }}>{r._jtStatus}</span>
        </td>
      </tr>
    );
  }

  const tableHead = (
    <tr style={{ background: 'var(--surface2)' }}>
      <th style={th}>No</th>
      <th style={th}>No Faktur</th>
      <th style={th}>Nama</th>
      <th style={th}>No HP</th>
      <th style={th}>Barang</th>
      <th style={thR}>Pinjaman</th>
      <th style={thR}>Total Bayar</th>
      <th style={{ ...th, textAlign: 'center' }}>Lama</th>
      <th style={th}>Tgl JT</th>
      <th style={th}>Tgl Sita</th>
      <th style={thR}>Sisa/Lewat</th>
      <th style={th}>Status</th>
    </tr>
  );

  return (
    <AppShell title="Jatuh Tempo" subtitle="Kontrak AKTIF — urutkan berdasarkan lama gadai">
      <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / no faktur / barang / no hp..."
            style={{ width: 300, padding: '7px 12px', fontSize: 12 }} />
          <button className="btn btn-outline btn-sm" onClick={loadData}>Refresh</button>
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
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)' }}>{loading ? '—' : allRows.length}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Gadai: {gadaiRows.length} | SJB: {sjbRows.length}</div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { val: 'ALL', label: 'Semua' },
            { val: 'LEWAT WAKTU', label: 'Lewat Waktu' },
            { val: 'JATUH TEMPO', label: 'Jatuh Tempo' },
            { val: 'BERJALAN', label: 'Berjalan' },
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

        {/* ═══ GADAI SECTION ═══ */}
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>GADAI</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{filteredGadai.length} kontrak</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>{tableHead}</thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Memuat...</td></tr>
              ) : filteredGadai.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Tidak ada gadai aktif</td></tr>
              ) : filteredGadai.map((r, i) => renderRow(r, i))}
            </tbody>
          </table>
        </div>

        {/* ═══ SJB SECTION ═══ */}
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)' }}>JUAL TITIP (SJB)</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{filteredSjb.length} kontrak</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>{tableHead}</thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Memuat...</td></tr>
              ) : filteredSjb.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Tidak ada SJB aktif</td></tr>
              ) : filteredSjb.map((r, i) => renderRow(r, i))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
