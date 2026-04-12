'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Gadai Baru
// File: app/gadai/page.tsx
// Migrasi dari gadai.html (GAS)
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatNum, formatMoneyInput, formatMoneyInputSigned, parseMoney, formatDate } from '@/lib/format';

const KATEGORI_OPTIONS = ['HANDPHONE', 'LAPTOP', 'ELEKTRONIK', 'EMAS', 'EMAS PAUN'];
const GRADE_OPTIONS = ['A', 'B', 'C', 'D'];

interface TodayRow {
  no_faktur: string; nama: string; barang: string;
  jumlah_gadai: number; tgl_jt: string; payment: string; kasir: string;
}

export default function GadaiPage() {
  const outletId = useOutletId();

  // ── Form state ──────────────────────────────────────────
  const [nama, setNama] = useState('');
  const [noKtp, setNoKtp] = useState('');
  const [telp1, setTelp1] = useState('');
  const [telp2, setTelp2] = useState('');
  const [kategori, setKategori] = useState('');
  const [grade, setGrade] = useState('');
  const [berat, setBerat] = useState('');
  const [barang, setBarang] = useState('');
  const [kelengkapan, setKelengkapan] = useState('');
  const [imeiSn, setImeiSn] = useState('');

  // Nominal
  const [taksiranRaw, setTaksiranRaw] = useState('');
  const [jmlGadaiRaw, setJmlGadaiRaw] = useState('');
  const [ujrahPersen, setUjrahPersen] = useState('');
  const [ujrahNominalRaw, setUjrahNominalRaw] = useState('');
  const [ujrahManual, setUjrahManual] = useState(false);
  const [persenManual, setPersenManual] = useState(false);

  // Payment
  const [payment, setPayment] = useState<'CASH' | 'BANK' | 'SPLIT'>('CASH');
  const [cashRaw, setCashRaw] = useState('');
  const [bankRaw, setBankRaw] = useState('');

  // UI state
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [todayList, setTodayList] = useState<TodayRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);

  // Success modal
  const [successData, setSuccessData] = useState<any>(null);

  // ── Derived values ──────────────────────────────────────
  const taksiran = parseMoney(taksiranRaw);
  const jmlGadai = parseMoney(jmlGadaiRaw);
  const ujrahNominal = parseMoney(ujrahNominalRaw);
  const isEmas = ['EMAS', 'EMAS PAUN'].includes(kategori);

  // ── Ujrah calculation (mirrors GAS logic) ───────────────
  useEffect(() => {
    if (!kategori || !taksiran || !jmlGadai) return;
    if (jmlGadai > taksiran) return;

    const useEmasFlat = isEmas && jmlGadai <= 1000000;
    const persen = useEmasFlat ? 0 : isEmas ? 2.8 : (jmlGadai <= 3000000 ? 8 : 7);

    if (!persenManual) {
      setUjrahPersen(useEmasFlat ? 'flat' : String(persen));
    }

    if (!ujrahManual) {
      const ujrahPerHari = useEmasFlat ? 1000 : (persen / 100 / 30) * taksiran;
      const ujrahPerLima = isEmas ? 0 : (persen / 100 / 30) * 5 * taksiran;
      const nominal = useEmasFlat ? 30000 : isEmas
        ? Math.ceil(ujrahPerHari * 30 / 1000) * 1000
        : Math.ceil(ujrahPerLima * 6 / 1000) * 1000;
      setUjrahNominalRaw(nominal > 0 ? formatNum(nominal) : '');
    }
  }, [kategori, taksiran, jmlGadai, isEmas, persenManual, ujrahManual]);

  // ── Breakdown (6 periods x 5 days, non-emas only) ──────
  const breakdown = (() => {
    if (isEmas || !ujrahNominal) return null;
    const perPeriod = Math.ceil(ujrahNominal / 6 / 1000) * 1000;
    return [1, 2, 3, 4, 5, 6].map(i => perPeriod * i);
  })();

  // ── Load today's list ──────────────────────────────────
  const loadTodayList = useCallback(async () => {
    setLoadingList(true);
    try {
      const tgl = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/laporan/harian?tgl=${tgl}&outletId=${outletId}`);
      const json = await res.json();
      if (json.ok && json.gadai) {
        setTodayList(json.gadai.map((r: any) => ({
          no_faktur: r.no_faktur, nama: r.nama, barang: r.barang,
          jumlah_gadai: r.jumlah_gadai, tgl_jt: r.tgl_jt,
          payment: r.payment, kasir: r.kasir,
        })));
      }
    } catch { /* silent */ }
    setLoadingList(false);
  }, [outletId]);

  useEffect(() => { loadTodayList(); }, [loadTodayList]);

  // ── Validation & Submit ────────────────────────────────
  function requestSubmit() {
    const errs: string[] = [];
    if (!nama.trim()) errs.push('Nama');
    if (!noKtp.trim()) errs.push('No KTP');
    if (!telp1.trim()) errs.push('Telepon 1');
    if (!kategori) errs.push('Kategori');
    if (!barang.trim()) errs.push('Barang');
    if (!kelengkapan.trim()) errs.push('Kelengkapan');
    if (!imeiSn.trim()) errs.push('IMEI/SN');
    if (!taksiran) errs.push('Taksiran');
    if (!jmlGadai) errs.push('Jml Gadai');
    if (errs.length) { setError('Field wajib belum diisi: ' + errs.join(', ')); return; }
    if (jmlGadai > taksiran) { setError('Jumlah gadai tidak boleh melebihi taksiran!'); return; }
    if (payment === 'SPLIT') {
      const c = parseMoney(cashRaw);
      const b = parseMoney(bankRaw);
      if ((c + b) !== jmlGadai) {
        setError(`Total split (${formatRp(c + b)}) harus sama dengan Jumlah Gadai (${formatRp(jmlGadai)})`);
        return;
      }
    }
    setError('');
    setPinOpen(true);
  }

  async function doSubmit(pin: string, kasirName: string) {
    setPinOpen(false);
    setSubmitting(true);
    setError('');

    const gradeVal = isEmas ? berat : grade;
    const cashVal = payment === 'CASH' ? jmlGadai : payment === 'BANK' ? 0 : parseMoney(cashRaw);
    const bankVal = payment === 'BANK' ? jmlGadai : payment === 'CASH' ? 0 : parseMoney(bankRaw);

    try {
      const res = await fetch('/api/gadai/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-outlet-id': String(outletId),
        },
        body: JSON.stringify({
          pin: pin, // validated by PinModal, re-validated server-side
          nama: nama.trim(),
          noKtp: noKtp.trim(),
          telp1: telp1.trim(),
          telp2: telp2.trim(),
          kategori,
          barang: barang.trim(),
          kelengkapan: kelengkapan.trim(),
          grade: gradeVal,
          imeiSn: imeiSn.trim(),
          taksiran,
          jumlahGadai: jmlGadai,
          ujrahPersen: parseFloat(ujrahPersen) || 0,
          ujrahNominal,
          payment: payment === 'SPLIT' ? 'SPLIT' : payment,
          cash: cashVal,
          bank: bankVal,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.msg || 'Gagal submit gadai'); setSubmitting(false); return; }

      // Success
      setSuccessData({ ...json, kasir: kasirName });
      resetForm();
      loadTodayList();
    } catch (e) {
      setError('Server error: ' + (e as Error).message);
    }
    setSubmitting(false);
  }

  function resetForm() {
    setNama(''); setNoKtp(''); setTelp1(''); setTelp2('');
    setKategori(''); setGrade(''); setBerat('');
    setBarang(''); setKelengkapan(''); setImeiSn('');
    setTaksiranRaw(''); setJmlGadaiRaw('');
    setUjrahPersen(''); setUjrahNominalRaw('');
    setUjrahManual(false); setPersenManual(false);
    setPayment('CASH'); setCashRaw(''); setBankRaw('');
    setError('');
  }

  // ── Calc box visible ──────────────────────────────────
  const showCalc = !!(kategori && taksiran && jmlGadai && jmlGadai <= taksiran);
  const useEmasFlat = isEmas && jmlGadai <= 1000000;
  const persenNum = parseFloat(ujrahPersen) || 0;

  return (
    <AppShell title="Gadai Baru" subtitle="Form input transaksi gadai">
      <div className="form-page">
        {/* ── LEFT: FORM ── */}
        <div className="form-left">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Form Gadai Baru</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>SBR-?-????</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={resetForm}>↺ Reset</button>
          </div>

          {/* DATA NASABAH */}
          <div className="form-section-label">DATA NASABAH</div>
          <div className="form-group">
            <label>Nama Nasabah *</label>
            <input value={nama} onChange={e => setNama(e.target.value.toUpperCase())} placeholder="Nama lengkap" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>No KTP *</label>
              <input value={noKtp} onChange={e => setNoKtp(e.target.value)} placeholder="16 digit NIK" maxLength={16} />
            </div>
            <div className="form-group">
              <label>Telepon 1 *</label>
              <input value={telp1} onChange={e => setTelp1(e.target.value)} placeholder="08xx" />
            </div>
          </div>
          <div className="form-group">
            <label>Telepon 2</label>
            <input value={telp2} onChange={e => setTelp2(e.target.value)} placeholder="Opsional" />
          </div>

          {/* DATA BARANG */}
          <div className="form-section-label">DATA BARANG</div>
          <div className="form-row">
            <div className="form-group">
              <label>Kategori *</label>
              <select value={kategori} onChange={e => { setKategori(e.target.value); setUjrahManual(false); setPersenManual(false); }}>
                <option value="">— Pilih —</option>
                {KATEGORI_OPTIONS.map(k => <option key={k}>{k}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{isEmas ? 'Berat (gram)' : 'Grade'}</label>
              {isEmas ? (
                <input type="number" value={berat} onChange={e => setBerat(e.target.value)} placeholder="Berat (gram)" min="0" step="0.01" />
              ) : (
                <select value={grade} onChange={e => setGrade(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}
                </select>
              )}
            </div>
          </div>
          <div className="form-group">
            <label>Nama Barang *</label>
            <input value={barang} onChange={e => setBarang(e.target.value.toUpperCase())} placeholder="Merk / Type / Spesifikasi" />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Kelengkapan *</label>
              <input value={kelengkapan} onChange={e => setKelengkapan(e.target.value)} placeholder="Kotak, Cas, dll" />
            </div>
            <div className="form-group">
              <label>IMEI / SN / Kadar *</label>
              <input value={imeiSn} onChange={e => setImeiSn(e.target.value)} placeholder="IMEI atau S/N" />
            </div>
          </div>

          {/* NOMINAL */}
          <div className="form-section-label">NOMINAL</div>
          <div className="form-row">
            <div className="form-group">
              <label>Taksiran *</label>
              <input value={taksiranRaw} inputMode="numeric" placeholder="0"
                onChange={e => setTaksiranRaw(formatMoneyInput(e.target.value))} />
            </div>
            <div className="form-group">
              <label>Jml Gadai *</label>
              <input value={jmlGadaiRaw} inputMode="numeric" placeholder="0"
                style={jmlGadai > taksiran && taksiran > 0 ? { borderColor: 'var(--red)' } : {}}
                onChange={e => setJmlGadaiRaw(formatMoneyInput(e.target.value))} />
            </div>
          </div>
          {jmlGadai > taksiran && taksiran > 0 && (
            <div className="alert-error">⚠️ Jumlah Gadai tidak boleh melebihi Taksiran ({formatRp(taksiran)})</div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label>Biaya Admin</label>
              <input value="Rp 10.000" readOnly style={{ color: 'var(--text3)', cursor: 'not-allowed', background: 'var(--bg)' }} />
              <div className="hint">Fix Rp 10.000 — tidak masuk kas, untuk surat saja</div>
            </div>
            <div className="form-group">
              <label>Ujrah %</label>
              <input type="text" value={ujrahPersen} placeholder="%"
                onChange={e => { setUjrahPersen(e.target.value); setPersenManual(true); setUjrahManual(false); }} />
            </div>
          </div>

          <div className="form-group">
            <label>Ujrah (Nominal) — bisa diedit</label>
            <input value={ujrahNominalRaw} inputMode="numeric" placeholder="0"
              onChange={e => { setUjrahNominalRaw(formatMoneyInput(e.target.value)); setUjrahManual(true); }} />
          </div>

          {/* CALC BOX */}
          {showCalc && (
            <div className="calc-box">
              <div className="c-title">📐 Kalkulasi Ujrah</div>
              <div className="calc-row">
                <span className="c-lbl">Taksiran</span>
                <span className="c-val">{formatRp(taksiran)}</span>
              </div>
              <div className="calc-row">
                <span className="c-lbl">
                  Ujrah {useEmasFlat ? 'Rp 1.000/hari (flat)' : `${persenNum}%/bln`} → per {isEmas ? 'hari' : '5 hari'}
                </span>
                <span className="c-val">
                  {useEmasFlat
                    ? formatRp(1000) + '/hari'
                    : formatRp(isEmas
                      ? Math.ceil((persenNum / 100 / 30) * taksiran / 1000) * 1000
                      : Math.ceil((persenNum / 100 / 30) * 5 * taksiran / 1000) * 1000
                    )
                  }
                </span>
              </div>
              <div className="calc-row total">
                <span className="c-lbl">Jml Gadai Keluar</span>
                <span className="c-val">{formatRp(jmlGadai)}</span>
              </div>

              {/* Breakdown (non-emas only) */}
              {breakdown && (
                <div className="ujrah-breakdown">
                  <div className="u-title">Tabel Ujrah (di Surat Kontrak)</div>
                  <div className="ujrah-grid">
                    {breakdown.map((val, i) => (
                      <div key={i} className="ujrah-cell">
                        <div className="u-period">{(i * 5 + 1)}-{(i + 1) * 5} hari</div>
                        <div className="u-amount">{formatRp(val)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PEMBAYARAN */}
          <div className="form-section-label">PEMBAYARAN</div>
          <div className="payment-tabs">
            {(['CASH', 'BANK', 'SPLIT'] as const).map(m => (
              <div key={m}
                className={`ptab ${payment === m ? 'active' : ''}`}
                onClick={() => setPayment(m)}
              >
                {m === 'CASH' ? '💵 CASH' : m === 'BANK' ? '🏦 BANK' : '💵+🏦 SPLIT'}
              </div>
            ))}
          </div>
          {payment === 'SPLIT' && (
            <div className="form-row">
              <div className="form-group">
                <label>Bagian Cash <span style={{ fontSize: 10, color: 'var(--text3)' }}>(boleh minus)</span></label>
                <input value={cashRaw} inputMode="numeric" placeholder="0"
                  onChange={e => setCashRaw(formatMoneyInputSigned(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Bagian Bank</label>
                <input value={bankRaw} inputMode="numeric" placeholder="0"
                  onChange={e => setBankRaw(formatMoneyInput(e.target.value))} />
              </div>
            </div>
          )}
          {payment === 'SPLIT' && (
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              Total split: {formatRp(parseMoney(cashRaw) + parseMoney(bankRaw))}
            </div>
          )}

          {/* Error */}
          {error && <div className="alert-error">⚠️ {error}</div>}

          {/* Submit */}
          <div className="submit-area">
            <button className="btn btn-success btn-full" onClick={requestSubmit} disabled={submitting}>
              {submitting ? '⏳ Menyimpan...' : '💰 SUBMIT GADAI'}
            </button>
          </div>
        </div>

        {/* ── RIGHT: TODAY'S LIST ── */}
        <div className="form-right">
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Data Transaksi Gadai (Hari Ini)
            <button className="btn btn-outline btn-sm" onClick={loadTodayList} disabled={loadingList}>
              {loadingList ? '⏳' : '↻ Refresh'}
            </button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>No Faktur</th><th>Nama</th><th>Barang</th>
                  <th className="num">Gadai</th><th>JT</th><th>Bayar</th><th>Kasir</th>
                </tr>
              </thead>
              <tbody>
                {todayList.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">
                    {loadingList ? 'Memuat...' : 'Belum ada transaksi hari ini'}
                  </td></tr>
                ) : todayList.map((r, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_faktur}</td>
                    <td style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nama}</td>
                    <td style={{ maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.barang}</td>
                    <td className="num">{formatRp(r.jumlah_gadai)}</td>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{formatDate(r.tgl_jt)}</td>
                    <td><span className={`badge ${(r.payment || '').toLowerCase()}`}>{r.payment || '—'}</span></td>
                    <td>{r.kasir || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* PIN Modal */}
      <PinModal
        open={pinOpen}
        action={`Submit Gadai — ${nama}`}
        onSuccess={(pin, kasirName) => doSubmit(pin, kasirName)}
        onCancel={() => setPinOpen(false)}
      />

      {/* Success Modal */}
      {successData && (
        <div className="success-overlay" onClick={() => setSuccessData(null)}>
          <div className="success-modal" onClick={e => e.stopPropagation()}>
            <div className="check">✅</div>
            <h3>Gadai Berhasil Disimpan!</h3>
            <div className="info-grid">
              {[
                ['No Faktur', successData.noFaktur],
                ['Tgl Gadai', successData.tglGadai],
                ['Jatuh Tempo', successData.tglJT],
                ['Tgl Sita', successData.tglSita],
                ['Lokasi Rak', successData.locationGudang || '—'],
                ['Kasir', successData.kasir],
              ].map(([label, val]) => (
                <div className="info-row" key={label}>
                  <span className="info-label">{label}</span>
                  <span className="info-val">{val || '—'}</span>
                </div>
              ))}
            </div>
            <div className="success-actions">
              <button className="btn btn-primary btn-full" onClick={() => {
                // TODO: print surat kontrak
                alert('Cetak surat kontrak — akan diimplementasi');
              }}>🖨️ Cetak Surat</button>
              <button className="btn btn-outline btn-full" onClick={() => setSuccessData(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
