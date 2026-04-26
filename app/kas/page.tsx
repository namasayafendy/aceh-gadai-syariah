'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Buku Kas
// File: app/kas/page.tsx
// Migrasi dari bukukas.html (GAS)
// ALUR KAS TIDAK DIUBAH — display only
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useAuth } from '@/components/auth/AuthProvider';
import { formatRp, formatMoneyInput, parseMoney, todayISO } from '@/lib/format';

interface KasRow {
  id: string; tgl: string; no_ref: string; keterangan: string;
  tipe: string; tipe_kas: string; jumlah: number;
  sumber: string; kasir: string;
}

export default function BukuKasPage() {
  const { outletId, isAdminOrOwner } = useAuth();

  // Data
  const [rows, setRows] = useState<KasRow[]>([]);
  const [saldo, setSaldo] = useState({ cash: 0, bank: 0 });
  const [totalMasuk, setTotalMasuk] = useState(0);
  const [totalKeluar, setTotalKeluar] = useState(0);
  const [loading, setLoading] = useState(false);

  // Filter
  const [dateFrom, setDateFrom] = useState(todayISO());
  const [dateTo, setDateTo] = useState(todayISO());
  const [filterKas, setFilterKas] = useState('');
  const [filterTipe, setFilterTipe] = useState('');  // '' | MASUK | KELUAR

  // Manual entry
  const [mTipe, setMTipe] = useState('MASUK');
  const [mKas, setMKas] = useState('CASH');
  const [mJumlahRaw, setMJumlahRaw] = useState('');
  const [mKet, setMKet] = useState('');
  const [mRef, setMRef] = useState('');
  const [mError, setMError] = useState('');
  const [mSubmitting, setMSubmitting] = useState(false);
  const [mPinOpen, setMPinOpen] = useState(false);

  // Saldo awal
  const [saCashRaw, setSaCashRaw] = useState('');
  const [saBankRaw, setSaBankRaw] = useState('');
  const [saError, setSaError] = useState('');
  const [saPinOpen, setSaPinOpen] = useState(false);

  // ── Load kas data ──────────────────────────────────────
  const loadKas = useCallback(async () => {
    setLoading(true);
    try {
      let url = `/api/kas?outletId=${outletId}`;
      if (dateFrom) url += `&tglFrom=${dateFrom}`;
      if (dateTo) url += `&tglTo=${dateTo}`;
      if (filterKas) url += `&filter=${filterKas}`;
      if (filterTipe) url += `&filterTipe=${filterTipe}`;
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok) {
        setRows(json.rows || []);
        setSaldo(json.saldo || { cash: 0, bank: 0 });
        setTotalMasuk(json.totalMasuk || 0);
        setTotalKeluar(json.totalKeluar || 0);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [outletId, dateFrom, dateTo, filterKas, filterTipe]);

  useEffect(() => { loadKas(); }, [loadKas]);

  // ── Manual entry ───────────────────────────────────────
  function requestManualEntry() {
    const jumlah = parseMoney(mJumlahRaw);
    if (!jumlah) { setMError('Isi jumlah'); return; }
    if (!mKet.trim()) { setMError('Isi keterangan'); return; }
    setMError(''); setMPinOpen(true);
  }

  async function doManualEntry(pin: string, kasirName: string) {
    setMPinOpen(false); setMSubmitting(true); setMError('');
    try {
      const res = await fetch('/api/kas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({
          pin, tipe: mTipe, tipeKas: mKas, jumlah: parseMoney(mJumlahRaw),
          keterangan: mKet.trim(), noRef: mRef.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) { setMError(json.msg || 'Gagal'); setMSubmitting(false); return; }
      setMJumlahRaw(''); setMKet(''); setMRef('');
      loadKas();
    } catch (e) { setMError('Error: ' + (e as Error).message); }
    setMSubmitting(false);
  }

  // ── Saldo awal ─────────────────────────────────────────
  function requestSaldoAwal() {
    const c = parseMoney(saCashRaw), b = parseMoney(saBankRaw);
    if (!c && !b) { setSaError('Isi minimal salah satu'); return; }
    setSaError(''); setSaPinOpen(true);
  }

  async function doSaldoAwal(pin: string) {
    setSaPinOpen(false); setSaError('');
    try {
      const res = await fetch('/api/kas/saldo-awal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({ pin, cash: parseMoney(saCashRaw), bank: parseMoney(saBankRaw) }),
      });
      const json = await res.json();
      if (!json.ok) { setSaError(json.msg || 'Gagal'); return; }
      setSaCashRaw(''); setSaBankRaw('');
      loadKas();
    } catch (e) { setSaError('Error: ' + (e as Error).message); }
  }

  return (
    <AppShell title="Buku Kas" subtitle="Entri kas & running balance">
      <div style={{ display: 'flex', gap: 20, height: '100%', overflow: 'hidden' }}>
        {/* LEFT PANEL */}
        <div style={{ width: 260, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto', padding: '20px 0 20px 20px' }}>

          {/* Saldo */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 12 }}>💰 Saldo Kas</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Cash</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--green)' }}>{formatRp(saldo.cash)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>Bank</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{formatRp(saldo.bank)}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11 }}>Total</span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{formatRp(saldo.cash + saldo.bank)}</span>
            </div>
          </div>

          {/* Set Saldo Awal - Admin/Owner only */}
          {isAdminOrOwner && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 12 }}>⚙️ Set Saldo Awal</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 10, lineHeight: 1.5 }}>Hanya Owner/Admin. Akan hapus & ganti saldo awal sebelumnya.</div>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Cash</div>
                <input value={saCashRaw} inputMode="numeric" placeholder="0" onChange={e => setSaCashRaw(formatMoneyInput(e.target.value))}
                  style={{ fontSize: 12, padding: '7px 10px' }} />
              </div>
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Bank</div>
                <input value={saBankRaw} inputMode="numeric" placeholder="0" onChange={e => setSaBankRaw(formatMoneyInput(e.target.value))}
                  style={{ fontSize: 12, padding: '7px 10px' }} />
              </div>
              <button className="btn btn-primary btn-full btn-sm" onClick={requestSaldoAwal}>Simpan Saldo Awal</button>
              {saError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{saError}</div>}
            </div>
          )}

          {/* Manual Entry */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 12 }}>✏️ Entri Manual</div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Tipe</div>
              <select value={mTipe} onChange={e => setMTipe(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }}>
                <option value="MASUK">MASUK (Penerimaan)</option>
                <option value="KELUAR">KELUAR (Pengeluaran)</option>
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Kas</div>
              <select value={mKas} onChange={e => setMKas(e.target.value)} style={{ fontSize: 12, padding: '7px 10px' }}>
                <option value="CASH">CASH</option>
                <option value="BANK">BANK / TF</option>
              </select>
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Jumlah</div>
              <input value={mJumlahRaw} inputMode="numeric" placeholder="0" onChange={e => setMJumlahRaw(formatMoneyInput(e.target.value))} style={{ fontSize: 12, padding: '7px 10px' }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Keterangan</div>
              <input value={mKet} onChange={e => setMKet(e.target.value)} placeholder="Keterangan transaksi" style={{ fontSize: 12, padding: '7px 10px' }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>No. Ref (opsional)</div>
              <input value={mRef} onChange={e => setMRef(e.target.value)} placeholder="-" style={{ fontSize: 12, padding: '7px 10px' }} />
            </div>
            <button className="btn btn-success btn-full btn-sm" onClick={requestManualEntry} disabled={mSubmitting}>
              {mSubmitting ? '⏳' : '+ Tambah Entri'}
            </button>
            {mError && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 6 }}>{mError}</div>}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '20px 20px 20px 0' }}>
          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Total Masuk</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--green)' }}>{formatRp(totalMasuk)}</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Total Keluar</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700, color: 'var(--red)' }}>{formatRp(totalKeluar)}</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Entri</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700 }}>{rows.length}</div>
            </div>
          </div>

          {/* Filter */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '7px 10px' }} />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} style={{ flex: 1, fontSize: 12, padding: '7px 10px' }} />
            <select value={filterKas} onChange={e => setFilterKas(e.target.value)} style={{ width: 120, fontSize: 12, padding: '7px 10px' }}>
              <option value="">Semua Kas</option>
              <option value="CASH">Cash</option>
              <option value="BANK">Bank</option>
            </select>
            <select value={filterTipe} onChange={e => setFilterTipe(e.target.value)} style={{ width: 120, fontSize: 12, padding: '7px 10px' }}>
              <option value="">Semua Tipe</option>
              <option value="MASUK">Masuk</option>
              <option value="KELUAR">Keluar</option>
            </select>
            <button className="btn btn-outline btn-sm" onClick={() => { setDateFrom(todayISO()); setDateTo(todayISO()); setFilterKas(''); setFilterTipe(''); }}>Reset</button>
            <button className="btn btn-primary btn-sm" onClick={loadKas}>↻ Muat</button>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Tanggal</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Keterangan</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Tipe</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Kas</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Jumlah</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Saldo Cash</th>
                  <th style={{ padding: '8px 10px', textAlign: 'right', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Saldo Bank</th>
                  <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>Sumber</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={8} className="empty-state">{loading ? 'Memuat...' : 'Tidak ada data'}</td></tr>
                ) : rows.map((r: any, i: number) => {
                  return (
                    <tr key={r.id || i} style={{ borderBottom: '1px solid rgba(46,51,73,.5)' }}>
                      <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {new Date(r.tgl).toLocaleDateString('id-ID')}
                      </td>
                      <td style={{ padding: '7px 10px', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.keterangan || '—'}
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ background: r.tipe === 'MASUK' ? 'rgba(16,185,129,.15)' : 'rgba(239,68,68,.15)', color: r.tipe === 'MASUK' ? 'var(--green)' : 'var(--red)', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{r.tipe}</span>
                      </td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ background: r.tipe_kas === 'CASH' ? 'rgba(245,158,11,.1)' : 'rgba(59,130,246,.1)', color: r.tipe_kas === 'CASH' ? 'var(--gold)' : 'var(--accent)', padding: '2px 7px', borderRadius: 4, fontSize: 10 }}>{r.tipe_kas}</span>
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: r.tipe === 'MASUK' ? 'var(--green)' : 'var(--red)' }}>
                        {formatRp(r.jumlah)}
                      </td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{formatRp(r.saldoCash ?? 0)}</td>
                      <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{formatRp(r.saldoBank ?? 0)}</td>
                      <td style={{ padding: '7px 10px' }}>
                        <span style={{ fontSize: 9, color: 'var(--text3)' }}>{r.sumber}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PinModal open={mPinOpen} action="Entri Kas Manual"
        onSuccess={(pin, k) => doManualEntry(pin, k)} onCancel={() => setMPinOpen(false)} />
      <PinModal open={saPinOpen} action="Set Saldo Awal"
        onSuccess={(pin) => doSaldoAwal(pin)} onCancel={() => setSaPinOpen(false)} />
    </AppShell>
  );
}
