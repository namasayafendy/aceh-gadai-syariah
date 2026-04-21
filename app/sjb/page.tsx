'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Jual Titip (SJB)
// File: app/sjb/page.tsx
// Migrasi dari jualtitip.html (GAS)
// Tab 1: Akad Baru SJB  |  Tab 2: Beli Kembali / Perpanjang
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatMoneyInput, formatMoneyInputSigned, parseMoney, formatDate } from '@/lib/format';
import { printSJB, printSJBTebus } from '@/lib/print';

const KATEGORI_SJB = ['HANDPHONE', 'LAPTOP', 'ELEKTRONIK'];
const GRADE_OPTIONS = [
  { val: 'A', label: 'A — Mulus' }, { val: 'B', label: 'B — Normal' },
  { val: 'C', label: 'C — Ada cacat' }, { val: 'D', label: 'D — Banyak lecet' },
];

export default function SJBPage() {
  const outletId = useOutletId();
  const [activeTab, setActiveTab] = useState<'akad' | 'buyback'>('akad');

  // ═══════════ AKAD BARU STATE ═══════════
  const [nama, setNama] = useState('');
  const [noKtp, setNoKtp] = useState('');
  const [telp1, setTelp1] = useState('');
  const [telp2, setTelp2] = useState('');
  const [alamatNasabah, setAlamatNasabah] = useState('');
  const [kategori, setKategori] = useState('');
  const [grade, setGrade] = useState('');
  const [barang, setBarang] = useState('');
  const [kelengkapan, setKelengkapan] = useState('');
  const [imeiSn, setImeiSn] = useState('');
  const [hargaJualRaw, setHargaJualRaw] = useState('');
  const [lamaTitip, setLamaTitip] = useState('30');
  const [hargaBuybackRaw, setHargaBuybackRaw] = useState('');
  const [akadPayment, setAkadPayment] = useState<'CASH' | 'BANK' | 'SPLIT'>('CASH');
  const [akadCashRaw, setAkadCashRaw] = useState('');
  const [akadBankRaw, setAkadBankRaw] = useState('');
  // Fase 2: transfer fields untuk Akad SJB (saat bank > 0)
  const [akadTrfNama, setAkadTrfNama] = useState('');
  const [akadTrfNoRek, setAkadTrfNoRek] = useState('');
  const [akadTrfBank, setAkadTrfBank] = useState('');
  const [akadError, setAkadError] = useState('');
  const [akadSubmitting, setAkadSubmitting] = useState(false);
  const [akadPinOpen, setAkadPinOpen] = useState(false);
  const [akadSuccess, setAkadSuccess] = useState<any>(null);
  const [akadTodayList, setAkadTodayList] = useState<any[]>([]);

  // Auto-fill buyback (+10%)
  useEffect(() => {
    const hj = parseMoney(hargaJualRaw);
    if (hj > 0) {
      const bb = Math.ceil(hj * 1.1 / 1000) * 1000;
      setHargaBuybackRaw(bb.toLocaleString('id-ID'));
    }
  }, [hargaJualRaw]);

  const hargaJual = parseMoney(hargaJualRaw);
  const hargaBuyback = parseMoney(hargaBuybackRaw);

  // JT preview
  const jtDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + (parseInt(lamaTitip) || 30));
    return d.toLocaleDateString('id-ID');
  })();

  function resetAkadForm() {
    setNama(''); setNoKtp(''); setTelp1(''); setTelp2(''); setAlamatNasabah('');
    setKategori(''); setGrade(''); setBarang(''); setKelengkapan(''); setImeiSn('');
    setHargaJualRaw(''); setLamaTitip('30'); setHargaBuybackRaw('');
    setAkadPayment('CASH'); setAkadCashRaw(''); setAkadBankRaw(''); setAkadError('');
    setAkadTrfNama(''); setAkadTrfNoRek(''); setAkadTrfBank('');
  }

  function requestSubmitAkad() {
    const errs: string[] = [];
    if (!nama.trim()) errs.push('Nama');
    if (!noKtp.trim()) errs.push('No KTP/NIK');
    if (!telp1.trim()) errs.push('No. HP');
    if (!kategori) errs.push('Kategori');
    if (!barang.trim()) errs.push('Barang');
    if (!hargaJual) errs.push('Harga Jual');
    if (!hargaBuyback) errs.push('Harga Buyback');
    if (errs.length) { setAkadError('Field wajib: ' + errs.join(', ')); return; }
    if (noKtp.trim().replace(/\D/g, '').length !== 16) { setAkadError('No KTP/NIK harus tepat 16 digit!'); return; }
    if (hargaBuyback <= hargaJual) { setAkadError('Harga Buyback harus > Harga Jual'); return; }
    if (akadPayment === 'SPLIT') {
      const c = parseMoney(akadCashRaw), b = parseMoney(akadBankRaw);
      if (Math.abs(c + b - hargaJual) > 1) {
        setAkadError(`Total split (${formatRp(c + b)}) harus = Harga Jual (${formatRp(hargaJual)})`); return;
      }
    }
    // Fase 2: validasi transfer saat ada bank portion
    const bankPortion = akadPayment === 'BANK' ? hargaJual : (akadPayment === 'SPLIT' ? parseMoney(akadBankRaw) : 0);
    if (bankPortion > 0) {
      const te: string[] = [];
      if (!akadTrfNama.trim()) te.push('Nama Penerima Transfer');
      if (!akadTrfNoRek.trim()) te.push('No Rekening');
      if (!akadTrfBank.trim()) te.push('Bank');
      if (te.length) { setAkadError('Pembayaran via bank, field transfer wajib: ' + te.join(', ')); return; }
    }
    setAkadError(''); setAkadPinOpen(true);
  }

  async function doSubmitAkad(pin: string, kasirName: string) {
    setAkadPinOpen(false); setAkadSubmitting(true); setAkadError('');
    const cashVal = akadPayment === 'CASH' ? hargaJual : akadPayment === 'BANK' ? 0 : parseMoney(akadCashRaw);
    const bankVal = akadPayment === 'BANK' ? hargaJual : akadPayment === 'CASH' ? 0 : parseMoney(akadBankRaw);
    try {
      const res = await fetch('/api/sjb/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({
          pin, nama: nama.trim(), noKtp: noKtp.trim(), alamatNasabah: alamatNasabah.trim(), telp1: telp1.trim(), telp2: telp2.trim(),
          kategori, grade, barang: barang.trim(), kelengkapan: kelengkapan.trim(), imeiSn: imeiSn.trim(),
          hargaJual, lamaTitip: parseInt(lamaTitip) || 30, hargaBuyback,
          payment: akadPayment === 'SPLIT' ? 'SPLIT' : akadPayment,
          cash: cashVal, bank: bankVal,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setAkadError(json.msg || 'Gagal submit'); setAkadSubmitting(false); return; }
      // ── Fase 2: fire transfer request jika Akad punya bank portion ──
      let trfInfo: { notifSent: boolean; id?: number; msg?: string } | null = null;
      if (bankVal > 0 && akadTrfNama.trim() && akadTrfNoRek.trim() && akadTrfBank.trim()) {
        try {
          const trfRes = await fetch('/api/transfer/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
            body: JSON.stringify({
              pin, tipe: 'SJB',
              // SJB submit response return `noSJB` (bukan `noFaktur`) — fallback utk safety
              // ref_id column di tb_transfer_request bertipe bigint, sedangkan json.idSJB berupa string
              // (contoh: "SJB-1-20260421-6015") → kirim null supaya INSERT tidak 400. Samakan pattern
              // dengan gadai/tambah/tebus yg juga pakai null.
              refTable: 'tb_sjb', refNoFaktur: json.noSJB ?? json.noFaktur, refId: null,
              nominal: bankVal,
              namaPenerima: akadTrfNama.trim(), noRek: akadTrfNoRek.trim(), bank: akadTrfBank.trim(),
              namaNasabah: nama.trim(), barang: barang.trim(),
            }),
          });
          const trfJson = await trfRes.json();
          trfInfo = trfJson.ok
            ? { notifSent: !!trfJson.notifSent, id: trfJson.id, msg: trfJson.msg }
            : { notifSent: false, msg: trfJson.msg ?? 'Gagal kirim notif transfer' };
        } catch (e) {
          trfInfo = { notifSent: false, msg: 'Error notif: ' + (e as Error).message };
        }
      }
      // BUG FIX: simpan semua data dari response SEBELUM reset form
      // API response sudah include: nama, noKtp, kategori, barang, grade,
      // kelengkapan, imeiSn, hargaJual, hargaBuyback, lamaTitip, locationGudang, dll
      setAkadSuccess({ ...json, kasir: kasirName, telp1: telp1.trim(), alamatNasabah: alamatNasabah.trim(), transfer: trfInfo });
      resetAkadForm(); loadAkadToday();
    } catch (e) { setAkadError('Server error: ' + (e as Error).message); }
    setAkadSubmitting(false);
  }

  const loadAkadToday = useCallback(async () => {
    try {
      const tgl = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/laporan/harian?tgl=${tgl}&outletId=${outletId}`);
      const json = await res.json();
      if (json.ok && json.sjb) setAkadTodayList(json.sjb);
    } catch { /* silent */ }
  }, [outletId]);

  useEffect(() => { loadAkadToday(); }, [loadAkadToday]);

  // ═══════════ BUYBACK STATE ═══════════
  const [bbBarcode, setBbBarcode] = useState('');
  const [bbSearching, setBbSearching] = useState(false);
  const [bbSearchError, setBbSearchError] = useState('');
  const [bbData, setBbData] = useState<any>(null);
  const [bbTanpaSurat, setBbTanpaSurat] = useState(false); // FIX: track tanpaSurat dari search
  const [bbStatus, setBbStatus] = useState('');
  const [bbJmlBayarRaw, setBbJmlBayarRaw] = useState('');
  const [bbAlasan, setBbAlasan] = useState('');
  const [bbPayment, setBbPayment] = useState<'CASH' | 'BANK' | 'SPLIT'>('CASH');
  const [bbCashRaw, setBbCashRaw] = useState('');
  const [bbBankRaw, setBbBankRaw] = useState('');
  const [bbError, setBbError] = useState('');
  const [bbSubmitting, setBbSubmitting] = useState(false);
  const [bbPinOpen, setBbPinOpen] = useState(false);
  const [bbSuccess, setBbSuccess] = useState<any>(null);
  const [bbTotalSistem, setBbTotalSistem] = useState(0);

  async function searchBuyback() {
    const bc = bbBarcode.trim().toUpperCase();
    if (!bc) { setBbSearchError('Masukkan barcode atau No. SJB'); return; }
    setBbSearching(true); setBbSearchError(''); setBbData(null); setBbStatus(''); setBbTanpaSurat(false);
    try {
      const res = await fetch('/api/gadai/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({ barcode: bc, outletId }),
      });
      const json = await res.json();
      if (!json.ok) { setBbSearchError(json.msg); setBbSearching(false); return; }
      setBbData(json.data);
      // FIX: simpan tanpaSurat flag dari search response (sesuai GAS)
      setBbTanpaSurat(json.tanpaSurat === true);
    } catch (e) { setBbSearchError('Error: ' + (e as Error).message); }
    setBbSearching(false);
  }

  // Calc buyback total when status changes
  useEffect(() => {
    if (!bbStatus || !bbData) return;
    const hj = bbData.harga_jual || 0;
    const hbb = bbData.harga_buyback || 0;
    let total = 0;
    if (bbStatus === 'BUYBACK') total = hbb;
    else if (bbStatus === 'PERPANJANG') total = Math.ceil((hbb - hj) / 1000) * 1000; // ujrah portion
    else if (bbStatus === 'SITA') total = hj;
    if (total > 0) total = Math.ceil(total / 1000) * 1000;
    setBbTotalSistem(total);
    if (bbStatus !== 'SITA') setBbJmlBayarRaw(total > 0 ? total.toLocaleString('id-ID') : '');
  }, [bbStatus, bbData]);

  // FIX: validasi client-side sesuai GAS (diskon, tanpaSurat, catatan wajib)
  function requestSubmitBuyback() {
    if (!bbStatus) { setBbError('Pilih aksi'); return; }
    if (!bbData) { setBbError('Scan barcode dulu'); return; }

    const jmlBayar = parseMoney(bbJmlBayarRaw);
    const al = bbAlasan.trim();

    if (bbStatus !== 'SITA') {
      if (!jmlBayar) { setBbError('Isi Jumlah Bayar'); return; }

      // FIX Bug 4+5: Wajib catatan jika ada diskon (sesuai GAS)
      const adaDiskon = jmlBayar < bbTotalSistem;
      if (adaDiskon && (!al || al.replace(/\s+/g, '').length < 2)) {
        setBbError(
          `Jumlah bayar (${formatRp(jmlBayar)}) lebih kecil dari sistem (${formatRp(bbTotalSistem)})! ` +
          `Ada selisih ${formatRp(bbTotalSistem - jmlBayar)} — Catatan WAJIB diisi.`
        );
        return;
      }

      // FIX Bug 3+5: Wajib catatan jika tanpa surat (sesuai GAS)
      if (bbTanpaSurat && (!al || al.replace(/\s+/g, '').length < 2)) {
        setBbError('Transaksi TANPA SURAT: Catatan wajib diisi.');
        return;
      }

      // Split validation
      if (bbPayment === 'SPLIT') {
        const sc = parseMoney(bbCashRaw), sb = parseMoney(bbBankRaw);
        if (sb <= 0) { setBbError('Bagian Bank harus > 0 untuk split'); return; }
        if (Math.abs(sc + sb - jmlBayar) > 1) {
          setBbError(`Total split (${formatRp(sc + sb)}) tidak sama dengan Jumlah Bayar (${formatRp(jmlBayar)})`);
          return;
        }
      }
    }

    setBbError(''); setBbPinOpen(true);
  }

  async function doSubmitBuyback(pin: string, kasirName: string) {
    setBbPinOpen(false); setBbSubmitting(true); setBbError('');
    const jmlBayar = parseMoney(bbJmlBayarRaw);
    const cashVal = bbPayment === 'CASH' ? jmlBayar : bbPayment === 'BANK' ? 0 : parseMoney(bbCashRaw);
    const bankVal = bbPayment === 'BANK' ? jmlBayar : bbPayment === 'CASH' ? 0 : parseMoney(bbBankRaw);
    try {
      const res = await fetch('/api/sjb/buyback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({
          pin, status: bbStatus, idSJB: bbData.id, noSJB: bbData.no_faktur,
          barcodeA: bbData.barcode_a, nama: bbData.nama,
          kategori: bbData.kategori, barang: bbData.barang,
          taksiran: bbData.taksiran || bbData.harga_jual,
          hargaJual: bbData.harga_jual,
          hariAktual: 0, ujrahBerjalan: 0,
          totalSistem: bbTotalSistem, jumlahBayar: jmlBayar,
          alasan: bbAlasan.trim(),
          payment: bbPayment === 'SPLIT' ? 'SPLIT' : bbPayment,
          cash: cashVal, bank: bankVal,
          tanpaSurat: bbTanpaSurat, // FIX: pass tanpaSurat ke API
        }),
      });
      const json = await res.json();
      if (!json.ok) { setBbError(json.msg || 'Gagal submit'); setBbSubmitting(false); return; }
      // Simpan semua data SJB dari bbData untuk cetak nota SEBELUM reset
      setBbSuccess({
        ...json, kasir: kasirName, status: bbStatus,
        // Data kontrak SJB dari bbData (akan di-reset setelah ini)
        _noSJB: bbData.no_faktur, _nama: bbData.nama, _noKtp: bbData.no_ktp || '',
        _telp1: bbData.telp1 || '', _kategori: bbData.kategori, _barang: bbData.barang,
        _kelengkapan: bbData.kelengkapan || '', _grade: bbData.grade || '', _imeiSn: bbData.imei_sn || '',
        _hargaJual: bbData.harga_jual || 0, _hargaBuyback: bbData.harga_buyback || 0,
        _lamaTitip: bbData.lama_titip || 30,
        _locationGudang: bbData.rak || '', _barcodeA: bbData.barcode_a || '', _barcodeB: bbData.barcode_b || bbData.no_faktur || '',
        _tglJual: bbData.tgl_gadai || '',
        _totalSistem: bbTotalSistem, _jumlahBayar: jmlBayar, _alasan: bbAlasan.trim(),
        _hariAktual: 0,
      });
      setBbBarcode(''); setBbData(null); setBbStatus(''); setBbJmlBayarRaw(''); setBbAlasan(''); setBbTanpaSurat(false);
    } catch (e) { setBbError('Server error: ' + (e as Error).message); }
    setBbSubmitting(false);
  }

  return (
    <AppShell title="Jual Titip (SJB)" subtitle="Akad baru & Beli Kembali">
      {/* Tab bar */}
      <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', flexShrink: 0 }}>
        <button onClick={() => setActiveTab('akad')}
          style={{ flex: 1, padding: 12, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: activeTab === 'akad' ? 'var(--accent)' : 'var(--surface2)', color: activeTab === 'akad' ? '#fff' : 'var(--text2)' }}>
          📋 Akad Baru SJB
        </button>
        <button onClick={() => setActiveTab('buyback')}
          style={{ flex: 1, padding: 12, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: activeTab === 'buyback' ? 'var(--accent)' : 'var(--surface2)', color: activeTab === 'buyback' ? '#fff' : 'var(--text2)' }}>
          🔁 Beli Kembali / Perpanjang
        </button>
      </div>

      {/* ═══ TAB AKAD BARU ═══ */}
      {activeTab === 'akad' && (
        <div className="form-page">
          <div className="form-left" style={{ width: 680, maxWidth: 680 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Akad Jual Titip Baru (SJB)</div>
                <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>Surat Perjanjian Jual dan Beli Kembali</div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={resetAkadForm}>↺ Reset</button>
            </div>

            <div className="form-section-label">Data Pemilik Barang</div>
            <div className="form-group">
              <label>Nama Pemilik *</label>
              <input value={nama} onChange={e => setNama(e.target.value.toUpperCase())} placeholder="Nama lengkap" />
            </div>
            <div className="form-row">
              <div className="form-group"><label>No KTP/NIK *</label><input value={noKtp} onChange={e => setNoKtp(e.target.value)} maxLength={16} placeholder="16 digit NIK" inputMode="numeric" /></div>
              <div className="form-group"><label>No. HP *</label><input value={telp1} onChange={e => setTelp1(e.target.value)} placeholder="08xx" /></div>
            </div>
            <div className="form-group"><label>No. HP 2</label><input value={telp2} onChange={e => setTelp2(e.target.value)} placeholder="Opsional" /></div>
            <div className="form-group"><label>Alamat</label><input value={alamatNasabah} onChange={e => setAlamatNasabah(e.target.value)} placeholder="Alamat pemilik barang" /></div>

            <div className="form-section-label">Data Barang Titipan</div>
            <div className="form-row">
              <div className="form-group">
                <label>Kategori *</label>
                <select value={kategori} onChange={e => setKategori(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {KATEGORI_SJB.map(k => <option key={k}>{k}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Grade *</label>
                <select value={grade} onChange={e => setGrade(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {GRADE_OPTIONS.map(g => <option key={g.val} value={g.val}>{g.label}</option>)}
                </select>
              </div>
            </div>
            <div className="form-group"><label>Nama Barang *</label><input value={barang} onChange={e => setBarang(e.target.value)} placeholder="Merk / Type" /></div>
            <div className="form-row">
              <div className="form-group"><label>Kelengkapan</label><input value={kelengkapan} onChange={e => setKelengkapan(e.target.value)} placeholder="Kotak, Cas, dll" /></div>
              <div className="form-group"><label>IMEI / SN</label><input value={imeiSn} onChange={e => setImeiSn(e.target.value)} placeholder="IMEI / SN" /></div>
            </div>

            <div className="form-section-label">Nilai & Masa Titip</div>
            <div className="form-row">
              <div className="form-group">
                <label>Harga Jual Titip *</label>
                <input value={hargaJualRaw} inputMode="numeric" placeholder="0" onChange={e => setHargaJualRaw(formatMoneyInput(e.target.value))} />
              </div>
              <div className="form-group">
                <label>Lama Titip (hari) *</label>
                <input type="number" value={lamaTitip} min="1" max="180" onChange={e => setLamaTitip(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label>Harga Buyback * (auto +10%, bisa edit)</label>
              <input value={hargaBuybackRaw} inputMode="numeric" onChange={e => setHargaBuybackRaw(formatMoneyInput(e.target.value))} />
            </div>

            {hargaJual > 0 && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>📊 Ringkasan Kontrak</div>
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  <span>Harga Jual: <b>{formatRp(hargaJual)}</b></span>
                  <span>Buyback: <b style={{ color: 'var(--red)' }}>{formatRp(hargaBuyback)}</b></span>
                  <span>JT: <b style={{ color: 'var(--warn)' }}>{jtDate}</b></span>
                </div>
              </div>
            )}

            <div className="form-section-label">Pembayaran ke Pemilik</div>
            <div className="payment-tabs">
              {(['CASH', 'BANK', 'SPLIT'] as const).map(m => (
                <div key={m} className={`ptab ${akadPayment === m ? 'active' : ''}`} onClick={() => setAkadPayment(m)}>
                  {m === 'CASH' ? '💵 Cash' : m === 'BANK' ? '🏦 Bank' : '↔️ Split'}
                </div>
              ))}
            </div>
            {akadPayment === 'SPLIT' && (
              <div className="form-row">
                <div className="form-group"><label>Cash</label><input value={akadCashRaw} inputMode="numeric" onChange={e => setAkadCashRaw(formatMoneyInputSigned(e.target.value))} /></div>
                <div className="form-group"><label>Bank</label><input value={akadBankRaw} inputMode="numeric" onChange={e => setAkadBankRaw(formatMoneyInput(e.target.value))} /></div>
              </div>
            )}

            {/* Fase 2: field transfer — muncul saat ada bank portion */}
            {(akadPayment === 'BANK' || (akadPayment === 'SPLIT' && parseMoney(akadBankRaw) > 0)) && (
              <div style={{ marginTop: 10, padding: 10, background: 'var(--surface2)', borderRadius: 6, border: '1px dashed var(--border)' }}>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>🏦 Data Transfer (untuk approval via Telegram)</div>
                <div className="form-row">
                  <div className="form-group"><label>Nama Penerima *</label><input value={akadTrfNama} onChange={e => setAkadTrfNama(e.target.value.toUpperCase())} placeholder="Sesuai rekening" /></div>
                  <div className="form-group"><label>Bank *</label><input value={akadTrfBank} onChange={e => setAkadTrfBank(e.target.value.toUpperCase())} placeholder="mis. BSI, BCA" /></div>
                </div>
                <div className="form-group"><label>No Rekening *</label><input value={akadTrfNoRek} onChange={e => setAkadTrfNoRek(e.target.value)} placeholder="No rekening" inputMode="numeric" /></div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>Notif akan dikirim ke grup Telegram outlet setelah SJB tersimpan.</div>
              </div>
            )}

            {akadError && <div className="alert-error">{akadError}</div>}
            <div className="submit-area">
              <button className="btn btn-primary btn-full" onClick={requestSubmitAkad} disabled={akadSubmitting}>
                {akadSubmitting ? '⏳ Menyimpan...' : '📋 SUBMIT AKAD SJB'}
              </button>
            </div>
          </div>

          <div className="form-right">
            <div className="section-title">Akad SJB Hari Ini</div>
            <div className="tbl-wrap">
              <table><thead><tr><th>No SJB</th><th>Nama</th><th>Barang</th><th className="num">Harga Jual</th><th className="num">Buyback</th><th>Kasir</th></tr></thead>
                <tbody>
                  {akadTodayList.length === 0 ? (
                    <tr><td colSpan={6} className="empty-state">Belum ada akad hari ini</td></tr>
                  ) : akadTodayList.map((r: any, i: number) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--mono)', fontSize: 11 }}>{r.no_faktur}</td>
                      <td>{r.nama}</td><td>{r.barang}</td>
                      <td className="num">{formatRp(r.harga_jual)}</td>
                      <td className="num">{formatRp(r.harga_buyback)}</td>
                      <td>{r.kasir || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB BUYBACK ═══ */}
      {activeTab === 'buyback' && (
        <div className="form-page">
          <div className="form-left">
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Beli Kembali / Perpanjang SJB</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>Scan barcode atau ketik No. SJB</div>

            <div className="form-group">
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={bbBarcode} style={{ flex: 1, fontFamily: 'var(--mono)' }}
                  onChange={e => setBbBarcode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && searchBuyback()} placeholder="Scan / No. SJB..." />
                <button className="btn btn-primary" onClick={searchBuyback} disabled={bbSearching}>
                  {bbSearching ? '⏳' : 'Cari'}
                </button>
              </div>
            </div>
            {bbSearchError && <div className="alert-error">{bbSearchError}</div>}

            {bbData && (
              <>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12, marginBottom: 14, fontSize: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
                    <div>No SJB: <b>{bbData.no_faktur}</b></div>
                    <div>Status: <b>{bbData.status}</b></div>
                    <div>Nama: <b>{bbData.nama}</b></div>
                    <div>Kategori: <b>{bbData.kategori}</b></div>
                    <div>Harga Jual: <b>{formatRp(bbData.harga_jual)}</b></div>
                    <div>Buyback: <b>{formatRp(bbData.harga_buyback)}</b></div>
                    <div style={{ gridColumn: 'span 2' }}>Barang: <b>{bbData.barang}</b></div>
                  </div>
                </div>

                {/* FIX Bug 3: Warning tanpa surat (sesuai GAS) */}
                {bbTanpaSurat && (
                  <div style={{ background: '#fff3cd', border: '1px solid #f59e0b', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: '#92400e' }}>
                    ⚠️ <b>TRANSAKSI TANPA SURAT</b> — Pemilik tidak membawa SJB asli. Catatan wajib diisi.
                  </div>
                )}

                <div className="form-group">
                  <label>Pilih Aksi *</label>
                  <select value={bbStatus} onChange={e => setBbStatus(e.target.value)}>
                    <option value="">— Pilih —</option>
                    <option value="BUYBACK">BELI KEMBALI (Buyback)</option>
                    <option value="PERPANJANG">PERPANJANG</option>
                    <option value="SITA">SITA</option>
                  </select>
                </div>

                {bbStatus && (
                  <>
                    <div className="calc-box">
                      <div className="c-title">📊 Kalkulasi</div>
                      <div className="calc-row total">
                        <span className="c-lbl">{bbStatus === 'BUYBACK' ? 'Total Beli Kembali' : bbStatus === 'PERPANJANG' ? 'Ujrah Perpanjang' : 'Nilai Sita'}</span>
                        <span className="c-val">{formatRp(bbTotalSistem)}</span>
                      </div>
                    </div>

                    {bbStatus !== 'SITA' && (
                      <>
                        <div className="form-group">
                          <label>Jumlah Bayar *</label>
                          <input value={bbJmlBayarRaw} inputMode="numeric" onChange={e => setBbJmlBayarRaw(formatMoneyInput(e.target.value))} />
                        </div>
                        <div className="form-group">
                          <label>Catatan / Alasan {(bbTanpaSurat || (parseMoney(bbJmlBayarRaw) > 0 && parseMoney(bbJmlBayarRaw) < bbTotalSistem)) ? <span style={{ color: 'var(--red)' }}>* wajib jika diskon/tanpa surat</span> : null}</label>
                          <input value={bbAlasan} onChange={e => setBbAlasan(e.target.value)} placeholder="Alasan diskon, keterangan kehilangan surat, dll" />
                        </div>
                        <div className="payment-tabs">
                          {(['CASH', 'BANK', 'SPLIT'] as const).map(m => (
                            <div key={m} className={`ptab ${bbPayment === m ? 'active' : ''}`} onClick={() => setBbPayment(m)}>
                              {m === 'CASH' ? 'Cash' : m === 'BANK' ? 'Bank' : 'Split'}
                            </div>
                          ))}
                        </div>
                        {bbPayment === 'SPLIT' && (
                          <div className="form-row">
                            <div className="form-group"><label>Cash</label><input value={bbCashRaw} inputMode="numeric" onChange={e => setBbCashRaw(formatMoneyInputSigned(e.target.value))} /></div>
                            <div className="form-group"><label>Bank</label><input value={bbBankRaw} inputMode="numeric" onChange={e => setBbBankRaw(formatMoneyInput(e.target.value))} /></div>
                          </div>
                        )}
                      </>
                    )}

                    {bbError && <div className="alert-error">{bbError}</div>}
                    <div className="submit-area">
                      <button className="btn btn-success btn-full" onClick={requestSubmitBuyback} disabled={bbSubmitting}>
                        {bbSubmitting ? '⏳' : `SUBMIT ${bbStatus}`}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          <div className="form-right">
            <div className="section-title">Buyback Hari Ini</div>
            <div className="tbl-wrap">
              <table><thead><tr><th>No SJB</th><th>Nama</th><th>Status</th><th className="num">Bayar</th><th>Kasir</th></tr></thead>
                <tbody><tr><td colSpan={5} className="empty-state">—</td></tr></tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* PIN Modals */}
      <PinModal open={akadPinOpen} action={`Akad SJB — ${nama}`}
        onSuccess={(pin, k) => doSubmitAkad(pin, k)} onCancel={() => setAkadPinOpen(false)} />
      <PinModal open={bbPinOpen} action={`${bbStatus} — ${bbData?.no_faktur || ''}`}
        onSuccess={(pin, k) => doSubmitBuyback(pin, k)} onCancel={() => setBbPinOpen(false)} />

      {/* Success Modals */}
      {akadSuccess && (
        <div className="success-overlay" onClick={() => setAkadSuccess(null)}>
          <div className="success-modal" onClick={e => e.stopPropagation()}>
            <div className="check">✅</div>
            <h3>Akad SJB Berhasil!</h3>
            <div style={{ fontSize: 12, margin: '8px 0 12px', textAlign: 'left' }}>
              <div>No SJB: <b>{akadSuccess.noSJB}</b></div>
              <div>Nama: <b>{akadSuccess.nama}</b></div>
              <div>Barang: <b>{akadSuccess.barang}</b></div>
              <div>Harga Jual: <b>{formatRp(akadSuccess.hargaJual)}</b></div>
              <div>Buyback: <b>{formatRp(akadSuccess.hargaBuyback)}</b></div>
              <div>Rak: <b>{akadSuccess.locationGudang || '—'}</b></div>
            </div>
            <div className="success-actions">
              {/* BUG FIX 1+2: pakai data dari akadSuccess (API response), BUKAN form state yg sudah di-reset */}
              <button className="btn btn-primary btn-full" onClick={() => {
                printSJB({
                  noSJB: akadSuccess.noSJB || '',
                  nama: akadSuccess.nama || '',
                  noKtp: akadSuccess.noKtp || '',
                  telp1: akadSuccess.telp1 || '',
                  kategori: akadSuccess.kategori || '',
                  barang: akadSuccess.barang || '',
                  kelengkapan: akadSuccess.kelengkapan || '',
                  grade: akadSuccess.grade || '',
                  imeiSn: akadSuccess.imeiSn || '',
                  hargaJual: akadSuccess.hargaJual || 0,
                  hargaBuyback: akadSuccess.hargaBuyback || 0,
                  lamaTitip: akadSuccess.lamaTitip || 30,
                  tglJual: akadSuccess.tglJual || '',
                  tglJT: akadSuccess.tglJT || '',
                  barcodeA: akadSuccess.barcodeA || '',
                  barcodeB: akadSuccess.barcodeB || '',
                  kasir: akadSuccess.kasir || '',
                  outlet: akadSuccess.outlet || '',
                  alamat: akadSuccess.alamat || '',
                  kota: akadSuccess.kota || '',
                  telpon: akadSuccess.telpon || '',
                  namaPerusahaan: akadSuccess.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
                  locationGudang: akadSuccess.locationGudang || '',
                });
                // Backup kontrak ke Supabase Storage (fire-and-forget)
                fetch('/api/backup/kontrak', {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
                  body: JSON.stringify({ tipe: 'SJB', noFaktur: akadSuccess.noSJB || '', ...akadSuccess }),
                }).catch(() => {});
              }}>Cetak Kontrak</button>
              <button className="btn btn-outline btn-full" onClick={() => setAkadSuccess(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}

      {bbSuccess && (
        <div className="success-overlay" onClick={() => setBbSuccess(null)}>
          <div className="success-modal" onClick={e => e.stopPropagation()}>
            <div className="check">✅</div>
            <h3>{bbSuccess.status} Berhasil!</h3>
            <div className="success-actions">
              <button className="btn btn-primary btn-full" onClick={() => {
                const selisih = Math.max(0, (bbSuccess._totalSistem || 0) - (bbSuccess._jumlahBayar || 0));
                printSJBTebus({
                  idBB: bbSuccess.idBB || '', noSJB: bbSuccess.noSJB || bbSuccess._noSJB || '',
                  status: bbSuccess.status || '',
                  tglJual: bbSuccess._tglJual || '', tglBB: bbSuccess.tglBB || '',
                  nama: bbSuccess._nama || bbSuccess.namaNasabah || '',
                  noKtp: bbSuccess._noKtp || '', telp1: bbSuccess._telp1 || '',
                  kategori: bbSuccess._kategori || '', barang: bbSuccess._barang || '',
                  hargaJual: bbSuccess._hargaJual || 0,
                  hariAktual: bbSuccess._hariAktual || 0,
                  ujrahBerjalan: bbSuccess._totalSistem || 0,
                  totalSistem: bbSuccess._totalSistem || 0,
                  jumlahBayar: bbSuccess._jumlahBayar || 0,
                  selisih: selisih,
                  alasan: bbSuccess._alasan || '',
                  idDiskon: bbSuccess.idDiskon || '',
                  tanpaSurat: bbSuccess.tanpaSurat || false,
                  idKehilangan: bbSuccess.idKehilangan || '',
                  locationGudang: bbSuccess._locationGudang || '',
                  kasir: bbSuccess.kasir || '',
                  outlet: bbSuccess.outlet || '',
                  alamat: bbSuccess.alamat || '',
                  kota: bbSuccess.kota || '',
                  telpon: bbSuccess.telpon || '',
                  namaPerusahaan: bbSuccess.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
                  waktuOperasional: bbSuccess.waktuOperasional || '',
                  // Cetak Nota = HANYA nota + surat diskon + surat kehilangan, TANPA kontrak baru
                  cetakKontrak: false,
                });
                // Backup nota ke Supabase Storage (fire-and-forget)
                fetch('/api/backup/kontrak', {
                  method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
                  body: JSON.stringify({ tipe: 'BUYBACK', noFaktur: bbSuccess.noSJB || bbSuccess._noSJB || '', ...bbSuccess }),
                }).catch(() => {});
              }}>Cetak Nota</button>
              {bbSuccess.status === 'PERPANJANG' && (
                <button className="btn btn-outline btn-full" onClick={() => {
                  // Cetak kontrak baru saja (tanpa nota)
                  printSJB({
                    noSJB: bbSuccess._noSJB || bbSuccess.noSJB || '',
                    nama: bbSuccess._nama || '', noKtp: bbSuccess._noKtp || '',
                    telp1: bbSuccess._telp1 || '',
                    kategori: bbSuccess._kategori || '', barang: bbSuccess._barang || '',
                    kelengkapan: bbSuccess._kelengkapan || '', grade: bbSuccess._grade || '',
                    imeiSn: bbSuccess._imeiSn || '',
                    hargaJual: bbSuccess._hargaJual || 0,
                    hargaBuyback: bbSuccess._hargaBuyback || 0,
                    lamaTitip: bbSuccess._lamaTitip || 30,
                    tglJual: bbSuccess.tglJualBaru || '',
                    tglJT: bbSuccess.tglJTBaru || '',
                    locationGudang: bbSuccess._locationGudang || '',
                    barcodeA: bbSuccess._barcodeA || '', barcodeB: bbSuccess._barcodeB || '',
                    kasir: bbSuccess.kasir || '', outlet: bbSuccess.outlet || '',
                    alamat: bbSuccess.alamat || '', kota: bbSuccess.kota || '',
                    telpon: bbSuccess.telpon || '',
                    namaPerusahaan: bbSuccess.namaPerusahaan || 'PT. ACEH GADAI SYARIAH',
                    waktuOperasional: bbSuccess.waktuOperasional || '',
                  });
                }}>📄 Cetak Kontrak Baru</button>
              )}
              <button className="btn btn-outline btn-full" onClick={() => setBbSuccess(null)}>Tutup</button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
