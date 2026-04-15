'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Settings Outlet
// File: app/outlet/page.tsx
// OWNER only — edit alamat, telpon, dll per outlet
// ============================================================

import { useState, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useAuth } from '@/components/auth/AuthProvider';

interface Outlet {
  id: number; nama: string; alamat: string; kota: string;
  telepon: string; waktu_operasional: string; nama_perusahaan: string;
  biaya_admin: number; web_url: string;
}

export default function OutletSettingsPage() {
  const { isOwner, outletId } = useAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Outlet | null>(null);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinMode, setPinMode] = useState<'edit' | 'delete'>('edit');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<Outlet | null>(null);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [deleting, setDeleting] = useState(false);

  async function loadOutlets() {
    setLoading(true);
    try {
      const res = await fetch('/api/outlet');
      const json = await res.json();
      if (json.ok) setOutlets(json.rows || []);
    } catch { /* silent */ }
    setLoading(false);
  }

  useEffect(() => { loadOutlets(); }, []);

  function startEdit(o: Outlet) {
    setEditing({ ...o });
    setMsg('');
  }

  function requestSave() {
    if (!editing) return;
    setPinMode('edit');
    setPinOpen(true);
  }

  // ── Delete flow ─────────────────────────────────────────────
  function startDelete(o: Outlet) {
    setDeleteTarget(o);
    setDeleteConfirmName('');
    setMsg('');
  }

  function requestDelete() {
    if (!deleteTarget) return;
    if (deleteConfirmName.trim().toUpperCase() !== deleteTarget.nama.toUpperCase()) {
      setMsg(`Ketik nama outlet "${deleteTarget.nama}" untuk konfirmasi.`);
      setMsgType('err');
      return;
    }
    setPinMode('delete');
    setPinOpen(true);
  }

  async function doDelete(pin: string) {
    setPinOpen(false);
    if (!deleteTarget) return;
    setDeleting(true); setMsg('');
    try {
      const res = await fetch('/api/outlet', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({
          pin,
          outletId: deleteTarget.id,
          confirmNama: deleteConfirmName.trim(),
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setMsg(json.msg || 'Outlet berhasil dihapus.');
        setMsgType('ok');
        setDeleteTarget(null);
        loadOutlets();
      } else {
        setMsg(json.msg || 'Gagal hapus outlet.');
        setMsgType('err');
      }
    } catch (e) { setMsg('Error: ' + (e as Error).message); setMsgType('err'); }
    setDeleting(false);
  }

  async function doSave(pin: string) {
    setPinOpen(false);
    if (!editing) return;
    try {
      const res = await fetch('/api/outlet', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({ pin, ...editing }),
      });
      const json = await res.json();
      if (json.ok) { setMsg('✅ Berhasil disimpan'); setMsgType('ok'); loadOutlets(); setEditing(null); }
      else { setMsg(json.msg || 'Gagal'); setMsgType('err'); }
    } catch (e) { setMsg('Error: ' + (e as Error).message); setMsgType('err'); }
  }

  if (!isOwner) {
    return (
      <AppShell title="⚙️ Settings Outlet" subtitle="OWNER only">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
          ⛔ Halaman ini hanya untuk Owner
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="⚙️ Settings Outlet" subtitle="Kelola data outlet (alamat, telpon, dll)">
      <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
        {msg && (
          <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, marginBottom: 14,
            background: msgType === 'ok' ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.1)',
            color: msgType === 'ok' ? '#059669' : '#dc2626' }}>{msg}</div>
        )}

        {/* Outlet Cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: 16 }}>
          {outlets.map(o => (
            <div key={o.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700 }}>{o.nama}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>ID: {o.id}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => startEdit(o)}>Edit</button>
                  {outlets.length > 1 && (
                    <button className="btn btn-danger btn-sm" onClick={() => startDelete(o)}>Hapus</button>
                  )}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                <div><span style={{ color: 'var(--text3)' }}>Alamat</span><br />{o.alamat || '—'}</div>
                <div><span style={{ color: 'var(--text3)' }}>Kota</span><br />{o.kota || '—'}</div>
                <div><span style={{ color: 'var(--text3)' }}>Telpon</span><br />{o.telepon || '—'}</div>
                <div><span style={{ color: 'var(--text3)' }}>Biaya Admin</span><br />Rp {(o.biaya_admin || 10000).toLocaleString('id-ID')}</div>
                <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text3)' }}>Waktu Operasional</span><br />{o.waktu_operasional || '—'}</div>
                <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text3)' }}>Nama Perusahaan</span><br />{o.nama_perusahaan || '—'}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Edit Modal */}
        {editing && (
          <div className="pin-overlay" onClick={() => setEditing(null)}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 500, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Edit Outlet: {editing.nama}</h3>

              <div className="form-group"><label>Nama Outlet</label><input value={editing.nama} onChange={e => setEditing({ ...editing, nama: e.target.value })} /></div>
              <div className="form-group"><label>Alamat</label><input value={editing.alamat || ''} onChange={e => setEditing({ ...editing, alamat: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label>Kota</label><input value={editing.kota || ''} onChange={e => setEditing({ ...editing, kota: e.target.value })} /></div>
                <div className="form-group"><label>Telpon / WA</label><input value={editing.telepon || ''} onChange={e => setEditing({ ...editing, telepon: e.target.value })} /></div>
              </div>
              <div className="form-group"><label>Waktu Operasional</label><input value={editing.waktu_operasional || ''} onChange={e => setEditing({ ...editing, waktu_operasional: e.target.value })} /></div>
              <div className="form-group"><label>Nama Perusahaan</label><input value={editing.nama_perusahaan || ''} onChange={e => setEditing({ ...editing, nama_perusahaan: e.target.value })} /></div>
              <div className="form-row">
                <div className="form-group"><label>Biaya Admin (Rp)</label><input type="number" value={editing.biaya_admin || 10000} onChange={e => setEditing({ ...editing, biaya_admin: parseInt(e.target.value) || 10000 })} /></div>
                <div className="form-group"><label>Web URL</label><input value={editing.web_url || ''} onChange={e => setEditing({ ...editing, web_url: e.target.value })} /></div>
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary btn-full" onClick={requestSave}>💾 Simpan</button>
                <button className="btn btn-outline btn-full" onClick={() => setEditing(null)}>Batal</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteTarget && (
          <div className="pin-overlay" onClick={() => setDeleteTarget(null)}>
            <div style={{ background: 'var(--surface)', border: '2px solid var(--red)', borderRadius: 16, padding: 24, width: 460, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--red)', marginBottom: 12 }}>
                Hapus Outlet: {deleteTarget.nama}
              </div>

              <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: 12, fontSize: 12, color: '#dc2626', marginBottom: 14, lineHeight: 1.6 }}>
                <b>PERINGATAN:</b> Ini akan menghapus PERMANEN:<br />
                - Semua data gadai outlet ini<br />
                - Semua data SJB, tebus, buyback<br />
                - Semua entri kas<br />
                - Semua data gudang sita & aset<br />
                - Semua karyawan outlet ini<br />
                - Outlet itu sendiri<br /><br />
                Sistem akan backup otomatis sebelum menghapus.<br />
                <b>Aksi ini TIDAK BISA DI-UNDO.</b>
              </div>

              <div className="form-group" style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, color: 'var(--red)', fontWeight: 700 }}>
                  Ketik "{deleteTarget.nama}" untuk konfirmasi
                </label>
                <input
                  value={deleteConfirmName}
                  onChange={e => setDeleteConfirmName(e.target.value.toUpperCase())}
                  placeholder={deleteTarget.nama}
                  style={{ borderColor: 'var(--red)' }}
                />
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-danger btn-full"
                  onClick={requestDelete}
                  disabled={deleting || deleteConfirmName.trim().toUpperCase() !== deleteTarget.nama.toUpperCase()}
                >
                  {deleting ? 'Menghapus...' : 'Hapus Outlet Permanen'}
                </button>
                <button className="btn btn-outline btn-full" onClick={() => setDeleteTarget(null)}>Batal</button>
              </div>
            </div>
          </div>
        )}

        <PinModal open={pinOpen}
          action={pinMode === 'delete' ? `HAPUS Outlet ${deleteTarget?.nama || ''}` : `Edit Outlet ${editing?.nama || ''}`}
          onSuccess={(pin) => pinMode === 'delete' ? doDelete(pin) : doSave(pin)}
          onCancel={() => setPinOpen(false)} />
      </div>
    </AppShell>
  );
}
