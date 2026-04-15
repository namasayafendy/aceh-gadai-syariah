'use client';

// ============================================================
// ACEH GADAI SYARIAH - Owner Dashboard
// File: app/owner/page.tsx
// OWNER only — monitor semua outlet, manage karyawan, rak, outlet
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';
import { printGadai, printSJB } from '@/lib/print';

type OwnerTab = 'ringkasan' | 'karyawan' | 'akun-login' | 'rak' | 'outlet' | 'backup' | 'reprint';

const TABS: { id: OwnerTab; icon: string; label: string }[] = [
  { id: 'ringkasan', icon: '📊', label: 'Ringkasan' },
  { id: 'karyawan', icon: '👥', label: 'Karyawan' },
  { id: 'akun-login', icon: '🔐', label: 'Akun Login' },
  { id: 'rak', icon: '📦', label: 'Rak Gudang' },
  { id: 'outlet', icon: '🏢', label: 'Outlet' },
  { id: 'backup', icon: '💾', label: 'Backup Status' },
  { id: 'reprint', icon: '🖨️', label: 'Reprint Kontrak' },
];

export default function OwnerPage() {
  const { isOwner, isAdminOrOwner, user } = useAuth();
  const role = String(user?.role ?? '').toUpperCase();
  const isAdmin = role === 'ADMIN';
  const [tab, setTab] = useState<OwnerTab>(isAdmin ? 'reprint' : 'ringkasan');

  // PIN modal shared
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState('');
  const [pendingFn, setPendingFn] = useState<((pin: string) => void) | null>(null);

  function requestPin(action: string, fn: (pin: string) => void) {
    setPinAction(action); setPendingFn(() => fn); setPinOpen(true);
  }

  // Admin can only see Reprint tab; Owner sees all
  const visibleTabs = isAdmin
    ? TABS.filter(t => t.id === 'reprint')
    : TABS;

  if (!isAdminOrOwner) {
    return <AppShell title="👑 Owner Dashboard" subtitle=""><div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>⛔ Hanya untuk Admin/Owner</div></AppShell>;
  }

  return (
    <AppShell title="👑 Owner Dashboard" subtitle="Monitor & kelola semua outlet">
      <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
        {/* Sidebar tabs */}
        <div style={{ width: 200, minWidth: 200, background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, padding: '4px 12px 8px' }}>{isAdmin ? 'Admin Panel' : 'Owner Panel'}</div>
          {visibleTabs.map(t => (
            <div key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '9px 12px', borderRadius: 7, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8,
              color: tab === t.id ? 'var(--accent)' : 'var(--text2)', fontWeight: tab === t.id ? 600 : 400,
              background: tab === t.id ? 'rgba(59,130,246,.15)' : 'transparent',
            }}><span>{t.icon}</span> {t.label}</div>
          ))}
        </div>

        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {tab === 'ringkasan' && <RingkasanTab />}
          {tab === 'karyawan' && <KaryawanTab requestPin={requestPin} />}
          {tab === 'akun-login' && <AkunLoginTab requestPin={requestPin} />}
          {tab === 'rak' && <RakTab requestPin={requestPin} />}
          {tab === 'outlet' && <OutletTab requestPin={requestPin} />}
          {tab === 'backup' && <BackupTab />}
          {tab === 'reprint' && <ReprintTab />}
        </div>
      </div>

      <PinModal open={pinOpen} action={pinAction}
        onSuccess={(pin) => { setPinOpen(false); pendingFn?.(pin); }}
        onCancel={() => setPinOpen(false)} />
    </AppShell>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: RINGKASAN
// ═══════════════════════════════════════════════════════════
function RingkasanTab() {
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/owner?action=summary');
        const json = await res.json();
        if (json.ok) setSummary(json.summary || []);
      } catch {}
      setLoading(false);
    })();
  }, []);

  const totalGadaiAktif = summary.reduce((s, r) => s + r.gadaiAktif, 0);
  const totalGadai = summary.reduce((s, r) => s + r.gadaiTotal, 0);
  const totalTebus = summary.reduce((s, r) => s + r.tebusTotal, 0);
  const totalSjb = summary.reduce((s, r) => s + r.sjbAktif, 0);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>📊 Ringkasan Semua Outlet</div>

      {/* Total cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        <div className="stat-card blue"><div className="s-lbl">Gadai Aktif</div><div className="s-val">{loading ? '—' : totalGadaiAktif}</div><div className="s-sub">Semua outlet</div></div>
        <div className="stat-card gold"><div className="s-lbl">Total Gadai</div><div className="s-val">{loading ? '—' : totalGadai}</div><div className="s-sub">Sepanjang waktu</div></div>
        <div className="stat-card green"><div className="s-lbl">Total Tebus</div><div className="s-val">{loading ? '—' : totalTebus}</div><div className="s-sub">Semua jenis</div></div>
        <div className="stat-card"><div className="s-lbl">SJB Aktif</div><div className="s-val">{loading ? '—' : totalSjb}</div></div>
      </div>

      {/* Per-outlet table */}
      <div className="section-title">Perbandingan Antar Outlet</div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Outlet</th><th className="num">Gadai Aktif</th><th className="num">Total Gadai</th><th className="num">SJB Aktif</th><th className="num">Total Tebus</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="empty-state">⏳ Memuat...</td></tr>
            : summary.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 600 }}>{r.outlet}</td>
                <td className="num" style={{ color: 'var(--accent)', fontWeight: 700 }}>{r.gadaiAktif}</td>
                <td className="num">{r.gadaiTotal}</td>
                <td className="num">{r.sjbAktif}</td>
                <td className="num">{r.tebusTotal}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: KARYAWAN
// ═══════════════════════════════════════════════════════════
function KaryawanTab({ requestPin }: { requestPin: (a: string, fn: (pin: string) => void) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/owner?action=karyawan');
    const json = await res.json();
    if (json.ok) setRows(json.rows || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function saveKaryawan() {
    if (!editing?.nama) { setMsg('Nama wajib'); return; }
    requestPin(`Simpan karyawan ${editing.nama}`, async (pin) => {
      const res = await fetch('/api/owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'karyawan-save', ...editing, pin, kPin: editing.pin }),
      });
      const json = await res.json();
      if (json.ok) { setEditing(null); setMsg(''); load(); }
      else setMsg(json.msg || 'Gagal');
    });
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>👥 Manajemen Karyawan</div>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing({ nama: '', username: '', pin: '', role: 'KASIR', outlet_id: 1, status: 'AKTIF' })}>+ Tambah Karyawan</button>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr><th>ID</th><th>Nama</th><th>Username</th><th>PIN</th><th>Role</th><th>Outlet</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={8} className="empty-state">⏳ Memuat...</td></tr>
            : rows.map((r: any) => (
              <tr key={r.id}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.id}</td>
                <td style={{ fontWeight: 600 }}>{r.nama}</td>
                <td>{r.username || '—'}</td>
                <td style={{ fontFamily: 'var(--mono)' }}>{r.pin ? '****' : '—'}</td>
                <td><span className={`badge ${r.role?.toLowerCase()}`}>{r.role}</span></td>
                <td>{r.outlet_id === 0 ? 'SEMUA' : `Outlet ${r.outlet_id}`}</td>
                <td><span className={`badge ${r.status?.toLowerCase()}`}>{r.status}</span></td>
                <td><button className="btn btn-outline btn-sm" onClick={() => setEditing({ ...r })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="pin-overlay" onClick={() => setEditing(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 480, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{editing.id ? 'Edit' : 'Tambah'} Karyawan</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div className="form-group"><label>Nama *</label><input value={editing.nama} onChange={e => setEditing({ ...editing, nama: e.target.value })} /></div>
              <div className="form-group"><label>Username</label><input value={editing.username || ''} onChange={e => setEditing({ ...editing, username: e.target.value })} /></div>
              <div className="form-group"><label>PIN (4 digit)</label><input value={editing.pin || ''} maxLength={4} onChange={e => setEditing({ ...editing, pin: e.target.value })} /></div>
              <div className="form-group"><label>Role</label>
                <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value })}>
                  <option value="KASIR">KASIR</option><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option>
                </select>
              </div>
              <div className="form-group"><label>Outlet ID</label><input type="number" min="0" value={editing.outlet_id} onChange={e => setEditing({ ...editing, outlet_id: parseInt(e.target.value ?? '0') })} /><div className="hint">0 = semua outlet (ADMIN/OWNER)</div></div>
              <div className="form-group"><label>Status</label>
                <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                  <option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option>
                </select>
              </div>
            </div>
            {msg && <div className="alert-error">{msg}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-primary btn-full" onClick={saveKaryawan}>💾 Simpan</button>
              <button className="btn btn-outline btn-full" onClick={() => { setEditing(null); setMsg(''); }}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: AKUN LOGIN (OWNER only)
// Manage email/password login accounts (profiles + auth.users)
// ═══════════════════════════════════════════════════════════
function AkunLoginTab({ requestPin }: { requestPin: (a: string, fn: (pin: string) => void) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [outlets, setOutlets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'list' | 'add' | 'edit'>('list');
  const [editing, setEditing] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  // New account fields
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newNama, setNewNama] = useState('');
  const [newRole, setNewRole] = useState('KASIR');
  const [newOutletId, setNewOutletId] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    const [akunRes, outletRes] = await Promise.all([
      fetch('/api/owner?action=akun-login'),
      fetch('/api/outlet'),
    ]);
    const akunJson = await akunRes.json();
    const outletJson = await outletRes.json();
    if (akunJson.ok) setRows(akunJson.rows || []);
    if (outletJson.ok) setOutlets(outletJson.rows || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function getOutletName(oid: number) {
    if (oid === 0) return 'SEMUA OUTLET';
    const o = outlets.find((x: any) => x.id === oid);
    return o ? o.nama : `Outlet ${oid}`;
  }

  // ── Create new account ────────────────────────────────────
  function doCreate() {
    if (!newEmail.trim()) { setMsg('Email wajib diisi.'); setMsgType('err'); return; }
    if (!newPassword || newPassword.length < 6) { setMsg('Password minimal 6 karakter.'); setMsgType('err'); return; }
    if (!newNama.trim()) { setMsg('Nama wajib diisi.'); setMsgType('err'); return; }

    requestPin(`Buat akun login ${newEmail}`, async (pin) => {
      setMsg(''); setMsgType('ok');
      const res = await fetch('/api/owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'akun-login-create', pin,
          email: newEmail.trim(), password: newPassword,
          nama: newNama.trim(), role: newRole, outlet_id: newRole === 'KASIR' ? newOutletId : 0,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg(json.msg || 'Akun berhasil dibuat.'); setMsgType('ok');
        setMode('list'); setNewEmail(''); setNewPassword(''); setNewNama(''); setNewRole('KASIR'); setNewOutletId(1);
        load();
      } else { setMsg(json.msg || 'Gagal'); setMsgType('err'); }
    });
  }

  // ── Edit existing profile ─────────────────────────────────
  function doEdit() {
    if (!editing) return;
    requestPin(`Edit akun ${editing.email}`, async (pin) => {
      const res = await fetch('/api/owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'akun-login-edit', pin, id: editing.id,
          nama: editing.nama, role: editing.role,
          outlet_id: editing.role === 'KASIR' ? editing.outlet_id : 0,
          status: editing.status,
        }),
      });
      const json = await res.json();
      if (json.ok) { setMsg('Berhasil disimpan.'); setMsgType('ok'); setMode('list'); setEditing(null); load(); }
      else { setMsg(json.msg || 'Gagal'); setMsgType('err'); }
    });
  }

  // ── Delete account ────────────────────────────────────────
  function doDelete(row: any) {
    if (!confirm(`YAKIN hapus akun login ${row.email}?\n\nAkun ini tidak akan bisa login lagi.\nTIDAK BISA DI-UNDO.`)) return;
    requestPin(`HAPUS akun ${row.email}`, async (pin) => {
      const res = await fetch('/api/owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'akun-login-delete', pin, id: row.id }),
      });
      const json = await res.json();
      if (json.ok) { setMsg(json.msg || 'Akun dihapus.'); setMsgType('ok'); load(); }
      else { setMsg(json.msg || 'Gagal'); setMsgType('err'); }
    });
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Akun Login (Email/Password)</div>
        {mode === 'list' && (
          <button className="btn btn-primary btn-sm" onClick={() => { setMode('add'); setMsg(''); }}>+ Tambah Akun Login</button>
        )}
      </div>

      {msg && (
        <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 12,
          background: msgType === 'ok' ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.1)',
          color: msgType === 'ok' ? '#059669' : '#dc2626' }}>{msg}</div>
      )}

      {/* Add new account form */}
      {mode === 'add' && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Buat Akun Login Baru</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group"><label>Email *</label><input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="kasir@outlet.com" /></div>
            <div className="form-group"><label>Password *</label><input type="text" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 karakter" /></div>
            <div className="form-group"><label>Nama Lengkap *</label><input value={newNama} onChange={e => setNewNama(e.target.value)} /></div>
            <div className="form-group"><label>Role</label>
              <select value={newRole} onChange={e => setNewRole(e.target.value)}>
                <option value="KASIR">KASIR (1 outlet saja)</option>
                <option value="ADMIN">ADMIN (semua outlet)</option>
                <option value="OWNER">OWNER (semua outlet + settings)</option>
              </select>
            </div>
            {newRole === 'KASIR' && (
              <div className="form-group"><label>Outlet</label>
                <select value={newOutletId} onChange={e => setNewOutletId(parseInt(e.target.value))}>
                  {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.nama}</option>)}
                </select>
              </div>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 }}>
            KASIR = hanya bisa akses 1 outlet, menu terbatas. ADMIN = semua outlet, bisa edit transaksi. OWNER = full access termasuk settings & hapus.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={doCreate}>Buat Akun</button>
            <button className="btn btn-outline" onClick={() => { setMode('list'); setMsg(''); }}>Batal</button>
          </div>
        </div>
      )}

      {/* Edit existing account */}
      {mode === 'edit' && editing && (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Edit Akun: {editing.email}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div className="form-group"><label>Email</label><input value={editing.email} disabled style={{ opacity: .6 }} /></div>
            <div className="form-group"><label>Nama</label><input value={editing.nama} onChange={e => setEditing({ ...editing, nama: e.target.value })} /></div>
            <div className="form-group"><label>Role</label>
              <select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value, outlet_id: e.target.value === 'KASIR' ? (editing.outlet_id || 1) : 0 })}>
                <option value="KASIR">KASIR</option><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option>
              </select>
            </div>
            {editing.role === 'KASIR' && (
              <div className="form-group"><label>Outlet</label>
                <select value={editing.outlet_id} onChange={e => setEditing({ ...editing, outlet_id: parseInt(e.target.value) })}>
                  {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.nama}</option>)}
                </select>
              </div>
            )}
            <div className="form-group"><label>Status</label>
              <select value={editing.status} onChange={e => setEditing({ ...editing, status: e.target.value })}>
                <option value="AKTIF">AKTIF</option><option value="NONAKTIF">NONAKTIF</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={doEdit}>Simpan</button>
            <button className="btn btn-outline" onClick={() => { setMode('list'); setEditing(null); setMsg(''); }}>Batal</button>
          </div>
        </div>
      )}

      {/* Account list table */}
      {mode === 'list' && (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Email</th><th>Nama</th><th>Role</th><th>Outlet</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={6} className="empty-state">Memuat...</td></tr>
              : rows.length === 0 ? <tr><td colSpan={6} className="empty-state">Belum ada akun login.</td></tr>
              : rows.map((r: any) => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.email}</td>
                  <td style={{ fontWeight: 600 }}>{r.nama}</td>
                  <td><span className={`badge ${r.role?.toLowerCase()}`}>{r.role}</span></td>
                  <td>{getOutletName(r.outlet_id)}</td>
                  <td><span className={`badge ${r.status?.toLowerCase()}`}>{r.status}</span></td>
                  <td style={{ display: 'flex', gap: 4 }}>
                    <button className="btn btn-outline btn-sm" onClick={() => { setEditing({ ...r }); setMode('edit'); setMsg(''); }}>Edit</button>
                    <button className="btn btn-danger btn-sm" onClick={() => doDelete(r)}>Hapus</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: RAK GUDANG
// ═══════════════════════════════════════════════════════════
function RakTab({ requestPin }: { requestPin: (a: string, fn: (pin: string) => void) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [filterOutlet, setFilterOutlet] = useState('0');
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/owner?action=rak&outletId=${filterOutlet}`);
    const json = await res.json();
    if (json.ok) setRows(json.rows || []);
    setLoading(false);
  }, [filterOutlet]);

  useEffect(() => { load(); }, [load]);

  function saveRak() {
    if (!editing?.kode || !editing?.nama) { setMsg('Kode dan nama wajib'); return; }
    requestPin(`Simpan rak ${editing.kode}`, async (pin) => {
      const res = await fetch('/api/owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rak-save', pin, ...editing }),
      });
      const json = await res.json();
      if (json.ok) { setEditing(null); setMsg(''); load(); }
      else setMsg(json.msg || 'Gagal');
    });
  }

  function deleteRak(id: string, kode: string) {
    if (!confirm(`Hapus rak ${kode}?`)) return;
    requestPin(`Hapus rak ${kode}`, async (pin) => {
      const res = await fetch('/api/owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rak-delete', pin, id }),
      });
      const json = await res.json();
      if (json.ok) load();
    });
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>📦 Manajemen Rak Gudang</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <select value={filterOutlet} onChange={e => setFilterOutlet(e.target.value)} style={{ padding: '6px 10px', fontSize: 12 }}>
            <option value="0">Semua Outlet</option><option value="1">Outlet 1</option><option value="2">Outlet 2</option>
          </select>
          <button className="btn btn-primary btn-sm" onClick={() => setEditing({ kode: '', nama: '', kategori: '', tipe: 'GADAI', keterangan: '', outlet_id: 1 })}>+ Tambah Rak</button>
        </div>
      </div>

      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Kode</th><th>Nama</th><th>Kategori</th><th>Tipe</th><th>Keterangan</th><th>Outlet</th><th></th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={7} className="empty-state">⏳</td></tr>
            : rows.length === 0 ? <tr><td colSpan={7} className="empty-state">Belum ada rak</td></tr>
            : rows.map((r: any) => (
              <tr key={r.id}>
                <td style={{ fontWeight: 700, fontFamily: 'var(--mono)' }}>{r.kode}</td>
                <td>{r.nama}</td>
                <td>{r.kategori || '—'}</td>
                  <td><span className={`badge ${(r.tipe||'GADAI').toLowerCase()}`}>{r.tipe || 'GADAI'}</span></td>
                <td>{r.keterangan || '—'}</td>
                <td>{r.outlet || `Outlet ${r.outlet_id}`}</td>
                <td style={{ display: 'flex', gap: 4 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditing({ ...r })}>Edit</button>
                  <button className="btn btn-outline btn-sm" style={{ color: 'var(--red)', borderColor: 'rgba(239,68,68,.4)' }} onClick={() => deleteRak(r.id, r.kode)}>Hapus</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && (
        <div className="pin-overlay" onClick={() => setEditing(null)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 420 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{editing.id ? 'Edit' : 'Tambah'} Rak</h3>
            <div className="form-group"><label>Kode Rak *</label><input value={editing.kode} onChange={e => setEditing({ ...editing, kode: e.target.value.toUpperCase() })} placeholder="A1, B2, dll" /></div>
            <div className="form-group"><label>Nama Rak *</label><input value={editing.nama} onChange={e => setEditing({ ...editing, nama: e.target.value })} placeholder="Rak Handphone A" /></div>
            <div className="form-group"><label>Kategori (auto-assign)</label>
              <select value={editing.kategori || ''} onChange={e => setEditing({ ...editing, kategori: e.target.value })}>
                <option value="">Semua</option><option>HANDPHONE</option><option>LAPTOP</option><option>ELEKTRONIK</option><option>EMAS</option><option>EMAS PAUN</option>
              </select>
            </div>
            <div className="form-group"><label>Tipe *</label>
              <select value={editing.tipe || 'GADAI'} onChange={e => setEditing({ ...editing, tipe: e.target.value })}>
                <option value="GADAI">GADAI</option><option value="SJB">SJB</option>
              </select>
            </div>
            <div className="form-group"><label>Outlet ID *</label><input type="number" value={editing.outlet_id || 1} min={1} onChange={e => setEditing({ ...editing, outlet_id: parseInt(e.target.value) || 1 })} /></div>
            {msg && <div className="alert-error">{msg}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-full" onClick={saveRak}>💾 Simpan</button>
              <button className="btn btn-outline btn-full" onClick={() => { setEditing(null); setMsg(''); }}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: OUTLET
// ═══════════════════════════════════════════════════════════
function OutletTab({ requestPin }: { requestPin: (a: string, fn: (pin: string) => void) => void }) {
  const [outlets, setOutlets] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newOutlet, setNewOutlet] = useState({ nama: '', alamat: '', kota: '', telpon: '', waktu_operasional: '', nama_perusahaan: 'PT. ACEH GADAI SYARIAH' });
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/outlet');
    const json = await res.json();
    if (json.ok) setOutlets(json.rows || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  function addOutlet() {
    if (!newOutlet.nama) { setMsg('Nama wajib'); return; }
    requestPin(`Tambah outlet ${newOutlet.nama}`, async (pin) => {
      const res = await fetch('/api/owner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'outlet-add', pin, ...newOutlet }),
      });
      const json = await res.json();
      if (json.ok) { setShowAdd(false); setNewOutlet({ nama: '', alamat: '', kota: '', telpon: '', waktu_operasional: '', nama_perusahaan: 'PT. ACEH GADAI SYARIAH' }); setMsg(''); load(); }
      else setMsg(json.msg || 'Gagal');
    });
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>🏢 Manajemen Outlet</div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ Tambah Outlet Baru</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 16 }}>
        {outlets.map((o: any) => (
          <div key={o.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>{o.nama} <span style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {o.id}</span></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 12 }}>
              <div><span style={{ color: 'var(--text3)' }}>Alamat</span><br />{o.alamat || '—'}</div>
              <div><span style={{ color: 'var(--text3)' }}>Kota</span><br />{o.kota || '—'}</div>
              <div><span style={{ color: 'var(--text3)' }}>Telpon</span><br />{o.telepon || o.telpon || '—'}</div>
              <div><span style={{ color: 'var(--text3)' }}>Admin</span><br />Rp {(o.biaya_admin || 10000).toLocaleString('id-ID')}</div>
              <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text3)' }}>Operasional</span><br />{o.waktu_operasional || '—'}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="pin-overlay" onClick={() => setShowAdd(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 28, width: 480 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>🏢 Tambah Outlet Baru</h3>
            <div className="form-group"><label>Nama Outlet *</label><input value={newOutlet.nama} onChange={e => setNewOutlet({ ...newOutlet, nama: e.target.value.toUpperCase() })} placeholder="NAMA KOTA" /></div>
            <div className="form-row">
              <div className="form-group"><label>Alamat</label><input value={newOutlet.alamat} onChange={e => setNewOutlet({ ...newOutlet, alamat: e.target.value })} /></div>
              <div className="form-group"><label>Kota</label><input value={newOutlet.kota} onChange={e => setNewOutlet({ ...newOutlet, kota: e.target.value })} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>Telpon</label><input value={newOutlet.telpon} onChange={e => setNewOutlet({ ...newOutlet, telpon: e.target.value })} /></div>
              <div className="form-group"><label>Perusahaan</label><input value={newOutlet.nama_perusahaan} onChange={e => setNewOutlet({ ...newOutlet, nama_perusahaan: e.target.value })} /></div>
            </div>
            <div className="form-group"><label>Waktu Operasional</label><input value={newOutlet.waktu_operasional} onChange={e => setNewOutlet({ ...newOutlet, waktu_operasional: e.target.value })} placeholder="Senin-Minggu: 10.00 - 22.00 WIB" /></div>
            {msg && <div className="alert-error">{msg}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-full" onClick={addOutlet}>🏢 Tambah Outlet</button>
              <button className="btn btn-outline btn-full" onClick={() => { setShowAdd(false); setMsg(''); }}>Batal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: BACKUP STATUS
// ═══════════════════════════════════════════════════════════
function BackupTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await fetch('/api/owner?action=backup-status');
      const json = await res.json();
      if (json.ok) setLogs(json.logs || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>💾 Status Backup</div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>
          Backup otomatis berjalan setiap malam jam <b>23:00 WIB</b> via Vercel Cron.
          Backup mencakup: JSON dump semua tabel + laporan malam HTML → Supabase Storage.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)' }}>
          Untuk trigger backup manual: <code style={{ background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>POST /api/backup/nightly</code> dengan header Authorization.
        </div>
      </div>

      <div className="section-title">Riwayat Backup Terakhir</div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Waktu</th><th>Outlet</th><th>Detail</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={3} className="empty-state">⏳ Memuat...</td></tr>
            : logs.length === 0 ? <tr><td colSpan={3} className="empty-state">Belum ada riwayat backup</td></tr>
            : logs.map((l: any, i: number) => (
              <tr key={i}>
                <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{new Date(l.tgl).toLocaleString('id-ID')}</td>
                <td>{l.outlet || 'ALL'}</td>
                <td style={{ fontSize: 11, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.nilai_baru || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TAB: REPRINT KONTRAK (Admin/Owner)
// Cermin panel Reprint di ownerdashboard.html GAS
// ═══════════════════════════════════════════════════════════
function ReprintTab() {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  async function doSearch() {
    const q = query.trim().toUpperCase();
    if (!q) { setError('Masukkan No Faktur atau barcode'); return; }
    setSearching(true); setError(''); setResult(null);
    try {
      const res = await fetch(`/api/owner?action=reprint&q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (!json.ok) { setError(json.msg || 'Tidak ditemukan'); setSearching(false); return; }
      setResult(json);
    } catch (e) { setError('Error: ' + (e as Error).message); }
    setSearching(false);
  }

  function doPrint() {
    if (!result?.data) return;
    const d = result.data;
    const source = result.source;

    if (source === 'SJB') {
      // SJB: ujrah_persen = lama_titip, ujrah_nominal = harga_buyback (repurposed)
      printSJB({
        noSJB: d.no_faktur || '', nama: d.nama || '', noKtp: d.no_ktp || '',
        telp1: d.telp1 || '', kategori: d.kategori || '', barang: d.barang || '',
        kelengkapan: d.kelengkapan || '', grade: d.grade || '', imeiSn: d.imei_sn || '',
        hargaJual: Number(d.harga_jual || d.jumlah_gadai || 0),
        hargaBuyback: Number(d.harga_buyback || d.ujrah_nominal || 0),
        lamaTitip: Number(d.lama_titip || d.ujrah_persen || 30),
        tglJual: d.tgl_gadai || '', tglJT: d.tgl_jt || '',
        locationGudang: d.rak || '',
        barcodeA: d.barcode_a || '', barcodeB: d.barcode_b || '',
        kasir: d.kasir || '', outlet: result.outlet || '',
        alamat: result.alamat || '', kota: result.kota || '',
        telpon: result.telpon || '',
        namaPerusahaan: result.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
        waktuOperasional: result.waktuOperasional || '',
      });
    } else {
      printGadai({
        noFaktur: d.no_faktur || '', tglGadai: d.tgl_gadai || '',
        tglJT: d.tgl_jt || '', tglSita: d.tgl_sita || '',
        nama: d.nama || '', noKtp: d.no_ktp || '',
        telp1: d.telp1 || '', telp2: d.telp2 || '',
        kategori: d.kategori || '', barang: d.barang || '',
        kelengkapan: d.kelengkapan || '', grade: d.grade || '',
        imeiSn: d.imei_sn || '',
        taksiran: Number(d.taksiran || 0), jumlahGadai: Number(d.jumlah_gadai || 0),
        biayaAdmin: Number(result.biayaAdmin || 10000),
        ujrahNominal: Number(d.ujrah_nominal || 0),
        ujrahPersen: d.ujrah_persen || '',
        barcodeA: d.barcode_a || '', barcodeB: d.barcode_b || '',
        locationGudang: d.rak || '',
        kasir: d.kasir || '', outlet: result.outlet || '',
        alamat: result.alamat || '', kota: result.kota || '',
        telpon: result.telpon || '',
        namaPerusahaan: result.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
        waktuOperasional: result.waktuOperasional || '',
      });
    }
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>🖨️ Reprint Surat Kontrak</div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={query} style={{ width: 280, fontFamily: 'var(--mono)' }}
          onChange={e => setQuery(e.target.value.toUpperCase())}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder="No Faktur (SBR-1-0001) / barcode" />
        <button className="btn btn-primary btn-sm" onClick={doSearch} disabled={searching}>
          {searching ? '⏳' : '🔍 Cari & Cetak'}
        </button>
        <span style={{ fontSize: 12, color: 'var(--text3)' }}>
          Masukkan No Faktur atau scan barcode untuk reprint kontrak gadai / SJB
        </span>
      </div>

      {error && <div className="alert-error" style={{ marginBottom: 16 }}>⚠️ {error}</div>}

      {result?.data ? (
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, maxWidth: 600 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{result.data.no_faktur}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Tipe: {result.source} | Status: {result.data.status}</div>
            </div>
            <span className={`badge ${(result.data.status || '').toLowerCase()}`}>{result.data.status}</span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, marginBottom: 16 }}>
            <div><span style={{ color: 'var(--text3)' }}>Nama</span><br /><b>{result.data.nama}</b></div>
            <div><span style={{ color: 'var(--text3)' }}>Kategori</span><br />{result.data.kategori}</div>
            <div><span style={{ color: 'var(--text3)' }}>Barang</span><br />{result.data.barang}</div>
            <div><span style={{ color: 'var(--text3)' }}>Rak</span><br />{result.data.rak || '—'}</div>
            <div>
              <span style={{ color: 'var(--text3)' }}>{result.source === 'SJB' ? 'Harga Jual' : 'Jumlah Pinjaman'}</span><br />
              {formatRp(result.source === 'SJB' ? (result.data.harga_jual || result.data.jumlah_gadai || 0) : result.data.jumlah_gadai)}
            </div>
            <div><span style={{ color: 'var(--text3)' }}>Outlet</span><br />{result.data.outlet || '—'}</div>
            <div>
              <span style={{ color: 'var(--text3)' }}>Barcode A</span><br />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{result.data.barcode_a || '—'}</span>
            </div>
            <div>
              <span style={{ color: 'var(--text3)' }}>Barcode B</span><br />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{result.data.barcode_b || '—'}</span>
            </div>
          </div>

          <button className="btn btn-primary btn-full" onClick={doPrint}>
            🖨️ Cetak Ulang Kontrak {result.source === 'SJB' ? 'SJB' : 'Gadai'}
          </button>
        </div>
      ) : !error && !searching ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--text3)' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🖨️</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Reprint Surat Kontrak</div>
          <div style={{ fontSize: 12, marginTop: 8 }}>Masukkan No Faktur lalu klik Cari & Cetak</div>
        </div>
      ) : null}
    </div>
  );
}
