'use client';

// ============================================================
// File: app/audit-log/page.tsx
//
// OWNER-only audit log viewer.
// Filter + tabel + detail modal + export CSV.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useAuth } from '@/components/auth/AuthProvider';

interface AuditRow {
  id: number;
  tgl: string;
  user_nama: string | null;
  tabel: string | null;
  record_id: string | null;
  aksi: string | null;
  field: string | null;
  nilai_lama: string | null;
  nilai_baru: string | null;
  outlet: string | null;
  catatan: string | null;
}

interface FilterOpts {
  outlets: string[];
  tabels: string[];
  aksi: string[];
}

const PAGE_SIZE = 100;

export default function AuditLogPage() {
  const { isOwner } = useAuth();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterOpts, setFilterOpts] = useState<FilterOpts>({ outlets: [], tabels: [], aksi: [] });
  const [selected, setSelected] = useState<AuditRow | null>(null);

  // Filter state
  const today = new Date().toISOString().slice(0, 10);
  const thirtyAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [dateFrom, setDateFrom] = useState(thirtyAgo);
  const [dateTo, setDateTo] = useState(today);
  const [fltOutlet, setFltOutlet] = useState('');
  const [fltUser, setFltUser] = useState('');
  const [fltTabel, setFltTabel] = useState('');
  const [fltAksi, setFltAksi] = useState('');
  const [fltSearch, setFltSearch] = useState('');

  const buildParams = useCallback(
    (overrides: Record<string, string> = {}) => {
      const p = new URLSearchParams();
      if (dateFrom) p.set('dateFrom', dateFrom);
      if (dateTo) p.set('dateTo', dateTo);
      if (fltOutlet) p.set('outlet', fltOutlet);
      if (fltUser) p.set('user', fltUser);
      if (fltTabel) p.set('tabel', fltTabel);
      if (fltAksi) p.set('aksi', fltAksi);
      if (fltSearch) p.set('search', fltSearch);
      for (const [k, v] of Object.entries(overrides)) p.set(k, v);
      return p;
    },
    [dateFrom, dateTo, fltOutlet, fltUser, fltTabel, fltAksi, fltSearch],
  );

  const load = useCallback(
    async (pageNum: number) => {
      setLoading(true);
      setError('');
      try {
        const p = buildParams({ page: String(pageNum), limit: String(PAGE_SIZE) });
        const res = await fetch('/api/audit-log?' + p.toString());
        const json = await res.json();
        if (!json.ok) {
          setError(json.msg || 'Gagal load');
          setRows([]);
          setTotal(0);
        } else {
          setRows(json.rows || []);
          setTotal(json.total || 0);
          if (json.filterOptions) setFilterOpts(json.filterOptions);
        }
      } catch (e) {
        setError('Error: ' + (e as Error).message);
      }
      setLoading(false);
    },
    [buildParams],
  );

  useEffect(() => { load(1); setPage(1); /* eslint-disable-line */ }, [dateFrom, dateTo, fltOutlet, fltUser, fltTabel, fltAksi, fltSearch]);

  function exportCsv() {
    const p = buildParams({ export: 'csv' });
    const url = '/api/audit-log?' + p.toString();
    window.open(url, '_blank');
  }

  function resetFilter() {
    setDateFrom(thirtyAgo); setDateTo(today);
    setFltOutlet(''); setFltUser(''); setFltTabel(''); setFltAksi(''); setFltSearch('');
  }

  if (!isOwner) {
    return (
      <AppShell title="📋 Audit Log" subtitle="">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
          ⛔ Hanya OWNER yang boleh akses halaman ini
        </div>
      </AppShell>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AppShell title="📋 Audit Log" subtitle="Riwayat aksi user di sistem (OWNER only)">
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflow: 'hidden' }}>
        {/* Filter bar */}
        <div style={{ background: 'var(--surface)', borderRadius: 8, padding: 12, border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr) auto', gap: 8, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text3)' }}>Dari</label>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text3)' }}>Sampai</label>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text3)' }}>Outlet</label>
              <select value={fltOutlet} onChange={e => setFltOutlet(e.target.value)} style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}>
                <option value="">Semua</option>
                {filterOpts.outlets.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text3)' }}>User</label>
              <input type="text" value={fltUser} onChange={e => setFltUser(e.target.value)} placeholder="cari nama" style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text3)' }}>Tabel</label>
              <select value={fltTabel} onChange={e => setFltTabel(e.target.value)} style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}>
                <option value="">Semua</option>
                {filterOpts.tabels.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text3)' }}>Aksi</label>
              <select value={fltAksi} onChange={e => setFltAksi(e.target.value)} style={{ width: '100%', fontSize: 11, padding: '4px 6px' }}>
                <option value="">Semua</option>
                {filterOpts.aksi.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 10, color: 'var(--text3)' }}>Search</label>
              <input type="text" value={fltSearch} onChange={e => setFltSearch(e.target.value)} placeholder="ID/catatan/value" style={{ width: '100%', fontSize: 11, padding: '4px 6px' }} />
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="btn btn-outline btn-sm" onClick={resetFilter} title="Reset filter">↺</button>
              <button className="btn btn-primary btn-sm" onClick={exportCsv} title="Export CSV">📥 CSV</button>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', gap: 16, alignItems: 'center' }}>
          <span>Total ditemukan: <b style={{ color: 'var(--text)' }}>{total.toLocaleString('id-ID')}</b></span>
          <span>Halaman {page} / {totalPages}</span>
        </div>

        {error && <div className="alert-error">{error}</div>}

        {/* Tabel */}
        <div style={{ flex: 1, overflowY: 'auto', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>⏳ Loading...</div>
          ) : rows.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>Tidak ada record</div>
          ) : (
            <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
              <thead style={{ background: 'var(--surface2)', position: 'sticky', top: 0 }}>
                <tr>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Tanggal/Jam</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Outlet</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>User</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Aksi</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Tabel</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Record</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid var(--border)' }}>Field</th>
                  <th style={{ padding: '8px 10px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>{formatDateTime(r.tgl)}</td>
                    <td style={{ padding: '6px 10px' }}>{r.outlet || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>{r.user_nama || '—'}</td>
                    <td style={{ padding: '6px 10px' }}><AksiBadge aksi={r.aksi} /></td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 10 }}>{r.tabel || '—'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 10, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.record_id || '—'}</td>
                    <td style={{ padding: '6px 10px', fontFamily: 'var(--mono)', fontSize: 10 }}>{r.field || '—'}</td>
                    <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                      <button className="btn btn-outline btn-sm" onClick={() => setSelected(r)} style={{ fontSize: 10, padding: '2px 8px' }}>🔍</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
          <div style={{ color: 'var(--text3)' }}>{rows.length > 0 ? `Tampil ${(page - 1) * PAGE_SIZE + 1}-${Math.min(page * PAGE_SIZE, total)} dari ${total.toLocaleString('id-ID')}` : ''}</div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-outline btn-sm" disabled={page <= 1 || loading} onClick={() => { setPage(p => p - 1); load(page - 1); }}>← Prev</button>
            <button className="btn btn-outline btn-sm" disabled={page >= totalPages || loading} onClick={() => { setPage(p => p + 1); load(page + 1); }}>Next →</button>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} />}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────
function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Jakarta',
  });
}

function AksiBadge({ aksi }: { aksi: string | null }) {
  if (!aksi) return <span>—</span>;
  const colorMap: Record<string, string> = {
    INSERT: 'var(--green)',
    EDIT: 'var(--accent)',
    DELETE: 'var(--red)',
    BACKUP: 'var(--text3)',
    CRON_SEND: 'var(--text3)',
    KAS_UPDATE: 'var(--yellow)',
    JUAL: 'var(--red)',
    SERAH_TERIMA: 'var(--accent)',
  };
  const color = colorMap[aksi] || 'var(--text2)';
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, background: `${color}22`, color, fontFamily: 'var(--mono)' }}>
      {aksi}
    </span>
  );
}

function DetailModal({ row, onClose }: { row: AuditRow; onClose: () => void }) {
  return (
    <div className="success-overlay" onClick={onClose}>
      <div className="success-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 900, width: '90%' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>Detail Audit Log #{row.id}</h3>

        <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 12px', fontSize: 12, marginBottom: 16 }}>
          <span style={{ color: 'var(--text3)' }}>Tanggal</span><span style={{ fontFamily: 'var(--mono)' }}>{formatDateTime(row.tgl)}</span>
          <span style={{ color: 'var(--text3)' }}>User</span><span>{row.user_nama || '—'}</span>
          <span style={{ color: 'var(--text3)' }}>Outlet</span><span>{row.outlet || '—'}</span>
          <span style={{ color: 'var(--text3)' }}>Aksi</span><span><AksiBadge aksi={row.aksi} /></span>
          <span style={{ color: 'var(--text3)' }}>Tabel</span><span style={{ fontFamily: 'var(--mono)' }}>{row.tabel || '—'}</span>
          <span style={{ color: 'var(--text3)' }}>Record ID</span><span style={{ fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{row.record_id || '—'}</span>
          <span style={{ color: 'var(--text3)' }}>Field</span><span style={{ fontFamily: 'var(--mono)' }}>{row.field || '—'}</span>
          {row.catatan && <><span style={{ color: 'var(--text3)' }}>Catatan</span><span>{row.catatan}</span></>}
        </div>

        {/* Side-by-side diff kalau ada nilai_lama */}
        {(row.nilai_lama || row.nilai_baru) && (
          <div style={{ display: 'grid', gridTemplateColumns: row.nilai_lama ? '1fr 1fr' : '1fr', gap: 12 }}>
            {row.nilai_lama && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--red)' }}>NILAI LAMA</div>
                <pre style={{ fontSize: 10, background: 'var(--surface2)', padding: 10, borderRadius: 6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: 'var(--mono)' }}>
                  {tryPrettyJson(row.nilai_lama)}
                </pre>
              </div>
            )}
            {row.nilai_baru && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 4, color: 'var(--green)' }}>NILAI BARU</div>
                <pre style={{ fontSize: 10, background: 'var(--surface2)', padding: 10, borderRadius: 6, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: 'var(--mono)' }}>
                  {tryPrettyJson(row.nilai_baru)}
                </pre>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 16, textAlign: 'right' }}>
          <button className="btn btn-outline" onClick={onClose}>Tutup</button>
        </div>
      </div>
    </div>
  );
}

function tryPrettyJson(s: string): string {
  try {
    const obj = JSON.parse(s);
    return JSON.stringify(obj, null, 2);
  } catch {
    return s;
  }
}
