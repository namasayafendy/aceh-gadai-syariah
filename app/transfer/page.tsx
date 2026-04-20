'use client';

// ============================================================
// ACEH GADAI SYARIAH - Transfer Approval List (Fase 2)
// File: app/transfer/page.tsx
//
// Riwayat permintaan transfer (GADAI/TAMBAH/SJB) dan statusnya
// (PENDING/APPROVED/REJECTED/DONE). Owner bisa pilih outlet,
// non-Owner otomatis ter-scope ke outlet-nya.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useAuth, useOutletId } from '@/components/auth/AuthProvider';
import { formatRp } from '@/lib/format';

interface Row {
  id: number;
  outlet_id: number;
  tipe: 'GADAI' | 'TAMBAH' | 'SJB';
  ref_no_faktur: string | null;
  nominal: number;
  nama_penerima: string;
  no_rek: string;
  bank: string;
  catatan: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DONE';
  requested_by_nama: string;
  requested_at: string;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  approved_by_username: string | null;
  approved_at: string | null;
  rejected_by_username: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  bukti_storage_path: string | null;
  bukti_uploaded_at: string | null;
  bukti_uploaded_by_username: string | null;
}

interface OutletOption { id: number; nama: string }

const STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'DONE', 'REJECTED'] as const;

const statusStyle: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING:  { bg: 'var(--yellow-dim)', fg: 'var(--yellow)', label: '⏳ Pending' },
  APPROVED: { bg: 'var(--accent-dim, rgba(59,130,246,0.15))', fg: 'var(--accent, #3b82f6)', label: '✅ Approved' },
  DONE:     { bg: 'var(--green-dim)', fg: 'var(--green)', label: '📸 Done' },
  REJECTED: { bg: 'var(--red-dim, rgba(239,68,68,0.15))', fg: 'var(--red)', label: '❌ Rejected' },
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthIso() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function TransferApprovalPage() {
  const { user } = useAuth();
  const outletId = useOutletId();
  const isOwner = user?.role === 'OWNER';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [filterOutlet, setFilterOutlet] = useState<string>('CURRENT'); // 'CURRENT' | 'ALL' | '<id>'
  const [filterStatus, setFilterStatus] = useState<typeof STATUS_OPTIONS[number]>('ALL');
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [err, setErr] = useState('');

  // Owner: load outlet list
  useEffect(() => {
    if (!isOwner) return;
    (async () => {
      try {
        const r = await fetch('/api/outlet').then(x => x.json());
        if (r.ok) setOutlets(r.rows.map((x: any) => ({ id: x.id, nama: x.nama })));
      } catch {}
    })();
  }, [isOwner]);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const params = new URLSearchParams();
      if (filterOutlet === 'CURRENT') {
        if (outletId) params.set('outletId', String(outletId));
      } else if (filterOutlet === 'ALL') {
        params.set('outletId', 'ALL');
      } else {
        params.set('outletId', filterOutlet);
      }
      if (filterStatus !== 'ALL') params.set('status', filterStatus);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('limit', '300');

      const r = await fetch('/api/transfer/list?' + params.toString()).then(x => x.json());
      if (!r.ok) { setErr(r.msg || 'Gagal load'); setRows([]); }
      else setRows(r.rows || []);
    } catch (e) {
      setErr('Network error: ' + String(e));
    } finally { setLoading(false); }
  }, [filterOutlet, filterStatus, from, to, outletId]);

  useEffect(() => { load(); }, [load]);

  const outletNama = (id: number) =>
    outlets.find(o => o.id === id)?.nama ?? `#${id}`;

  const viewBukti = async (id: number) => {
    try {
      const r = await fetch(`/api/transfer/bukti-url?id=${id}`).then(x => x.json());
      if (!r.ok) return alert('Gagal: ' + r.msg);
      window.open(r.url, '_blank');
    } catch (e) { alert('Error: ' + String(e)); }
  };

  return (
    <AppShell title="🏦 Transfer Approval" subtitle="Riwayat & status permintaan transfer per outlet">
      <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
        {/* Filter bar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12, padding: 10, background: 'var(--surface2)', borderRadius: 6 }}>
          {isOwner && (
            <div>
              <label style={{ fontSize: 10, display: 'block' }}>Outlet</label>
              <select value={filterOutlet} onChange={e => setFilterOutlet(e.target.value)}
                style={{ fontSize: 12, padding: '6px 10px' }}>
                <option value="CURRENT">Outlet Aktif ({outletNama(outletId)})</option>
                <option value="ALL">Semua Outlet</option>
                {outlets.map(o => <option key={o.id} value={String(o.id)}>{o.nama}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={{ fontSize: 10, display: 'block' }}>Status</label>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as any)}
              style={{ fontSize: 12, padding: '6px 10px' }}>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, display: 'block' }}>Dari</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)}
              style={{ fontSize: 12, padding: '6px 10px' }} />
          </div>
          <div>
            <label style={{ fontSize: 10, display: 'block' }}>Sampai</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)}
              style={{ fontSize: 12, padding: '6px 10px' }} />
          </div>
          <button className="btn btn-primary btn-sm" onClick={load} disabled={loading}>
            {loading ? '⏳' : '🔄 Refresh'}
          </button>
        </div>

        {err && <div className="alert-error" style={{ marginBottom: 10 }}>⚠️ {err}</div>}

        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>ID</th>
              <th>Tgl</th>
              {isOwner && <th>Outlet</th>}
              <th>Tipe</th>
              <th>No Faktur</th>
              <th>Nominal</th>
              <th>Penerima</th>
              <th>Bank / No Rek</th>
              <th>Status</th>
              <th>Approver</th>
              <th>Kasir</th>
              <th>Aksi</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={isOwner ? 12 : 11} className="empty-state">
                  {loading ? '⏳ Memuat...' : 'Belum ada transfer request di rentang ini.'}
                </td></tr>
              ) : rows.map(r => {
                const st = statusStyle[r.status];
                return (
                  <tr key={r.id}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>TRF-{r.id}</td>
                    <td style={{ fontSize: 11 }}>{new Date(r.requested_at).toLocaleString('id-ID')}</td>
                    {isOwner && <td style={{ fontSize: 11 }}>{outletNama(r.outlet_id)}</td>}
                    <td><span className="badge">{r.tipe}</span></td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.ref_no_faktur ?? '—'}</td>
                    <td className="num">{formatRp(Number(r.nominal))}</td>
                    <td>{r.nama_penerima}</td>
                    <td style={{ fontSize: 11 }}>
                      <div>{r.bank}</div>
                      <div style={{ fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{r.no_rek}</div>
                    </td>
                    <td>
                      <span className="badge" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                      {r.status === 'APPROVED' && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                          Menunggu bukti
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {r.approved_by_username && <div>✅ @{r.approved_by_username}</div>}
                      {r.rejected_by_username && <div>❌ @{r.rejected_by_username}</div>}
                      {r.bukti_uploaded_by_username && <div>📸 @{r.bukti_uploaded_by_username}</div>}
                      {!r.approved_by_username && !r.rejected_by_username && '—'}
                    </td>
                    <td style={{ fontSize: 11 }}>{r.requested_by_nama}</td>
                    <td>
                      {r.bukti_storage_path
                        ? <button className="btn btn-outline btn-sm" onClick={() => viewBukti(r.id)}>📎 Bukti</button>
                        : <span style={{ color: 'var(--text3)', fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
