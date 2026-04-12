'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Edit Transaksi
// File: app/edit/page.tsx
// ADMIN/OWNER only
// Edit data gadai + hapus transaksi (reverse kas otomatis)
// ALUR KAS TIDAK BOLEH DIUBAH
// ============================================================

import { useState } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useOutletId, useAuth } from '@/components/auth/AuthProvider';
import { formatRp, formatMoneyInput, parseMoney, formatDate } from '@/lib/format';

type EditTab = 1 | 2;

export default function EditTransaksiPage() {
  const outletId = useOutletId();
  const { isAdminOrOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<EditTab>(1);

  // Search
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [gadaiData, setGadaiData] = useState<any>(null);
  const [tebusData, setTebusData] = useState<any[]>([]);

  // Edit fields
  const [editNama, setEditNama] = useState('');
  const [editBarang, setEditBarang] = useState('');
  const [editKelengkapan, setEditKelengkapan] = useState('');
  const [editImei, setEditImei] = useState('');
  const [editNoKtp, setEditNoKtp] = useState('');
  const [editTelp1, setEditTelp1] = useState('');

  // PIN
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState('');
  const [pendingAction, setPendingAction] = useState<((pin: string, kasir: string) => void) | null>(null);

  // Messages
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  // ── Search ──────────────────────────────────────────────
  async function doSearch() {
    const q = searchInput.trim();
    if (!q) { setSearchError('Masukkan No Faktur atau Barcode'); return; }
    setSearching(true); setSearchError(''); setGadaiData(null); setTebusData([]); setMsg('');

    try {
      const res = await fetch('/api/gadai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({ barcode: q, outletId }),
      });
      const json = await res.json();
      if (!json.ok) { setSearchError(json.msg); setSearching(false); return; }
      const d = json.data;
      setGadaiData(d);
      setEditNama(d.nama || '');
      setEditBarang(d.barang || '');
      setEditKelengkapan(d.kelengkapan || '');
      setEditImei(d.imei_sn || '');
      setEditNoKtp(d.no_ktp || '');
      setEditTelp1(d.telp1 || '');

      // Load related tebus
      // This would need a separate API, for now skip
    } catch (e) { setSearchError('Error: ' + (e as Error).message); }
    setSearching(false);
  }

  // ── Edit fields ─────────────────────────────────────────
  function requestEditSave() {
    if (!gadaiData) return;
    setPinAction(`Edit data ${gadaiData.no_faktur}`);
    setPendingAction(() => async (pin: string, kasir: string) => {
      try {
        const res = await fetch('/api/edit/gadai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
          body: JSON.stringify({
            pin, id: gadaiData.id, noFaktur: gadaiData.no_faktur,
            nama: editNama.trim(), barang: editBarang.trim(),
            kelengkapan: editKelengkapan.trim(), imeiSn: editImei.trim(),
            noKtp: editNoKtp.trim(), telp1: editTelp1.trim(),
          }),
        });
        const json = await res.json();
        if (json.ok) { setMsg('✅ Data berhasil diupdate'); setMsgType('ok'); doSearch(); }
        else { setMsg(json.msg || 'Gagal update'); setMsgType('err'); }
      } catch (e) { setMsg('Error: ' + (e as Error).message); setMsgType('err'); }
    });
    setPinOpen(true);
  }

  // ── Delete (BATALKAN) ──────────────────────────────────
  function requestDelete() {
    if (!gadaiData) return;
    if (!confirm(`YAKIN batalkan kontrak ${gadaiData.no_faktur}?\n\nIni akan:\n- Set status = BATAL\n- Reverse entri kas otomatis\n- Dicatat di audit log\n\nTIDAK BISA DI-UNDO.`)) return;

    setPinAction(`BATALKAN ${gadaiData.no_faktur}`);
    setPendingAction(() => async (pin: string, kasir: string) => {
      try {
        const res = await fetch('/api/edit/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
          body: JSON.stringify({
            pin, id: gadaiData.id, noFaktur: gadaiData.no_faktur,
            source: gadaiData._source || 'GADAI',
          }),
        });
        const json = await res.json();
        if (json.ok) { setMsg('✅ Kontrak berhasil dibatalkan. Kas sudah di-reverse.'); setMsgType('ok'); doSearch(); }
        else { setMsg(json.msg || 'Gagal hapus'); setMsgType('err'); }
      } catch (e) { setMsg('Error: ' + (e as Error).message); setMsgType('err'); }
    });
    setPinOpen(true);
  }

  if (!isAdminOrOwner) {
    return (
      <AppShell title="✏️ Edit Transaksi" subtitle="ADMIN/OWNER only">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
          ⛔ Halaman ini hanya untuk Admin / Owner
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="✏️ Edit Transaksi" subtitle="Edit data & batalkan kontrak (ADMIN/OWNER)">
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div onClick={() => setActiveTab(1)}
          style={{ padding: '10px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            color: activeTab === 1 ? 'var(--accent)' : 'var(--text3)',
            borderBottom: `3px solid ${activeTab === 1 ? 'var(--accent)' : 'transparent'}`, marginBottom: -2 }}>
          ✏️ Edit Gadai / SJB
        </div>
        <div onClick={() => setActiveTab(2)}
          style={{ padding: '10px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            color: activeTab === 2 ? 'var(--accent)' : 'var(--text3)',
            borderBottom: `3px solid ${activeTab === 2 ? 'var(--accent)' : 'transparent'}`, marginBottom: -2 }}>
          🔄 Edit Tebus
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* Search */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
            🔍 Cari Kontrak
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={searchInput} onChange={e => setSearchInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && doSearch()}
              placeholder="No Faktur / Barcode" style={{ flex: 1, fontFamily: 'var(--mono)' }} />
            <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
              {searching ? '⏳' : 'Cari'}
            </button>
          </div>
          {searchError && <div className="alert-error" style={{ marginTop: 8 }}>⚠️ {searchError}</div>}
        </div>

        {/* Result */}
        {gadaiData && activeTab === 1 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{gadaiData.no_faktur}</span>
                <span className={`badge ${(gadaiData.status || '').toLowerCase()}`} style={{ marginLeft: 8 }}>{gadaiData.status}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                {gadaiData.outlet} • {formatDate(gadaiData.tgl_gadai)}
              </div>
            </div>

            {/* Info grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '6px 16px', marginBottom: 14 }}>
              {[
                ['Taksiran', formatRp(gadaiData.taksiran)],
                ['Pinjaman', formatRp(gadaiData.jumlah_gadai)],
                ['Payment', gadaiData.payment],
                ['Kasir', gadaiData.kasir],
                ['Rak', gadaiData.rak || '—'],
              ].map(([l, v]) => (
                <div key={l as string}>
                  <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 1 }}>{l}</div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Editable fields */}
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
              ✏️ Edit Data (field yang bisa diubah)
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10, marginBottom: 14 }}>
              <div className="form-group"><label>Nama</label><input value={editNama} onChange={e => setEditNama(e.target.value.toUpperCase())} /></div>
              <div className="form-group"><label>Barang</label><input value={editBarang} onChange={e => setEditBarang(e.target.value.toUpperCase())} /></div>
              <div className="form-group"><label>Kelengkapan</label><input value={editKelengkapan} onChange={e => setEditKelengkapan(e.target.value)} /></div>
              <div className="form-group"><label>IMEI / SN</label><input value={editImei} onChange={e => setEditImei(e.target.value)} /></div>
              <div className="form-group"><label>No KTP</label><input value={editNoKtp} onChange={e => setEditNoKtp(e.target.value)} /></div>
              <div className="form-group"><label>Telepon</label><input value={editTelp1} onChange={e => setEditTelp1(e.target.value)} /></div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <button className="btn btn-primary" onClick={requestEditSave}>💾 Simpan Perubahan</button>
              {gadaiData.status === 'AKTIF' && (
                <button className="btn btn-danger" onClick={requestDelete}>🗑️ Batalkan Kontrak</button>
              )}
            </div>

            {/* Warning */}
            {gadaiData.status === 'AKTIF' && (
              <div style={{ background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: 12, fontSize: 11, color: '#dc2626', marginTop: 10 }}>
                ⚠️ <b>PERHATIAN:</b> Batalkan kontrak akan set status = BATAL, reverse semua entri kas terkait, dan dicatat di audit log. Aksi ini TIDAK BISA DI-UNDO.
              </div>
            )}

            {/* Message */}
            {msg && (
              <div style={{
                padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, marginTop: 10,
                background: msgType === 'ok' ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.1)',
                color: msgType === 'ok' ? '#059669' : '#dc2626',
                border: `1px solid ${msgType === 'ok' ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.25)'}`,
              }}>{msg}</div>
            )}
          </div>
        )}

        {/* Tab 2: Edit Tebus - placeholder */}
        {activeTab === 2 && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
              🔄 Edit Tebus
            </div>
            <p style={{ fontSize: 13, color: 'var(--text2)' }}>
              Cari kontrak di Tab 1, lalu riwayat tebus akan ditampilkan di sini.
              Untuk menghapus tebus, gunakan fitur Batalkan di Tab 1.
            </p>
          </div>
        )}
      </div>

      <PinModal open={pinOpen} action={pinAction}
        onSuccess={(pin, kasir) => { setPinOpen(false); pendingAction?.(pin, kasir); }}
        onCancel={() => setPinOpen(false)} />
    </AppShell>
  );
}
