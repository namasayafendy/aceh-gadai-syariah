'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Tebus / Perpanjang
// File: app/tebus/page.tsx
// Migrasi dari tebus.html (GAS)
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatMoneyInput, formatMoneyInputSigned, parseMoney, formatDate } from '@/lib/format';
import { printTebus } from '@/lib/print';

type TebusStatus = '' | 'TEBUS' | 'PERPANJANG' | 'TAMBAH' | 'KURANG' | 'SITA' | 'JUAL';

interface GadaiData {
  id: string; no_faktur: string; nama: string; no_ktp: string;
  telp1: string; kategori: string; barang: string; kelengkapan: string;
  grade: string; imei_sn: string; tgl_gadai: string; tgl_jt: string;
  taksiran: number; jumlah_gadai: number; ujrah_persen: number; ujrah_nominal: number;
  barcode_a: string; barcode_b: string; rak: string;
  status: string; outlet: string; payment: string;
  _source?: string;
  [key: string]: any;
}

interface TodayRow {
  no_faktur: string; nama: string; status: string;
  jumlah_bayar: number; ujrah_berjalan: number; selisih: number;
  payment: string; kasir: string;
}

export default function TebusPage() {
  const outletId = useOutletId();

  // Search
  const [barcode, setBarcode] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [tanpaSurat, setTanpaSurat] = useState(false);

  // Gadai data
  const [gadaiData, setGadaiData] = useState<GadaiData | null>(null);
  const [tebusStatus, setTebusStatus] = useState<TebusStatus>('');
  const [statusDisabled, setStatusDisabled] = useState(false);

  // Ujrah calc
  const [ujrahBerjalan, setUjrahBerjalan] = useState(0);
  const [hariAktual, setHariAktual] = useState(0);
  const [hariDihitung, setHariDihitung] = useState(0);
  const [totalSistem, setTotalSistem] = useState(0);

  // Form
  const [jmlGadaiBaruRaw, setJmlGadaiBaruRaw] = useState('');
  const [ujrahBaruRaw, setUjrahBaruRaw] = useState('');
  const [ujrahBaruPerpanjangRaw, setUjrahBaruPerpanjangRaw] = useState('');
  const [taksiranJualRaw, setTaksiranJualRaw] = useState('');
  const [taksiranSitaRaw, setTaksiranSitaRaw] = useState('');
  const [jmlBayarRaw, setJmlBayarRaw] = useState('');
  const [alasan, setAlasan] = useState('');

  // Payment
  const [payment, setPayment] = useState<'CASH' | 'BANK' | 'SPLIT'>('CASH');
  const [cashRaw, setCashRaw] = useState('');
  const [bankRaw, setBankRaw] = useState('');

  // UI
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [todayList, setTodayList] = useState<TodayRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  // Derived
  const jmlGadaiBaru = parseMoney(jmlGadaiBaruRaw);
  const jmlBayar = parseMoney(jmlBayarRaw);
  const isEmas = gadaiData ? ['EMAS', 'EMAS PAUN'].includes((gadaiData.kategori || '').toUpperCase()) : false;

  // ── Search barcode ──────────────────────────────────────
  const searchBarcode = useCallback(async () => {
    const bc = barcode.trim().toUpperCase();
    if (!bc) { setSearchError('Masukkan barcode atau No. SBR'); return; }
    setSearching(true); setSearchError(''); setGadaiData(null); setTebusStatus('');
    setTanpaSurat(false); setError('');

    try {
      const res = await fetch('/api/gadai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({ barcode: bc, outletId }),
      });
      const json = await res.json();
      if (!json.ok) { setSearchError(json.msg); setSearching(false); return; }

      const d = json.data as GadaiData;
      setGadaiData(d);
      setTanpaSurat(json.tanpaSurat === true);

      // Check final status
      const st = (d.status || '').toUpperCase();
      if (['TEBUS', 'SITA', 'JUAL'].includes(st)) {
        setError(`⛔ Barang ini sudah berstatus ${st}. Tidak bisa diproses lagi.`);
        setStatusDisabled(true);
      } else if (st === 'BATAL') {
        setError('⛔ Kontrak ini sudah DIBATALKAN. Tidak bisa diproses.');
        setStatusDisabled(true);
      } else {
        setStatusDisabled(false);
      }
    } catch (e) { setSearchError('Error: ' + (e as Error).message); }
    setSearching(false);
  }, [barcode, outletId]);

  // ── Status change → calculate ujrah ─────────────────────
  useEffect(() => {
    if (!tebusStatus || !gadaiData) return;
    const taksiran = gadaiData.taksiran || 0;
    const jmlGadai = gadaiData.jumlah_gadai || 0;
    const kat = (gadaiData.kategori || '').toUpperCase();
    const emasFlag = ['EMAS', 'EMAS PAUN'].includes(kat);

    // Parse tgl_gadai
    const tgl1 = new Date(gadaiData.tgl_gadai);
    const now = new Date();
    const hari = Math.max(1, Math.floor((now.getTime() - tgl1.getTime()) / 86400000));
    setHariAktual(hari);

    // Ujrah from sheet or formula
    const ujrahSheet = gadaiData.ujrah_nominal || 0;
    let ujrah: number;
    let hDihitung: number;

    if (ujrahSheet > 0) {
      if (emasFlag) {
        hDihitung = hari;
        ujrah = Math.ceil((ujrahSheet / 30) * hari / 1000) * 1000;
      } else {
        hDihitung = Math.ceil(hari / 5) * 5;
        const per5 = Math.round(ujrahSheet / 6);
        ujrah = Math.ceil(per5 * (hDihitung / 5) / 1000) * 1000;
      }
    } else {
      if (emasFlag) {
        hDihitung = hari;
        ujrah = Math.round((2.8 / 100 / 30) * taksiran * hari);
      } else {
        const persen = jmlGadai <= 3000000 ? 8 : 7;
        hDihitung = Math.ceil(hari / 5) * 5;
        ujrah = Math.round((persen / 100 / 30) * 5 * taksiran * (hDihitung / 5));
      }
    }

    setHariDihitung(hDihitung);
    setUjrahBerjalan(ujrah);

    // Calc total
    let total = 0;
    if (tebusStatus === 'TEBUS' || tebusStatus === 'JUAL') total = jmlGadai + ujrah;
    else if (tebusStatus === 'PERPANJANG') total = ujrah;
    else if (tebusStatus === 'SITA') total = jmlGadai + ujrah;
    else if (tebusStatus === 'KURANG') total = (jmlGadai - jmlGadaiBaru) + ujrah;
    else if (tebusStatus === 'TAMBAH') total = jmlGadaiBaru - (jmlGadai + ujrah);
    if (total > 0) total = Math.ceil(total / 1000) * 1000;
    setTotalSistem(total);

    // Auto-fill jmlBayar
    if (tebusStatus !== 'SITA') {
      setJmlBayarRaw(total > 0 ? total.toLocaleString('id-ID') : '');
    }

    // Auto-fill taksiran for JUAL/SITA
    if (tebusStatus === 'JUAL') setTaksiranJualRaw(taksiran > 0 ? taksiran.toLocaleString('id-ID') : '');
    if (tebusStatus === 'SITA') setTaksiranSitaRaw(taksiran > 0 ? taksiran.toLocaleString('id-ID') : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tebusStatus, gadaiData, jmlGadaiBaru]);

  // ── Recalc when jmlGadaiBaru changes (TAMBAH/KURANG) ───
  useEffect(() => {
    if (!['TAMBAH', 'KURANG'].includes(tebusStatus) || !gadaiData) return;
    const jmlGadai = gadaiData.jumlah_gadai || 0;
    let total = 0;
    if (tebusStatus === 'KURANG') total = (jmlGadai - jmlGadaiBaru) + ujrahBerjalan;
    else if (tebusStatus === 'TAMBAH') total = jmlGadaiBaru - (jmlGadai + ujrahBerjalan);
    if (total > 0) total = Math.ceil(total / 1000) * 1000;
    setTotalSistem(total);
    setJmlBayarRaw(total > 0 ? total.toLocaleString('id-ID') : '');
  }, [jmlGadaiBaru, tebusStatus, gadaiData, ujrahBerjalan]);

  // ── Load today's list ──────────────────────────────────
  const loadTodayList = useCallback(async () => {
    setLoadingList(true);
    try {
      const tgl = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/laporan/harian?tgl=${tgl}&outletId=${outletId}`);
      const json = await res.json();
      if (json.ok && json.tebus) setTodayList(json.tebus);
    } catch { /* silent */ }
    setLoadingList(false);
  }, [outletId]);

  useEffect(() => { loadTodayList(); }, [loadTodayList]);

  // ── Selisih ────────────────────────────────────────────
  const selisih = totalSistem > 0 ? totalSistem - jmlBayar : 0;
  const sisaKonsumen = tebusStatus === 'JUAL' ? Math.max(0, parseMoney(taksiranJualRaw) - jmlBayar) : 0;

  // ── Validation ─────────────────────────────────────────
  function requestSubmit() {
    if (!tebusStatus) { setError('Pilih status terlebih dahulu'); return; }
    if (!gadaiData) { setError('Scan barcode terlebih dahulu'); return; }

    if (tebusStatus !== 'SITA') {
      if (!jmlBayar) { setError('Isi Jumlah Bayar'); return; }
      if (jmlBayar < totalSistem) {
        if (!alasan.trim() || alasan.trim().length < 2) {
          setError(`Ada selisih ${formatRp(selisih)} dari sistem! Wajib isi Catatan.`); return;
        }
      }
    }
    if (tanpaSurat && (!alasan.trim() || alasan.trim().length < 2)) {
      setError('Transaksi TANPA SURAT: wajib isi Catatan/Alasan.'); return;
    }
    if (['TAMBAH', 'KURANG'].includes(tebusStatus)) {
      if (!jmlGadaiBaru) { setError('Isi Jumlah Gadai Baru'); return; }
      if (!parseMoney(ujrahBaruRaw)) { setError('Isi Ujrah Baru untuk kontrak'); return; }
      if (tebusStatus === 'TAMBAH' && jmlGadaiBaru <= gadaiData.jumlah_gadai) {
        setError('Jumlah gadai baru harus lebih besar!'); return;
      }
      if (tebusStatus === 'TAMBAH' && gadaiData.taksiran > 0 && jmlGadaiBaru > gadaiData.taksiran) {
        setError(`Jumlah gadai baru tidak boleh melebihi Taksiran (${formatRp(gadaiData.taksiran)})!`); return;
      }
      if (tebusStatus === 'KURANG' && jmlGadaiBaru >= gadaiData.jumlah_gadai) {
        setError('Jumlah gadai baru harus lebih kecil!'); return;
      }
    }
    if (payment === 'SPLIT' && tebusStatus !== 'SITA') {
      const c = parseMoney(cashRaw), b = parseMoney(bankRaw);
      if (tebusStatus === 'JUAL') {
        if (Math.abs(c + b - sisaKonsumen) > 1) {
          setError(`Total split (${formatRp(c + b)}) harus = Sisa ke Konsumen (${formatRp(sisaKonsumen)})`); return;
        }
      } else {
        if (Math.abs(c + b - jmlBayar) > 1) {
          setError(`Total split (${formatRp(c + b)}) harus = Jumlah Bayar (${formatRp(jmlBayar)})`); return;
        }
      }
    }
    setError('');
    setPinOpen(true);
  }

  // ── Submit ─────────────────────────────────────────────
  async function doSubmit(pin: string, kasirName: string) {
    setPinOpen(false); setSubmitting(true); setError('');
    const d = gadaiData!;
    const cashVal = tebusStatus === 'JUAL'
      ? (payment === 'CASH' ? sisaKonsumen : parseMoney(cashRaw))
      : (payment === 'CASH' ? jmlBayar : parseMoney(cashRaw));
    const bankVal = tebusStatus === 'JUAL'
      ? (payment === 'BANK' ? sisaKonsumen : parseMoney(bankRaw))
      : (payment === 'BANK' ? jmlBayar : parseMoney(bankRaw));

    try {
      const res = await fetch('/api/tebus/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({
          pin, status: tebusStatus, tanpaSurat,
          idGadai: d.id, noFaktur: d.no_faktur,
          barcodeA: d.barcode_a, barcodeB: d.barcode_b || d.id,
          namaNasabah: d.nama, noKtp: d.no_ktp, telp1: d.telp1,
          kategori: d.kategori, barang: d.barang, kelengkapan: d.kelengkapan,
          grade: d.grade, imeiSn: d.imei_sn,
          taksiran: d.taksiran, jumlahGadai: d.jumlah_gadai,
          locationGudang: d.rak || '',
          taksiranJual: tebusStatus === 'JUAL' ? parseMoney(taksiranJualRaw) : d.taksiran,
          taksiranSita: tebusStatus === 'SITA' ? parseMoney(taksiranSitaRaw) : d.taksiran,
          sisaKonsumen, jumlahGadaiBaru: jmlGadaiBaru,
          ujrahBaru: ['TAMBAH', 'KURANG'].includes(tebusStatus) ? parseMoney(ujrahBaruRaw) : 0,
          hariAktual, ujrahBerjalan, totalTebusSistem: totalSistem,
          jumlahBayar: jmlBayar, jumlahDibayarkan: jmlBayar,
          alasan: alasan.trim(), payment: payment === 'SPLIT' ? 'SPLIT' : payment,
          cash: cashVal, bank: bankVal,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.msg || 'Gagal submit'); setSubmitting(false); return; }

      // ── Simpan SEMUA data print SEBELUM reset ──
      // Karena resetForm() akan clear gadaiData & semua state
      const selisihVal = totalSistem > 0 ? totalSistem - jmlBayar : 0;
      setSuccessData({
        ...json,
        kasir: kasirName,
        status: tebusStatus,
        // Data gadai yang diperlukan untuk cetak nota
        _print: {
          noFaktur: d.no_faktur,
          namaNasabah: d.nama,
          noKtp: d.no_ktp,
          telp1: d.telp1,
          kategori: d.kategori,
          barang: d.barang,
          kelengkapan: d.kelengkapan,
          grade: d.grade,
          imeiSn: d.imei_sn,
          locationGudang: d.rak || '',
          tglGadai: d.tgl_gadai,
          jumlahGadai: d.jumlah_gadai,
          taksiran: d.taksiran,
          ujrahBerjalan,
          hariAktual,
          totalTebusSistem: totalSistem,
          jumlahBayar: jmlBayar,
          selisih: selisihVal,
          alasan: alasan.trim(),
          payment,
          cash: cashVal,
          bank: bankVal,
          tanpaSurat,
          barcodeA: d.barcode_a,
          barcodeB: d.barcode_b,
          jumlahGadaiBaru: jmlGadaiBaru,
        },
      });
      resetForm(); loadTodayList();
    } catch (e) { setError('Server error: ' + (e as Error).message); }
    setSubmitting(false);
  }

  function resetForm() {
    setBarcode(''); setGadaiData(null); setTebusStatus(''); setStatusDisabled(false);
    setSearchError(''); setError(''); setTanpaSurat(false);
    setUjrahBerjalan(0); setHariAktual(0); setHariDihitung(0); setTotalSistem(0);
    setJmlGadaiBaruRaw(''); setUjrahBaruRaw(''); setUjrahBaruPerpanjangRaw('');
    setTaksiranJualRaw(''); setTaksiranSitaRaw('');
    setJmlBayarRaw(''); setAlasan('');
    setPayment('CASH'); setCashRaw(''); setBankRaw('');
  }

  const showBaru = ['TAMBAH', 'KURANG'].includes(tebusStatus);
  const showCalc = !!tebusStatus && !!gadaiData;
  const showBayar = !!tebusStatus && tebusStatus !== 'SITA' && (showBaru ? jmlGadaiBaru > 0 : true);
  const showSubmit = showBayar || tebusStatus === 'SITA';
  const statusLabels: Record<string, string> = {
    TEBUS: 'Total Tebus (Sistem)', PERPANJANG: 'Ujrah Yang Dibayar',
    TAMBAH: 'Yang Dibayarkan ke Nasabah', KURANG: 'Yang Dibayar Nasabah',
    SITA: 'Total Nilai (Record)', JUAL: 'Total Bayar',
  };
  const btnLabels: Record<string, string> = {
    TEBUS: 'SUBMIT TEBUS', PERPANJANG: 'SUBMIT PERPANJANG',
    TAMBAH: 'SUBMIT TAMBAH PINJAMAN', KURANG: 'SUBMIT KURANG PINJAMAN',
    SITA: 'SUBMIT SITA', JUAL: 'SUBMIT JUAL',
  };

  return (
    <AppShell title="Tebus / Perpanjang" subtitle="Scan barcode konsumen">
      <div className="form-page">
        {/* ── LEFT ── */}
        <div className="form-left">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Tebus / Perpanjang</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>Scan atau input barcode konsumen</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={resetForm}>↺ Reset</button>
          </div>

          {/* Barcode input */}
          <div className="form-group">
            <label>Barcode Konsumen (A) / No. SBR *</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={barcode} style={{ flex: 1, fontFamily: 'var(--mono)', letterSpacing: 1 }}
                onChange={e => setBarcode(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === 'Enter' && searchBarcode()}
                placeholder="Scan barcode atau ketik No. SBR..." />
              <button className="btn btn-primary" onClick={searchBarcode} disabled={searching}>
                {searching ? '⏳' : 'Cari'}
              </button>
            </div>
            <div className="hint">Tekan Enter atau klik Cari setelah scan</div>
          </div>

          {tanpaSurat && (
            <div style={{ background: '#fff3cd', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px', marginTop: 6, fontSize: 12, color: '#92400e' }}>
              ⚠️ <b>TRANSAKSI TANPA SURAT</b> — Nasabah menggunakan No. SBR (surat hilang).
            </div>
          )}

          {searchError && <div className="alert-error">⚠️ {searchError}</div>}

          {/* Data Gadai */}
          {gadaiData && (
            <>
              <div className="form-section-label">DATA GADAI</div>
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div><span style={{ color: 'var(--text3)' }}>No Faktur</span><br /><span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--accent)' }}>{gadaiData.no_faktur}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Status</span><br /><span style={{ fontWeight: 600, color: gadaiData.status === 'AKTIF' ? 'var(--green)' : 'var(--red)' }}>{gadaiData.status}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Nama</span><br /><span style={{ fontWeight: 600 }}>{gadaiData.nama}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Kategori</span><br />{gadaiData.kategori}</div>
                  <div><span style={{ color: 'var(--text3)' }}>Tgl Gadai</span><br /><span style={{ fontFamily: 'var(--mono)' }}>{formatDate(gadaiData.tgl_gadai)}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Jatuh Tempo</span><br /><span style={{ fontFamily: 'var(--mono)' }}>{formatDate(gadaiData.tgl_jt)}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Taksiran</span><br /><span style={{ fontFamily: 'var(--mono)' }}>{formatRp(gadaiData.taksiran)}</span></div>
                  <div><span style={{ color: 'var(--text3)' }}>Jml Gadai</span><br /><span style={{ fontFamily: 'var(--mono)', color: 'var(--warn)' }}>{formatRp(gadaiData.jumlah_gadai)}</span></div>
                  <div style={{ gridColumn: 'span 2' }}><span style={{ color: 'var(--text3)' }}>Barang</span><br />{gadaiData.barang}</div>
                </div>
              </div>

              {/* Status selector */}
              <div className="form-group">
                <label>Status Transaksi *</label>
                <select value={tebusStatus} disabled={statusDisabled}
                  onChange={e => { setTebusStatus(e.target.value as TebusStatus); setError(''); }}>
                  <option value="">— Pilih Status —</option>
                  <option value="TEBUS">Tebus</option>
                  <option value="PERPANJANG">Perpanjang</option>
                  <option value="TAMBAH">Tambah Pinjaman</option>
                  <option value="KURANG">Kurang Pinjaman</option>
                  <option value="SITA">Sita</option>
                  <option value="JUAL">Jual</option>
                </select>
              </div>

              {/* TAMBAH / KURANG: jumlah gadai baru + ujrah baru */}
              {showBaru && (
                <>
                  <div className="form-group">
                    <label>{tebusStatus === 'TAMBAH' ? 'Jumlah Gadai Baru (harus > sekarang) *' : 'Jumlah Gadai Baru (harus < sekarang) *'}</label>
                    <input value={jmlGadaiBaruRaw} inputMode="numeric" placeholder="0"
                      onChange={e => setJmlGadaiBaruRaw(formatMoneyInput(e.target.value))} />
                    <div className="hint">Pinjaman sekarang: {formatRp(gadaiData.jumlah_gadai)}</div>
                  </div>
                  <div className="form-group">
                    <label>Ujrah Baru (diisi kasir) *</label>
                    <input value={ujrahBaruRaw} inputMode="numeric" placeholder="0"
                      onChange={e => setUjrahBaruRaw(formatMoneyInput(e.target.value))} />
                    <div className="hint">Ujrah yg berlaku untuk pinjaman baru. Akan tertulis di kontrak baru.</div>
                  </div>
                </>
              )}

              {/* PERPANJANG: ujrah baru */}
              {tebusStatus === 'PERPANJANG' && (
                <div className="form-group">
                  <label>Ujrah Baru (diisi kasir) *</label>
                  <input value={ujrahBaruPerpanjangRaw} inputMode="numeric" placeholder="0"
                    onChange={e => setUjrahBaruPerpanjangRaw(formatMoneyInput(e.target.value))} />
                  <div className="hint">Ujrah berlaku untuk periode perpanjangan.</div>
                </div>
              )}

              {/* Calc box */}
              {showCalc && (
                <div className="calc-box">
                  <div className="c-title">📐 Kalkulasi Tebus</div>
                  <div className="calc-row">
                    <span className="c-lbl">Lama Gadai</span>
                    <span className="c-val">{hariAktual} hari</span>
                  </div>
                  {!isEmas && (
                    <div className="calc-row">
                      <span className="c-lbl">Ditagih (CEILING ke 5)</span>
                      <span className="c-val">{hariDihitung} hari (tagihan)</span>
                    </div>
                  )}
                  <div className="calc-row">
                    <span className="c-lbl">Taksiran</span>
                    <span className="c-val">{formatRp(gadaiData.taksiran)}</span>
                  </div>
                  <div className="calc-row">
                    <span className="c-lbl">Ujrah Berjalan</span>
                    <span className="c-val">{formatRp(ujrahBerjalan)}</span>
                  </div>
                  {showBaru && (
                    <div className="calc-row">
                      <span className="c-lbl">Pinjaman Baru</span>
                      <span className="c-val">{formatRp(jmlGadaiBaru)}</span>
                    </div>
                  )}
                  <div style={{ borderTop: '1px solid rgba(16,185,129,.2)', margin: '8px 0' }} />
                  <div className="calc-row total">
                    <span className="c-lbl">{statusLabels[tebusStatus] || 'Total'}</span>
                    <span className="c-val">{formatRp(totalSistem)}</span>
                  </div>
                </div>
              )}

              {/* JUAL: taksiran editable + sisa ke konsumen */}
              {tebusStatus === 'JUAL' && (
                <div className="form-group">
                  <label>Taksiran Jual (bisa diedit) *</label>
                  <input value={taksiranJualRaw} inputMode="numeric" placeholder="0"
                    onChange={e => setTaksiranJualRaw(formatMoneyInput(e.target.value))} />
                  {sisaKonsumen > 0 && (
                    <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginTop: 8 }}>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>SISA DIBAYARKAN KE KONSUMEN</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--green)' }}>{formatRp(sisaKonsumen)}</div>
                    </div>
                  )}
                </div>
              )}

              {/* SITA: taksiran modal */}
              {tebusStatus === 'SITA' && (
                <div className="form-group">
                  <label>Taksiran (Modal Gudang Sita)</label>
                  <input value={taksiranSitaRaw} inputMode="numeric" readOnly
                    style={{ background: 'var(--surface2)' }} />
                </div>
              )}

              {/* PEMBAYARAN */}
              {showBayar && (
                <>
                  <div className="form-section-label">PEMBAYARAN</div>
                  <div className="form-group">
                    <label>Jumlah Bayar (kasir input) *</label>
                    <input value={jmlBayarRaw} inputMode="numeric" placeholder="0"
                      onChange={e => setJmlBayarRaw(formatMoneyInput(e.target.value))} />
                    <div className="hint" style={{ color: jmlBayar === totalSistem ? 'var(--green)' : jmlBayar > 0 ? 'var(--warn)' : 'var(--text3)' }}>
                      {jmlBayar > 0 && totalSistem > 0
                        ? jmlBayar === totalSistem ? '✓ Sesuai total sistem'
                          : jmlBayar > totalSistem ? `⚠ Lebih ${formatRp(jmlBayar - totalSistem)} dari sistem`
                            : `⚠ Kurang ${formatRp(selisih)} dari sistem — wajib isi Catatan`
                        : 'Isi nominal yg diterima kasir'
                      }
                    </div>
                  </div>

                  {selisih > 0 && jmlBayar > 0 && (
                    <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 6, padding: '8px 12px', fontSize: 12, color: '#92400e', marginBottom: 12 }}>
                      Ada diskon dari sistem — wajib isi Catatan!{selisih > 9000 && ' Surat Diskon akan dicetak.'}
                    </div>
                  )}

                  <div className="form-group">
                    <label>Alasan / Keterangan</label>
                    <input value={alasan} onChange={e => setAlasan(e.target.value)} placeholder="Alasan diskon atau keterangan lain" />
                  </div>

                  <div className="payment-tabs">
                    {(['CASH', 'BANK', 'SPLIT'] as const).map(m => (
                      <div key={m} className={`ptab ${payment === m ? 'active' : ''}`} onClick={() => setPayment(m)}>
                        {m === 'CASH' ? 'CASH' : m === 'BANK' ? 'BANK' : 'SPLIT'}
                      </div>
                    ))}
                  </div>
                  {payment === 'SPLIT' && (
                    <>
                      <div className="form-row">
                        <div className="form-group">
                          <label>Bagian Cash</label>
                          <input value={cashRaw} inputMode="numeric" onChange={e => setCashRaw(formatMoneyInputSigned(e.target.value))} />
                        </div>
                        <div className="form-group">
                          <label>Bagian Bank</label>
                          <input value={bankRaw} inputMode="numeric" onChange={e => setBankRaw(formatMoneyInput(e.target.value))} />
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                        Total split: {formatRp(parseMoney(cashRaw) + parseMoney(bankRaw))}
                      </div>
                    </>
                  )}
                </>
              )}

              {error && <div className="alert-error">⚠️ {error}</div>}

              {showSubmit && (
                <div className="submit-area">
                  <button className="btn btn-success btn-full" onClick={requestSubmit} disabled={submitting}>
                    {submitting ? '⏳ Menyimpan...' : (btnLabels[tebusStatus] || 'SUBMIT')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── RIGHT: TODAY'S LIST ── */}
        <div className="form-right">
          <div className="section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            Data Transaksi Tebus (Hari Ini)
            <button className="btn btn-outline btn-sm" onClick={loadTodayList} disabled={loadingList}>
              {loadingList ? '⏳' : '↻ Refresh'}
            </button>
          </div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>
                <th>No Faktur</th><th>Nama</th><th>Status</th>
                <th className="num">Jml Bayar</th><th className="num">Selisih</th><th>Bayar</th><th>Kasir</th>
              </tr></thead>
              <tbody>
                {todayList.length === 0 ? (
                  <tr><td colSpan={7} className="empty-state">
                    {loadingList ? 'Memuat...' : 'Belum ada transaksi hari ini'}
                  </td></tr>
                ) : todayList.map((r: any, i: number) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_faktur}</td>
                    <td>{r.nama_nasabah || r.nama || '—'}</td>
                    <td><span className={`badge ${(r.status || '').toLowerCase()}`}>{r.status}</span></td>
                    <td className="num">{formatRp(r.jumlah_bayar)}</td>
                    <td className="num" style={{ color: r.selisih > 0 ? 'var(--warn)' : 'var(--text3)' }}>
                      {r.selisih > 0 ? formatRp(r.selisih) : '—'}
                    </td>
                    <td>{r.payment || '—'}</td>
                    <td>{r.kasir || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <PinModal open={pinOpen} action={`${tebusStatus} — ${gadaiData?.no_faktur || ''}`}
        onSuccess={(pin, kasir) => doSubmit(pin, kasir)} onCancel={() => setPinOpen(false)} />

      {successData && (
        <div className="success-overlay" onClick={() => setSuccessData(null)}>
          <div className="success-modal" onClick={e => e.stopPropagation()}>
            <div className="check">✅</div>
            <h3>{successData.status} Berhasil!</h3>
            <div className="info-grid">
              {[
                ['ID Tebus', successData.idTebus],
                ['No Faktur', gadaiData?.no_faktur],
                ['Status', successData.status],
                ['Kasir', successData.kasir],
              ].map(([l, v]) => (
                <div className="info-row" key={l as string}>
                  <span className="info-label">{l}</span>
                  <span className="info-val">{v || '—'}</span>
                </div>
              ))}
            </div>
            <div className="success-actions">
              <button className="btn btn-primary btn-full" onClick={() => {
                const p = successData._print || {};
                printTebus({
                  idTebus: successData.idTebus,
                  noFaktur: p.noFaktur || '',
                  status: successData.status,
                  tglGadai: p.tglGadai || '',
                  tglTebus: successData.tglTebus || new Date().toLocaleDateString('id-ID'),
                  namaNasabah: p.namaNasabah || '',
                  noKtp: p.noKtp || '',
                  telp1: p.telp1 || '',
                  kategori: p.kategori || '',
                  barang: p.barang || '',
                  kelengkapan: p.kelengkapan || '',
                  grade: p.grade || '',
                  imeiSn: p.imeiSn || '',
                  locationGudang: p.locationGudang || '',
                  jumlahGadai: p.jumlahGadai || 0,
                  ujrahBerjalan: p.ujrahBerjalan || 0,
                  hariAktual: p.hariAktual || 0,
                  totalTebusSistem: p.totalTebusSistem || 0,
                  jumlahBayar: p.jumlahBayar || 0,
                  selisih: p.selisih || 0,
                  alasan: p.alasan || '',
                  idDiskon: successData.idDiskon || '',
                  idKehilangan: successData.idKehilangan || '',
                  tanpaSurat: p.tanpaSurat || false,
                  payment: p.payment || 'CASH',
                  kasir: successData.kasir,
                  outlet: successData.outlet || '',
                  alamat: successData.alamat || '',
                  kota: successData.kota || '',
                  telpon: successData.telpon || '',
                  namaPerusahaan: successData.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
                  waktuOperasional: successData.waktuOperasional || '',
                  taksiran: p.taksiran || 0,
                  cetakKontrak: !!successData.tglGadaiBaru,
                  barcodeA: p.barcodeA || '',
                  barcodeB: p.barcodeB || '',
                  tglGadaiBaru: successData.tglGadaiBaru || '',
                  tglJTBaru: successData.tglJTBaru || '',
                  tglSitaBaru: successData.tglSitaBaru || '',
                  jumlahGadaiBaru: p.jumlahGadaiBaru || 0,
                });
              }}>🖨️ Cetak</button>
              <button className="btn btn-outline btn-full" onClick={() => setSuccessData(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
