'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Edit Transaksi
// File: app/edit/page.tsx
// ADMIN/OWNER only
//
// Tab 1: Edit Gadai/SJB
//   - Edit nama, barang, kelengkapan, imei, ktp, telp
//   - Edit taksiran, jumlah_gadai, ujrah%, ujrah nominal, payment
//   - Kalau payment/jumlah berubah → kas reverse+regenerate otomatis
//   - Batalkan kontrak (status=BATAL + reverse kas)
//
// Tab 2: Edit Tebus
//   - Cari by No Kontrak → tampilkan semua tebus+buyback
//   - Edit jumlah_bayar + payment → kas reverse+regenerate
//   - Batalkan tebus → revert gadai ke AKTIF + reverse kas
//
// Cermin edittransaksi.html + code.gs di GAS lama
// ALUR KAS TIDAK BOLEH DIUBAH
// ============================================================

import { useState } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useOutletId, useAuth } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';

type EditTab = 1 | 2;

export default function EditTransaksiPage() {
  const outletId = useOutletId();
  const { isAdminOrOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<EditTab>(1);

  // ── Tab 1: Search & Edit Gadai ──────────────────────────────
  const [searchInput, setSearchInput] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [gadaiData, setGadaiData] = useState<any>(null);

  // Text fields
  const [editNama, setEditNama] = useState('');
  const [editBarang, setEditBarang] = useState('');
  const [editKelengkapan, setEditKelengkapan] = useState('');
  const [editImei, setEditImei] = useState('');
  const [editNoKtp, setEditNoKtp] = useState('');
  const [editTelp1, setEditTelp1] = useState('');

  // Financial fields (NEW — cermin GAS edittransaksi.html)
  const [editTaksiran, setEditTaksiran] = useState('');
  const [editJumlahGadai, setEditJumlahGadai] = useState('');
  const [editUjrahPersen, setEditUjrahPersen] = useState('');
  const [editUjrahNominal, setEditUjrahNominal] = useState('');
  const [editPayment, setEditPayment] = useState('CASH');
  const [editCash, setEditCash] = useState('');
  const [editBank, setEditBank] = useState('');

  // ── Tab 2: Search & Edit Tebus ──────────────────────────────
  const [tebusSearchInput, setTebusSearchInput] = useState('');
  const [tebusSearching, setTebusSearching] = useState(false);
  const [tebusSearchError, setTebusSearchError] = useState('');
  const [tebusResults, setTebusResults] = useState<any[]>([]);
  // Per-entry edit state: { [idTebus]: { jumlahBayar, payment, cash, bank } }
  const [tebusEdits, setTebusEdits] = useState<Record<string, any>>({});

  // PIN modal
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState('');
  const [pendingAction, setPendingAction] = useState<((pin: string, kasir: string) => void) | null>(null);

  // Messages
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [tebusMsg, setTebusMsg] = useState('');
  const [tebusMsgType, setTebusMsgType] = useState<'ok' | 'err'>('ok');
  // Per-entry messages for tebus items
  const [tebusMsgs, setTebusMsgs] = useState<Record<string, { msg: string; type: 'ok' | 'err' }>>({});

  // ══════════════════════════════════════════════════════════════
  // TAB 1: SEARCH GADAI (cermin etCariGadai di GAS)
  // ══════════════════════════════════════════════════════════════
  async function doSearch() {
    const q = searchInput.trim();
    if (!q) { setSearchError('Masukkan No Faktur atau Barcode'); return; }
    setSearching(true); setSearchError(''); setGadaiData(null); setMsg('');

    try {
      const res = await fetch('/api/gadai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({ barcode: q, outletId, includeAll: true }),
      });
      const json = await res.json();
      if (!json.ok) { setSearchError(json.msg); setSearching(false); return; }
      const d = json.data;
      setGadaiData(d);
      // Text fields
      setEditNama(d.nama || '');
      setEditBarang(d.barang || '');
      setEditKelengkapan(d.kelengkapan || '');
      setEditImei(d.imei_sn || '');
      setEditNoKtp(d.no_ktp || '');
      setEditTelp1(d.telp1 || '');
      // Financial fields (cermin etTampilGadai di GAS)
      setEditTaksiran(String(d.taksiran ?? 0));
      setEditJumlahGadai(String(d._source === 'SJB' ? (d.harga_jual ?? 0) : (d.jumlah_gadai ?? 0)));
      setEditUjrahPersen(String(d.ujrah_persen ?? 0));
      setEditUjrahNominal(String(d.ujrah_nominal ?? 0));
      setEditPayment(d.payment || 'CASH');
      setEditCash('');
      setEditBank('');
    } catch (e) { setSearchError('Error: ' + (e as Error).message); }
    setSearching(false);
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 1: SAVE EDIT (cermin etSimpanGadai di GAS)
  // ══════════════════════════════════════════════════════════════
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
            source: gadaiData._source || 'GADAI',
            // Text fields
            nama: editNama.trim(), barang: editBarang.trim(),
            kelengkapan: editKelengkapan.trim(), imeiSn: editImei.trim(),
            noKtp: editNoKtp.trim(), telp1: editTelp1.trim(),
            // Financial fields (cermin etSimpanGadai payload)
            taksiran: editTaksiran,
            jumlahGadai: editJumlahGadai,
            ujrahPersen: editUjrahPersen,
            ujrahNominal: editUjrahNominal,
            payment: editPayment,
            cash: editPayment === 'SPLIT' ? (parseFloat(editCash) || 0) : 0,
            bank: editPayment === 'SPLIT' ? (parseFloat(editBank) || 0) : 0,
          }),
        });
        const json = await res.json();
        if (json.ok) { setMsg('Data berhasil diupdate'); setMsgType('ok'); doSearch(); }
        else { setMsg(json.msg || 'Gagal update'); setMsgType('err'); }
      } catch (e) { setMsg('Error: ' + (e as Error).message); setMsgType('err'); }
    });
    setPinOpen(true);
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 1: DELETE / BATALKAN KONTRAK (cermin etEksekusiBatal di GAS)
  // ══════════════════════════════════════════════════════════════
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
        if (json.ok) { setMsg('Kontrak berhasil dibatalkan. Kas sudah di-reverse.'); setMsgType('ok'); doSearch(); }
        else { setMsg(json.msg || 'Gagal hapus'); setMsgType('err'); }
      } catch (e) { setMsg('Error: ' + (e as Error).message); setMsgType('err'); }
    });
    setPinOpen(true);
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 2: SEARCH TEBUS (cermin etCariTebus di GAS)
  // ══════════════════════════════════════════════════════════════
  function requestTebusSearch() {
    const q = tebusSearchInput.trim().toUpperCase();
    if (!q) { setTebusSearchError('No kontrak wajib diisi.'); return; }
    setPinAction(`Cari tebus ${q}`);
    setPendingAction(() => async (pin: string) => {
      setTebusSearching(true); setTebusSearchError(''); setTebusResults([]); setTebusMsg(''); setTebusMsgs({});
      try {
        const res = await fetch('/api/edit/tebus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
          body: JSON.stringify({ pin, noKontrak: q }),
        });
        const json = await res.json();
        if (!json.ok) { setTebusSearchError(json.msg); setTebusSearching(false); return; }
        setTebusResults(json.results);
        // Initialize edit state for each result
        const edits: Record<string, any> = {};
        for (const t of json.results) {
          edits[t.idTebus] = {
            jumlahBayar: String(t.jumlahBayar),
            payment: t.payment || 'CASH',
            cash: '',
            bank: '',
          };
        }
        setTebusEdits(edits);
      } catch (e) { setTebusSearchError('Error: ' + (e as Error).message); }
      setTebusSearching(false);
    });
    setPinOpen(true);
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 2: SAVE TEBUS EDIT (cermin etSimpanTebus di GAS)
  // ══════════════════════════════════════════════════════════════
  function requestTebusSave(idTebus: string, tipe: string) {
    const edit = tebusEdits[idTebus];
    if (!edit) return;
    setPinAction(`Edit tebus ${idTebus}`);
    setPendingAction(() => async (pin: string) => {
      try {
        const res = await fetch('/api/edit/tebus', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
          body: JSON.stringify({
            pin, idTebus, tipe,
            jumlahBayar: edit.jumlahBayar,
            payment: edit.payment,
            cash: edit.payment === 'SPLIT' ? (parseFloat(edit.cash) || 0) : 0,
            bank: edit.payment === 'SPLIT' ? (parseFloat(edit.bank) || 0) : 0,
          }),
        });
        const json = await res.json();
        setTebusMsgs(prev => ({ ...prev, [idTebus]: { msg: json.msg || (json.ok ? 'Berhasil' : 'Gagal'), type: json.ok ? 'ok' : 'err' } }));
        if (json.ok) {
          // Re-search to refresh data
          setTimeout(() => {
            setTebusMsgs(prev => { const n = { ...prev }; delete n[idTebus]; return n; });
          }, 3000);
        }
      } catch (e) {
        setTebusMsgs(prev => ({ ...prev, [idTebus]: { msg: 'Error: ' + (e as Error).message, type: 'err' } }));
      }
    });
    setPinOpen(true);
  }

  // ══════════════════════════════════════════════════════════════
  // TAB 2: BATAL TEBUS (cermin etEksekusiBatalTebus di GAS)
  // ══════════════════════════════════════════════════════════════
  function requestTebusBatal(idTebus: string, tipe: string, noFaktur: string) {
    if (!confirm(
      `YAKIN batalkan tebus ${idTebus}?\n\n` +
      `Ini akan:\n- Set status tebus = BATAL\n- Kembalikan status kontrak ${noFaktur} ke AKTIF\n- Reverse entri kas\n\nTIDAK BISA DI-UNDO.`
    )) return;

    setPinAction(`BATAL tebus ${idTebus}`);
    setPendingAction(() => async (pin: string) => {
      try {
        const res = await fetch('/api/edit/tebus', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
          body: JSON.stringify({ pin, idTebus, tipe }),
        });
        const json = await res.json();
        setTebusMsgs(prev => ({ ...prev, [idTebus]: { msg: json.msg || (json.ok ? 'Berhasil' : 'Gagal'), type: json.ok ? 'ok' : 'err' } }));
        if (json.ok) {
          // Remove from results
          setTebusResults(prev => prev.filter(t => t.idTebus !== idTebus));
        }
      } catch (e) {
        setTebusMsgs(prev => ({ ...prev, [idTebus]: { msg: 'Error: ' + (e as Error).message, type: 'err' } }));
      }
    });
    setPinOpen(true);
  }

  // ── Helper: update per-entry edit state ─────────────────────
  function updateTebusEdit(id: string, field: string, value: string) {
    setTebusEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
  }

  // ══════════════════════════════════════════════════════════════
  // ACCESS GUARD
  // ══════════════════════════════════════════════════════════════
  if (!isAdminOrOwner) {
    return (
      <AppShell title="Edit Transaksi" subtitle="ADMIN/OWNER only">
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text3)' }}>
          Halaman ini hanya untuk Admin / Owner
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Edit Transaksi" subtitle="Edit data & batalkan kontrak (ADMIN/OWNER)">
      {/* ── Tabs ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div onClick={() => setActiveTab(1)}
          style={{ padding: '10px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            color: activeTab === 1 ? 'var(--accent)' : 'var(--text3)',
            borderBottom: `3px solid ${activeTab === 1 ? 'var(--accent)' : 'transparent'}`, marginBottom: -2 }}>
          Edit Gadai / SJB
        </div>
        <div onClick={() => setActiveTab(2)}
          style={{ padding: '10px 20px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            color: activeTab === 2 ? 'var(--accent)' : 'var(--text3)',
            borderBottom: `3px solid ${activeTab === 2 ? 'var(--accent)' : 'transparent'}`, marginBottom: -2 }}>
          Edit Tebus
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB 1: EDIT GADAI / SJB                          */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 1 && (
          <>
            {/* Search */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
                Cari Kontrak
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={searchInput} onChange={e => setSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && doSearch()}
                  placeholder="No Faktur / Barcode" style={{ flex: 1, fontFamily: 'var(--mono)' }} />
                <button className="btn btn-primary" onClick={doSearch} disabled={searching}>
                  {searching ? '...' : 'Cari'}
                </button>
              </div>
              {searchError && <div className="alert-error" style={{ marginTop: 8 }}>{searchError}</div>}
            </div>

            {/* Result */}
            {gadaiData && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                  <div>
                    <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 14, color: 'var(--accent)' }}>{gadaiData.no_faktur}</span>
                    {gadaiData._source && (
                      <span className={`badge ${gadaiData._source === 'SJB' ? 'sjb' : 'aktif'}`} style={{ marginLeft: 8 }}>{gadaiData._source}</span>
                    )}
                    <span className={`badge ${(gadaiData.status || '').toLowerCase()}`} style={{ marginLeft: 4 }}>{gadaiData.status}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {gadaiData.outlet} &bull; {formatDate(gadaiData.tgl_gadai)}
                  </div>
                </div>

                {/* Info read-only grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: '6px 16px', marginBottom: 14 }}>
                  {[
                    ['Kategori', gadaiData.kategori],
                    ['Jatuh Tempo', formatDate(gadaiData.tgl_jt)],
                    ['Kasir', gadaiData.kasir],
                    ['Rak', gadaiData.rak || '—'],
                  ].map(([l, v]) => (
                    <div key={l as string}>
                      <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 1 }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{v}</div>
                    </div>
                  ))}
                </div>

                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />

                {/* Editable Fields - Text */}
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
                  Edit Data
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10, marginBottom: 14 }}>
                  <div className="form-group"><label>Nama</label><input value={editNama} onChange={e => setEditNama(e.target.value.toUpperCase())} /></div>
                  <div className="form-group"><label>Barang</label><input value={editBarang} onChange={e => setEditBarang(e.target.value.toUpperCase())} /></div>
                  <div className="form-group"><label>Kelengkapan</label><input value={editKelengkapan} onChange={e => setEditKelengkapan(e.target.value)} /></div>
                  <div className="form-group"><label>IMEI / SN</label><input value={editImei} onChange={e => setEditImei(e.target.value)} /></div>
                  <div className="form-group"><label>No KTP</label><input value={editNoKtp} onChange={e => setEditNoKtp(e.target.value)} /></div>
                  <div className="form-group"><label>Telepon</label><input value={editTelp1} onChange={e => setEditTelp1(e.target.value)} /></div>
                </div>

                {/* Editable Fields - Financial (NEW — cermin GAS edittransaksi.html) */}
                <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 10 }}>
                  Edit Finansial
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10, marginBottom: 14 }}>
                  <div className="form-group">
                    <label>Taksiran (Rp)</label>
                    <input type="number" value={editTaksiran} onChange={e => setEditTaksiran(e.target.value)} min="0" />
                  </div>
                  <div className="form-group">
                    <label>{gadaiData._source === 'SJB' ? 'Harga Jual (Rp)' : 'Jumlah Gadai (Rp)'}</label>
                    <input type="number" value={editJumlahGadai} onChange={e => setEditJumlahGadai(e.target.value)} min="0" />
                  </div>
                  <div className="form-group">
                    <label>Ujrah % / bulan</label>
                    <input type="number" value={editUjrahPersen} onChange={e => setEditUjrahPersen(e.target.value)} min="0" max="100" step="0.01" />
                  </div>
                  <div className="form-group">
                    <label>Ujrah Nominal (Rp)</label>
                    <input type="number" value={editUjrahNominal} onChange={e => setEditUjrahNominal(e.target.value)} min="0" />
                  </div>
                  <div className="form-group">
                    <label>Jenis Pembayaran</label>
                    <select value={editPayment} onChange={e => setEditPayment(e.target.value)}>
                      <option value="CASH">CASH</option>
                      <option value="BANK">BANK (Transfer)</option>
                      <option value="SPLIT">SPLIT (Cash & Bank)</option>
                    </select>
                  </div>
                </div>

                {/* SPLIT fields */}
                {editPayment === 'SPLIT' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                    <div className="form-group">
                      <label>Bagian Cash (Rp)</label>
                      <input type="number" value={editCash} onChange={e => setEditCash(e.target.value)} min="0" placeholder="0" />
                    </div>
                    <div className="form-group">
                      <label>Bagian Bank (Rp)</label>
                      <input type="number" value={editBank} onChange={e => setEditBank(e.target.value)} min="0" placeholder="0" />
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <button className="btn btn-primary" onClick={requestEditSave}>Simpan Perubahan</button>
                  {gadaiData.status === 'AKTIF' && (
                    <button className="btn btn-danger" onClick={requestDelete}>Batalkan Kontrak</button>
                  )}
                </div>

                {/* Warning for AKTIF contracts */}
                {gadaiData.status === 'AKTIF' && (
                  <div style={{ background: 'rgba(239,68,68,.07)', border: '1px solid rgba(239,68,68,.25)', borderRadius: 8, padding: 12, fontSize: 11, color: '#dc2626', marginTop: 10 }}>
                    <b>PERHATIAN:</b> Batalkan kontrak akan set status = BATAL, reverse semua entri kas terkait, dan dicatat di audit log. Aksi ini TIDAK BISA DI-UNDO.
                  </div>
                )}

                {/* Warning for financial edits */}
                <div style={{ background: 'rgba(245,158,11,.07)', border: '1px solid rgba(245,158,11,.25)', borderRadius: 8, padding: 12, fontSize: 11, color: '#b45309', marginTop: 10 }}>
                  <b>INFO:</b> Jika Jumlah Gadai atau Jenis Pembayaran diubah, sistem akan otomatis reverse kas lama dan generate kas baru.
                </div>

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
          </>
        )}

        {/* ══════════════════════════════════════════════════ */}
        {/* TAB 2: EDIT TEBUS                                */}
        {/* ══════════════════════════════════════════════════ */}
        {activeTab === 2 && (
          <>
            {/* Search */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
                Cari Transaksi Tebus
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={tebusSearchInput} onChange={e => setTebusSearchInput(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && requestTebusSearch()}
                  placeholder="No Kontrak (SBR001 / SJB001)" style={{ flex: 1, fontFamily: 'var(--mono)' }} />
                <button className="btn btn-primary" onClick={requestTebusSearch} disabled={tebusSearching}>
                  {tebusSearching ? '...' : 'Cari'}
                </button>
              </div>
              {tebusSearchError && <div className="alert-error" style={{ marginTop: 8 }}>{tebusSearchError}</div>}
            </div>

            {/* Results */}
            {tebusResults.length > 0 && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 12 }}>
                  Riwayat Tebus ({tebusResults.length} transaksi)
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tebusResults.map(t => {
                    const edit = tebusEdits[t.idTebus] || {};
                    const entryMsg = tebusMsgs[t.idTebus];
                    return (
                      <div key={t.idTebus} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                          <div>
                            <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700 }}>{t.idTebus}</span>
                            <span className={`badge ${(t.status || '').toLowerCase()}`} style={{ marginLeft: 6 }}>{t.status}</span>
                            <span style={{
                              display: 'inline-block', padding: '3px 8px', borderRadius: 12, fontSize: 10, fontWeight: 700,
                              background: 'rgba(99,102,241,.12)', color: '#4f46e5', marginLeft: 4,
                            }}>{t.tipe}</span>
                          </div>
                          <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                            {formatDate(t.tgl)} &bull; Kasir: {t.kasir}
                          </div>
                        </div>

                        {/* Info */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: '4px 12px', marginBottom: 10 }}>
                          <div><div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)' }}>Nasabah</div><div style={{ fontSize: 12, fontWeight: 600 }}>{t.nama}</div></div>
                          <div><div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)' }}>Barang</div><div style={{ fontSize: 12, fontWeight: 600 }}>{t.barang}</div></div>
                          <div><div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)' }}>Jumlah Gadai</div><div style={{ fontSize: 12, fontWeight: 600 }}>{formatRp(t.jumlahGadai)}</div></div>
                          <div><div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)' }}>Ujrah</div><div style={{ fontSize: 12, fontWeight: 600 }}>{formatRp(t.ujrahBerjalan)}</div></div>
                        </div>

                        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '8px 0' }} />

                        {/* Editable fields (cermin GAS edittransaksi.html Tab 2) */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 10, marginBottom: 10 }}>
                          <div className="form-group">
                            <label>Jumlah Bayar (Rp)</label>
                            <input type="number" value={edit.jumlahBayar ?? ''} min="0"
                              onChange={e => updateTebusEdit(t.idTebus, 'jumlahBayar', e.target.value)} />
                          </div>
                          <div className="form-group">
                            <label>Jenis Pembayaran</label>
                            <select value={edit.payment ?? 'CASH'}
                              onChange={e => updateTebusEdit(t.idTebus, 'payment', e.target.value)}>
                              <option value="CASH">CASH</option>
                              <option value="BANK">BANK (Transfer)</option>
                              <option value="SPLIT">SPLIT (Cash & Bank)</option>
                            </select>
                          </div>
                        </div>

                        {/* SPLIT fields */}
                        {edit.payment === 'SPLIT' && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
                            <div className="form-group">
                              <label>Bagian Cash (Rp)</label>
                              <input type="number" value={edit.cash ?? ''} min="0" placeholder="0"
                                onChange={e => updateTebusEdit(t.idTebus, 'cash', e.target.value)} />
                            </div>
                            <div className="form-group">
                              <label>Bagian Bank (Rp)</label>
                              <input type="number" value={edit.bank ?? ''} min="0" placeholder="0"
                                onChange={e => updateTebusEdit(t.idTebus, 'bank', e.target.value)} />
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                          <button className="btn btn-primary btn-sm" onClick={() => requestTebusSave(t.idTebus, t.tipe)}>
                            Simpan
                          </button>
                          <div style={{ flex: 1 }} />
                          <button className="btn btn-danger btn-sm" onClick={() => requestTebusBatal(t.idTebus, t.tipe, t.noFaktur)}>
                            Batalkan Tebus
                          </button>
                        </div>

                        {/* Per-entry message */}
                        {entryMsg && (
                          <div style={{
                            padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, marginTop: 8,
                            background: entryMsg.type === 'ok' ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.1)',
                            color: entryMsg.type === 'ok' ? '#059669' : '#dc2626',
                            border: `1px solid ${entryMsg.type === 'ok' ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.25)'}`,
                          }}>{entryMsg.msg}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Tebus global message */}
                {tebusMsg && (
                  <div style={{
                    padding: '8px 12px', borderRadius: 6, fontSize: 12, fontWeight: 600, marginTop: 10,
                    background: tebusMsgType === 'ok' ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.1)',
                    color: tebusMsgType === 'ok' ? '#059669' : '#dc2626',
                    border: `1px solid ${tebusMsgType === 'ok' ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.25)'}`,
                  }}>{tebusMsg}</div>
                )}
              </div>
            )}
          </>
        )}

      </div>

      <PinModal open={pinOpen} action={pinAction}
        onSuccess={(pin, kasir) => { setPinOpen(false); pendingAction?.(pin, kasir); }}
        onCancel={() => setPinOpen(false)} />
    </AppShell>
  );
}
