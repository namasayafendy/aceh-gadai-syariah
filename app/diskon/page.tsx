'use client';

// ============================================================
// ACEH GADAI SYARIAH - Riwayat Diskon (Fase 3)
// File: app/diskon/page.tsx
//
// Riwayat request & approval diskon ≥ Rp 10.000 via Telegram.
// Filter: outlet (Owner), status, rentang tanggal.
// Owner cross-outlet; non-Owner ter-scope ke outlet sendiri.
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useAuth, useOutletId } from '@/components/auth/AuthProvider';
import { formatRp } from '@/lib/format';

interface Row {
  id_diskon: string;
  tgl: string;
  no_faktur: string | null;
  id_tebus: string | null;
  nama_nasabah: string | null;
  jumlah_pinjaman: number | null;
  ujrah_berjalan: number | null;
  lama_titip: number | null;
  total_seharusnya: number | null;
  besaran_potongan: number | null;
  total_setelah_diskon: number | null;
  alasan: string | null;
  status_tebus: string | null;
  kasir: string | null;
  outlet: string | null;
  outlet_id: number | null;
  // Fase 3 columns
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DONE' | 'CANCELLED' | null;
  id_parent: string | null;
  lama_gadai_hari: number | null;
  requested_by_nama: string | null;
  requested_at: string | null;
  approver_username: string | null;
  approved_at: string | null;
  rejected_by_username: string | null;
  rejected_at: string | null;
  alasan_reject: string | null;
  finalized_at: string | null;
  // legacy
  approved: string | null;
}

interface OutletOption { id: number; nama: string }

const STATUS_OPTIONS = ['ALL', 'PENDING', 'APPROVED', 'DONE', 'REJECTED', 'CANCELLED'] as const;

const statusStyle: Record<string, { bg: string; fg: string; label: string }> = {
  PENDING:   { bg: 'var(--yellow-dim)', fg: 'var(--yellow)', label: '⏳ Pending' },
  APPROVED:  { bg: 'var(--accent-dim, rgba(59,130,246,0.15))', fg: 'var(--accent, #3b82f6)', label: '✅ Approved' },
  DONE:      { bg: 'var(--green-dim)', fg: 'var(--green)', label: '💾 Done' },
  REJECTED:  { bg: 'var(--red-dim, rgba(239,68,68,0.15))', fg: 'var(--red)', label: '❌ Rejected' },
  CANCELLED: { bg: 'rgba(107,114,128,0.15)', fg: '#6b7280', label: '⊘ Cancelled' },
};

function todayIso() { return new Date().toISOString().slice(0, 10); }
function firstOfMonthIso() {
  const d = new Date(); d.setDate(1);
  return d.toISOString().slice(0, 10);
}

export default function DiskonRiwayatPage() {
  const { user } = useAuth();
  const outletId = useOutletId();
  const isOwner = user?.role === 'OWNER';

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [filterOutlet, setFilterOutlet] = useState<string>('CURRENT');
  const [filterStatus, setFilterStatus] = useState<typeof STATUS_OPTIONS[number]>('ALL');
  const [from, setFrom] = useState(firstOfMonthIso());
  const [to, setTo] = useState(todayIso());
  const [err, setErr] = useState('');

  // Owner: load outlet list untuk dropdown
  useEffect(() => {
    if (!isOwner) return;
    (async () => {
      try {
        const r = await fetch('/api/outlet').then(x => x.json());
        if (r.ok) setOutlets(r.rows.map((x: any) => ({ id: x.id, nama: x.nama })));
      } catch { /* silent */ }
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
      if (to)   params.set('to', to);
      params.set('limit', '500');

      const r = await fetch('/api/diskon/list?' + params.toString()).then(x => x.json());
      if (!r.ok) { setErr(r.msg || 'Gagal load'); setRows([]); }
      else setRows(r.rows || []);
    } catch (e) {
      setErr('Network error: ' + String(e));
    } finally { setLoading(false); }
  }, [filterOutlet, filterStatus, from, to, outletId]);

  useEffect(() => { load(); }, [load]);

  const outletNama = (id: number | null) =>
    id ? (outlets.find(o => o.id === id)?.nama ?? `#${id}`) : '—';

  // ── Totals summary ────────────────────────────────────
  const totalRequests = rows.length;
  const totalApproved = rows.filter(r => r.status === 'APPROVED' || r.status === 'DONE').length;
  const totalRejected = rows.filter(r => r.status === 'REJECTED').length;
  const totalPending  = rows.filter(r => r.status === 'PENDING').length;
  const totalDiskonNominal = rows
    .filter(r => r.status === 'DONE' || r.status === 'APPROVED')
    .reduce((sum, r) => sum + Number(r.besaran_potongan || 0), 0);

  return (
    <AppShell title="💸 Riwayat Diskon" subtitle="Request & approval diskon ≥ Rp 10.000 via Telegram">
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

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 8, marginBottom: 12 }}>
          <SumCard label="Total Request" val={String(totalRequests)} color="var(--text1)" />
          <SumCard label="Pending" val={String(totalPending)} color="var(--yellow)" />
          <SumCard label="Approved/Done" val={String(totalApproved)} color="var(--green)" />
          <SumCard label="Rejected" val={String(totalRejected)} color="var(--red)" />
          <SumCard label="Nilai Diskon (Approved)" val={formatRp(totalDiskonNominal)} color="var(--accent)" />
        </div>

        {err && <div className="alert-error" style={{ marginBottom: 10 }}>⚠️ {err}</div>}

        <div className="tbl-wrap">
          <table>
            <thead><tr>
              <th>ID Diskon</th>
              <th>Tgl</th>
              {isOwner && <th>Outlet</th>}
              <th>Jenis</th>
              <th>No Faktur</th>
              <th>Nasabah</th>
              <th className="num">Pinjaman</th>
              <th className="num">Total Sistem</th>
              <th className="num">Bayar</th>
              <th className="num">Diskon</th>
              <th>Alasan</th>
              <th>Status</th>
              <th>Owner/Kasir</th>
              <th>Resubmit</th>
            </tr></thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={isOwner ? 14 : 13} className="empty-state">
                  {loading ? '⏳ Memuat...' : 'Belum ada request diskon di rentang ini.'}
                </td></tr>
              ) : rows.map(r => {
                // Legacy rows bisa status=null → fallback ke 'DONE' (pre-Fase-3)
                const st = statusStyle[r.status ?? 'DONE'] ?? statusStyle.DONE;
                return (
                  <tr key={r.id_diskon}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.id_diskon}</td>
                    <td style={{ fontSize: 11 }}>{r.tgl ? new Date(r.tgl).toLocaleString('id-ID') : '—'}</td>
                    {isOwner && <td style={{ fontSize: 11 }}>{r.outlet ?? outletNama(r.outlet_id)}</td>}
                    <td style={{ fontSize: 11 }}>
                      <span className="badge">{r.status_tebus ?? '—'}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_faktur ?? '—'}</td>
                    <td style={{ fontSize: 11 }}>{r.nama_nasabah ?? '—'}</td>
                    <td className="num">{formatRp(Number(r.jumlah_pinjaman ?? 0))}</td>
                    <td className="num">{formatRp(Number(r.total_seharusnya ?? 0))}</td>
                    <td className="num">{formatRp(Number(r.total_setelah_diskon ?? 0))}</td>
                    <td className="num" style={{ color: 'var(--red)', fontWeight: 600 }}>
                      {formatRp(Number(r.besaran_potongan ?? 0))}
                    </td>
                    <td style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.alasan ?? ''}>
                      {r.alasan ?? '—'}
                      {r.status === 'REJECTED' && r.alasan_reject && (
                        <div style={{ fontSize: 10, color: 'var(--red)', marginTop: 2 }} title={r.alasan_reject}>
                          Tolak: {r.alasan_reject.length > 40 ? r.alasan_reject.slice(0, 40) + '…' : r.alasan_reject}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className="badge" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
                    </td>
                    <td style={{ fontSize: 11 }}>
                      {r.approver_username && <div>✅ @{r.approver_username}</div>}
                      {r.rejected_by_username && <div>❌ @{r.rejected_by_username}</div>}
                      {r.kasir && <div style={{ color: 'var(--text3)' }}>Kasir: {r.kasir}</div>}
                      {!r.approver_username && !r.rejected_by_username && !r.kasir && '—'}
                    </td>
                    <td style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
                      {r.id_parent ? <span title="Request pengganti dari yang di-reject">↰ {r.id_parent}</span> : '—'}
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

function SumCard({ label, val, color }: { label: string; val: string; color: string }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color, fontFamily: 'var(--mono)', marginTop: 2 }}>
        {val}
      </div>
    </div>
  );
}
