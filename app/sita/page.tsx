'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Gudang Sita
// File: app/sita/page.tsx
// Migrasi dari gudangsita.html (GAS)
// Tab 1: Gudang Sita  |  Tab 2: Gudang Aset  |  Tab 3: Riwayat Jual  |  Tab 4: Riwayat BAST
// API: GET /api/gudang/sita, /api/gudang/aset, dll
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useOutletId, useAuth } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';
import { printBAST, printJualBon } from '@/lib/print';

type GudangTab = 1 | 2 | 3 | 4;
const TABS = [
  { id: 1, icon: '🔒', label: 'Gudang Sita' },
  { id: 2, icon: '🏦', label: 'Gudang Aset' },
  { id: 3, icon: '🧾', label: 'Riwayat Jual' },
  { id: 4, icon: '📋', label: 'Riwayat BAST' },
];

export default function GudangSitaPage() {
  const outletId = useOutletId();
  const { isAdminOrOwner } = useAuth();
  const [activeTab, setActiveTab] = useState<GudangTab>(1);

  // Tab 1: Gudang Sita
  const [sitaRows, setSitaRows] = useState<any[]>([]);
  const [sitaLoading, setSitaLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Tab 2: Gudang Aset
  const [asetRows, setAsetRows] = useState<any[]>([]);
  const [asetLoading, setAsetLoading] = useState(false);
  const [selectedAset, setSelectedAset] = useState<Set<string>>(new Set());
  const [hargaMap, setHargaMap] = useState<Record<string, string>>({});
  const [catatanJual, setCatatanJual] = useState('');

  // Tab 3: Riwayat Jual
  const [jualRows, setJualRows] = useState<any[]>([]);
  const [jualLoading, setJualLoading] = useState(false);

  // Tab 4: Riwayat BAST
  const [bastRows, setBastRows] = useState<any[]>([]);
  const [bastLoading, setBastLoading] = useState(false);

  // PIN
  const [pinOpen, setPinOpen] = useState(false);
  const [pinAction, setPinAction] = useState('');
  const [pendingAction, setPendingAction] = useState<((pin: string, kasir: string) => void) | null>(null);

  const loadSita = useCallback(async () => {
    setSitaLoading(true);
    try {
      const res = await fetch(`/api/gudang/sita?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) setSitaRows(json.rows || []);
    } catch { /* silent */ }
    setSitaLoading(false);
  }, [outletId]);

  const loadAset = useCallback(async () => {
    setAsetLoading(true);
    try {
      const res = await fetch(`/api/gudang/aset?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) setAsetRows(json.rows || []);
    } catch { /* silent */ }
    setAsetLoading(false);
  }, [outletId]);

  const loadJual = useCallback(async () => {
    setJualLoading(true);
    try {
      const res = await fetch(`/api/gudang/jual?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) setJualRows(json.rows || []);
    } catch { /* silent */ }
    setJualLoading(false);
  }, [outletId]);

  const loadBast = useCallback(async () => {
    setBastLoading(true);
    try {
      const res = await fetch(`/api/gudang/bast?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) setBastRows(json.rows || []);
    } catch { /* silent */ }
    setBastLoading(false);
  }, [outletId]);

  useEffect(() => {
    if (activeTab === 1) loadSita();
    else if (activeTab === 2) loadAset();
    else if (activeTab === 3) loadJual();
    else if (activeTab === 4) loadBast();
  }, [activeTab, loadSita, loadAset, loadJual, loadBast]);

  // Toggle selection
  const toggleSelect = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelected(s);
  };

  // Serah terima (BAST)
  function requestSerahTerima() {
    if (selected.size === 0) return;
    setPinAction(`Serah Terima ${selected.size} barang`);
    setPendingAction(() => async (pin: string, _kasir: string) => {
      try {
        const res = await fetch('/api/gudang/serah-terima', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
          body: JSON.stringify({ pin, sitaIds: Array.from(selected) }),
        });
        const json = await res.json();
        if (json.ok) {
          setSelected(new Set()); loadSita(); loadAset(); loadBast();
          // Auto-print BAST
          printBAST({
            noBA: json.noBA, tgl: json.tgl, kasir: json.kasir,
            items: json.items || [], totalModal: json.totalModal || 0,
            outlet: json.outlet || '', alamat: json.alamat || '',
            kota: json.kota || '', telpon: json.telpon || '',
            namaPerusahaan: json.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
            statusKepalaGudang: json.statusKepalaGudang || '',
          });
        } else alert(json.msg || 'Gagal');
      } catch (e) { alert('Error: ' + (e as Error).message); }
    });
    setPinOpen(true);
  }

  // Reprint BAST (dari Tab 4 riwayat)
  async function reprintBAST(noBA: string) {
    try {
      const res = await fetch(`/api/gudang/bast?outletId=${outletId}&noBA=${encodeURIComponent(noBA)}`);
      const json = await res.json();
      if (!json.ok) { alert(json.msg || 'Gagal memuat BAST'); return; }
      printBAST({
        noBA: json.header.noBA, tgl: json.header.tgl, kasir: json.header.kasir || '',
        items: json.items || [], totalModal: json.totalModal || 0,
        outlet: json.outlet || '', alamat: json.alamat || '',
        kota: json.kota || '', telpon: json.telpon || '',
        namaPerusahaan: json.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
        statusKepalaGudang: json.statusKepalaGudang || '',
      });
    } catch (e) { alert('Error: ' + (e as Error).message); }
  }

  // Toggle select aset + set default harga
  function toggleSelectAset(id: string, modal: number) {
    const s = new Set(selectedAset);
    if (s.has(id)) s.delete(id); else s.add(id);
    setSelectedAset(s);
    if (!hargaMap[id]) setHargaMap(prev => ({ ...prev, [id]: String(modal || '') }));
  }

  // Jual Bon (dari Tab 2 aset → pilih + harga jual)
  function requestJualBon() {
    if (selectedAset.size === 0) return;
    // Build items payload
    const items = Array.from(selectedAset).map(id => ({
      id_aset: id, harga_jual: parseFloat((hargaMap[id] || '').replace(/[^\d.]/g, '')) || 0,
    }));
    const bad = items.find(it => !it.harga_jual || it.harga_jual <= 0);
    if (bad) { alert('Isi harga jual untuk semua aset terpilih.'); return; }

    setPinAction(`Jual ${selectedAset.size} barang`);
    setPendingAction(() => async (pin: string, _kasir: string) => {
      try {
        const res = await fetch('/api/gudang/jual', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
          body: JSON.stringify({ pin, items, catatan: catatanJual }),
        });
        const json = await res.json();
        if (json.ok) {
          setSelectedAset(new Set()); setHargaMap({}); setCatatanJual('');
          loadAset(); loadJual();
          printJualBon({
            noBon: json.noBon, tgl: json.tgl, kasir: json.kasir,
            items: json.items || [],
            totalModal: json.totalModal || 0, totalJual: json.totalJual || 0, totalLaba: json.totalLaba || 0,
            catatan: json.catatan || '',
            outlet: json.outlet || '', alamat: json.alamat || '',
            kota: json.kota || '', telpon: json.telpon || '',
            namaPerusahaan: json.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
          });
        } else alert(json.msg || 'Gagal');
      } catch (e) { alert('Error: ' + (e as Error).message); }
    });
    setPinOpen(true);
  }

  // Reprint jual bon (dari Tab 3)
  async function reprintJualBon(noBon: string) {
    try {
      const res = await fetch(`/api/gudang/jual?outletId=${outletId}&noBon=${encodeURIComponent(noBon)}`);
      const json = await res.json();
      if (!json.ok) { alert(json.msg || 'Gagal memuat bon'); return; }
      printJualBon({
        noBon: json.header.noBon, tgl: json.header.tgl, kasir: json.header.kasir || '',
        items: json.items || [],
        totalModal: json.header.totalModal || 0,
        totalJual: json.header.totalJual || 0,
        totalLaba: json.header.totalLaba || 0,
        catatan: json.header.catatan || '',
        outlet: json.outlet || '', alamat: json.alamat || '',
        kota: json.kota || '', telpon: json.telpon || '',
        namaPerusahaan: json.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
      });
    } catch (e) { alert('Error: ' + (e as Error).message); }
  }

  const totalSitaModal = sitaRows.reduce((s: number, r: any) => s + (r.taksiran_modal || 0), 0);

  return (
    <AppShell title="🔒 Gudang Sita" subtitle="Kelola barang sitaan & aset">
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        {TABS.map(t => (
          <div key={t.id} onClick={() => setActiveTab(t.id as GudangTab)}
            style={{ padding: '10px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              color: activeTab === t.id ? 'var(--accent)' : 'var(--text3)',
              borderBottom: `2px solid ${activeTab === t.id ? 'var(--accent)' : 'transparent'}`, marginBottom: -2 }}>
            {t.icon} {t.label}
          </div>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {/* TAB 1: Gudang Sita */}
        {activeTab === 1 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
              <button className="btn btn-primary btn-sm" onClick={loadSita}>🔄 Refresh</button>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{sitaRows.length} barang sitaan</span>
              {selected.size > 0 && isAdminOrOwner && (
                <button className="btn btn-success btn-sm" onClick={requestSerahTerima}>
                  📋 Serah Terima ({selected.size} barang)
                </button>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 12 }}>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Jumlah</div>
                <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--mono)' }}>{sitaRows.length}</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Total Modal</div>
                <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--warn)' }}>{formatRp(totalSitaModal)}</div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Terpilih</div>
                <div style={{ fontSize: 15, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{selected.size}</div>
              </div>
            </div>

            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th style={{ width: 30 }}></th>
                  <th>No Faktur</th><th>Nama</th><th>Barang</th><th>Kategori</th>
                  <th className="num">Modal</th><th>Tgl Sita</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {sitaLoading ? (
                    <tr><td colSpan={8} className="empty-state">⏳ Memuat...</td></tr>
                  ) : sitaRows.length === 0 ? (
                    <tr><td colSpan={8} className="empty-state">Tidak ada barang sitaan</td></tr>
                  ) : sitaRows.map((r: any) => (
                    <tr key={r.sita_id} style={{ background: selected.has(r.sita_id) ? 'rgba(99,102,241,.08)' : undefined }}>
                      <td style={{ padding: '7px 8px' }}>
                        <input type="checkbox" checked={selected.has(r.sita_id)}
                          onChange={() => toggleSelect(r.sita_id)} style={{ width: 15, height: 15, cursor: 'pointer' }} />
                      </td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_faktur}</td>
                      <td>{r.nama_nasabah || '—'}</td>
                      <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.barang}</td>
                      <td>{r.kategori}</td>
                      <td className="num">{formatRp(r.taksiran_modal)}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl_sita)}</td>
                      <td><span className="badge sita">{r.status_gudang}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TAB 2: Gudang Aset */}
        {activeTab === 2 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={loadAset}>🔄 Refresh</button>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{asetRows.length} aset siap jual</span>
              {selectedAset.size > 0 && isAdminOrOwner && (
                <>
                  <input type="text" placeholder="Catatan (opsional)" value={catatanJual}
                    onChange={e => setCatatanJual(e.target.value)}
                    style={{ fontSize: 11, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface2)', color: 'var(--text)', minWidth: 200 }} />
                  <button className="btn btn-success btn-sm" onClick={requestJualBon}>
                    🧾 Jual ({selectedAset.size} barang)
                  </button>
                </>
              )}
            </div>
            {selectedAset.size > 0 && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 8 }}>
                💡 Isi <b>Harga Jual</b> untuk setiap baris terpilih (default = modal).
              </div>
            )}
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  {isAdminOrOwner && <th style={{ width: 30 }}></th>}
                  <th>No BA</th><th>No Faktur</th><th>Nasabah</th><th>Barang</th><th>Kategori</th>
                  <th className="num">Modal</th>
                  {isAdminOrOwner && <th className="num" style={{ minWidth: 120 }}>Harga Jual</th>}
                  <th>Tgl Masuk</th><th>Status</th>
                </tr></thead>
                <tbody>
                  {asetLoading ? (
                    <tr><td colSpan={isAdminOrOwner ? 10 : 8} className="empty-state">⏳ Memuat...</td></tr>
                  ) : asetRows.length === 0 ? (
                    <tr><td colSpan={isAdminOrOwner ? 10 : 8} className="empty-state">Tidak ada aset</td></tr>
                  ) : asetRows.map((r: any, i: number) => (
                    <tr key={r.id_aset || i} style={{ background: selectedAset.has(r.id_aset) ? 'rgba(34,197,94,.08)' : undefined }}>
                      {isAdminOrOwner && (
                        <td style={{ padding: '7px 8px' }}>
                          <input type="checkbox" checked={selectedAset.has(r.id_aset)}
                            onChange={() => toggleSelectAset(r.id_aset, r.taksiran_modal)}
                            style={{ width: 15, height: 15, cursor: 'pointer' }} />
                        </td>
                      )}
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_ba || '—'}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_faktur || '—'}</td>
                      <td>{r.nama_nasabah || '—'}</td>
                      <td>{r.barang || '—'}</td>
                      <td>{r.kategori || '—'}</td>
                      <td className="num">{formatRp(r.taksiran_modal)}</td>
                      {isAdminOrOwner && (
                        <td className="num">
                          {selectedAset.has(r.id_aset) ? (
                            <input type="number" min={0} step={1000}
                              value={hargaMap[r.id_aset] || ''}
                              onChange={e => setHargaMap(prev => ({ ...prev, [r.id_aset]: e.target.value }))}
                              placeholder="Harga jual"
                              style={{ width: 110, padding: '4px 8px', fontSize: 11, textAlign: 'right', fontFamily: 'var(--mono)', border: '1px solid var(--border)', borderRadius: 4, background: 'var(--surface2)', color: 'var(--text)' }} />
                          ) : <span style={{ color: 'var(--text3)' }}>—</span>}
                        </td>
                      )}
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl_masuk)}</td>
                      <td><span className="badge aktif">{r.status_aset}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TAB 3: Riwayat Jual */}
        {activeTab === 3 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={loadJual}>🔄 Refresh</button>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th>No Bon</th><th>Tgl</th><th>Kasir</th><th className="num">Item</th>
                  <th className="num">Modal</th><th className="num">Jual</th><th className="num">Laba</th>
                  <th style={{ width: 80 }}></th>
                </tr></thead>
                <tbody>
                  {jualLoading ? (
                    <tr><td colSpan={8} className="empty-state">⏳ Memuat...</td></tr>
                  ) : jualRows.length === 0 ? (
                    <tr><td colSpan={8} className="empty-state">Belum ada riwayat</td></tr>
                  ) : jualRows.map((r: any, i: number) => (
                    <tr key={r.id_bon || i}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_bon}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl)}</td>
                      <td>{r.kasir || '—'}</td>
                      <td className="num">{r.jumlah_item}</td>
                      <td className="num">{formatRp(r.total_modal)}</td>
                      <td className="num">{formatRp(r.total_jual)}</td>
                      <td className="num" style={{ color: 'var(--green)', fontWeight: 700 }}>{formatRp(r.laba)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => reprintJualBon(r.no_bon)} title="Cetak ulang">🖨️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* TAB 4: Riwayat BAST */}
        {activeTab === 4 && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button className="btn btn-primary btn-sm" onClick={loadBast}>🔄 Refresh</button>
            </div>
            <div className="tbl-wrap">
              <table>
                <thead><tr>
                  <th>No BA</th><th>Tgl</th><th>Kasir</th><th className="num">Item</th><th>Status</th>
                  <th style={{ width: 80 }}></th>
                </tr></thead>
                <tbody>
                  {bastLoading ? (
                    <tr><td colSpan={6} className="empty-state">⏳ Memuat...</td></tr>
                  ) : bastRows.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state">Belum ada BAST</td></tr>
                  ) : bastRows.map((r: any, i: number) => (
                    <tr key={r.id_ba || i}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_ba}</td>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl)}</td>
                      <td>{r.kasir || '—'}</td>
                      <td className="num">{r.jumlah_item}</td>
                      <td><span className="badge aktif">{r.status}</span></td>
                      <td style={{ textAlign: 'center' }}>
                        <button className="btn btn-primary btn-sm" onClick={() => reprintBAST(r.no_ba)} title="Cetak ulang">🖨️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <PinModal open={pinOpen} action={pinAction}
        onSuccess={(pin, kasir) => { setPinOpen(false); pendingAction?.(pin, kasir); }}
        onCancel={() => setPinOpen(false)} />
    </AppShell>
  );
}
