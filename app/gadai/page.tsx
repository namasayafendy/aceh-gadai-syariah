'use client';

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import PinModal from '@/components/ui/PinModal';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatNum, formatMoneyInput, formatMoneyInputSigned, parseMoney, formatDate } from '@/lib/format';
import { printGadai } from '@/lib/print';

const KATEGORI_OPTIONS = ['HANDPHONE', 'LAPTOP', 'ELEKTRONIK', 'EMAS', 'EMAS PAUN'];
const GRADE_OPTIONS = ['A', 'B', 'C', 'D'];

interface TodayRow {
  no_faktur: string; nama: string; barang: string;
  jumlah_gadai: number; tgl_jt: string; payment: string; kasir: string;
}

export default function GadaiPage() {
  const outletId = useOutletId();
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
  const [taksiranRaw, setTaksiranRaw] = useState('');
  const [jmlGadaiRaw, setJmlGadaiRaw] = useState('');
  const [ujrahPersen, setUjrahPersen] = useState('');
  const [ujrahNominalRaw, setUjrahNominalRaw] = useState('');
  const [ujrahManual, setUjrahManual] = useState(false);
  const [persenManual, setPersenManual] = useState(false);
  const [payment, setPayment] = useState<'CASH' | 'BANK' | 'SPLIT'>('CASH');
  const [cashRaw, setCashRaw] = useState('');
  const [bankRaw, setBankRaw] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [todayList, setTodayList] = useState<TodayRow[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [successData, setSuccessData] = useState<any>(null);

  const taksiran = parseMoney(taksiranRaw);
  const jmlGadai = parseMoney(jmlGadaiRaw);
  const ujrahNominal = parseMoney(ujrahNominalRaw);
  const isEmas = ['EMAS', 'EMAS PAUN'].includes(kategori);

  useEffect(() => {
    if (!kategori || !taksiran || !jmlGadai) return;
    if (jmlGadai > taksiran) return;
    const useEmasFlat = isEmas && jmlGadai <= 1000000;
    const persen = useEmasFlat ? 0 : isEmas ? 2.8 : (jmlGadai <= 3000000 ? 8 : 7);
    if (!persenManual) setUjrahPersen(useEmasFlat ? 'flat' : String(persen));
    if (!ujrahManual) {
      const ujrahPerHari = useEmasFlat ? 1000 : (persen / 100 / 30) * taksiran;
      const ujrahPerLima = isEmas ? 0 : (persen / 100 / 30) * 5 * taksiran;
      const nominal = useEmasFlat ? 30000 : isEmas
        ? Math.ceil(ujrahPerHari * 30 / 1000) * 1000
        : Math.ceil(ujrahPerLima * 6 / 1000) * 1000;
      setUjrahNominalRaw(nominal > 0 ? formatNum(nominal) : '');
    }
  }, [kategori, taksiran, jmlGadai, isEmas, persenManual, ujrahManual]);

  const breakdown = (() => {
    if (isEmas || !taksiran || !jmlGadai) return null;
    const persen = parseFloat(ujrahPersen) || 0;
    if (!persen) return null;
    if (ujrahManual) {
      if (!ujrahNominal) return null;
      const perPeriod = Math.ceil(ujrahNominal / 6 / 1000) * 1000;
      return [1, 2, 3, 4, 5, 6].map(i => perPeriod * i);
    } else {
      const ujrahPerLima = (persen / 100 / 30) * 5 * taksiran;
      return [1, 2, 3, 4, 5, 6].map(i => Math.ceil(ujrahPerLima * i / 1000) * 1000);
    }
  })();

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
    } catch {}
    setLoadingList(false);
  }, [outletId]);

  useEffect(() => { loadTodayList(); }, [loadTodayList]);

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
    if (noKtp.trim().replace(/\D/g, '').length !== 16) { setError('No KTP/NIK harus tepat 16 digit!'); return; }
    if (jmlGadai > taksiran) { setError('Jumlah gadai tidak boleh melebihi taksiran!'); return; }
    if (payment === 'SPLIT') {
      const c = parseMoney(cashRaw), b = parseMoney(bankRaw);
      if ((c + b) !== jmlGadai) { setError(`Total split (${formatRp(c + b)}) harus = Jumlah Gadai (${formatRp(jmlGadai)})`); return; }
    }
    setError(''); setPinOpen(true);
  }

  async function doSubmit(pin: string, kasirName: string) {
    setPinOpen(false); setSubmitting(true); setError('');
    const gradeVal = isEmas ? berat : grade;
    const cashVal = payment === 'CASH' ? jmlGadai : payment === 'BANK' ? 0 : parseMoney(cashRaw);
    const bankVal = payment === 'BANK' ? jmlGadai : payment === 'CASH' ? 0 : parseMoney(bankRaw);
    try {
      const res = await fetch('/api/gadai/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
        body: JSON.stringify({
          pin, nama: nama.trim(), noKtp: noKtp.trim(), telp1: telp1.trim(), telp2: telp2.trim(),
          kategori, barang: barang.trim(), kelengkapan: kelengkapan.trim(),
          grade: gradeVal, imeiSn: imeiSn.trim(), taksiran, jumlahGadai: jmlGadai,
          ujrahPersen: parseFloat(ujrahPersen) || 0, ujrahNominal,
          payment: payment === 'SPLIT' ? 'SPLIT' : payment, cash: cashVal, bank: bankVal,
        }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.msg || 'Gagal submit gadai'); setSubmitting(false); return; }
      setSuccessData({ ...json, kasir: kasirName });
      resetForm(); loadTodayList();
    } catch (e) { setError('Server error: ' + (e as Error).message); }
    setSubmitting(false);
  }

  function resetForm() {
    setNama(''); setNoKtp(''); setTelp1(''); setTelp2('');
    setKategori(''); setGrade(''); setBerat('');
    setBarang(''); setKelengkapan(''); setImeiSn('');
    setTaksiranRaw(''); setJmlGadaiRaw('');
    setUjrahPersen(''); setUjrahNominalRaw('');
    setUjrahManual(false); setPersenManual(false);
    setPayment('CASH'); setCashRaw(''); setBankRaw(''); setError('');
  }

  const showCalc = !!(kategori && taksiran && jmlGadai && jmlGadai <= taksiran);
  const useEmasFlat = isEmas && jmlGadai <= 1000000;
  const persenNum = parseFloat(ujrahPersen) || 0;

  return (
    <AppShell title="Gadai Baru" subtitle="Form input transaksi gadai">
      <div className="form-page">
        <div className="form-left">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Form Gadai Baru</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>SBR-?-????</div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={resetForm}>↺ Reset</button>
          </div>
          <div className="form-section-label">DATA NASABAH</div>
          <div className="form-group"><label>Nama Nasabah *</label><input value={nama} onChange={e => setNama(e.target.value.toUpperCase())} placeholder="Nama lengkap" /></div>
          <div className="form-row">
            <div className="form-group"><label>No KTP *</label><input value={noKtp} onChange={e => setNoKtp(e.target.value)} placeholder="16 digit NIK" maxLength={16} /></div>
            <div className="form-group"><label>Telepon 1 *</label><input value={telp1} onChange={e => setTelp1(e.target.value)} placeholder="08xx" /></div>
          </div>
          <div className="form-group"><label>Telepon 2</label><input value={telp2} onChange={e => setTelp2(e.target.value)} placeholder="Opsional" /></div>
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
              {isEmas ? <input type="number" value={berat} onChange={e => setBerat(e.target.value)} placeholder="gram" min="0" step="0.01" />
                : <select value={grade} onChange={e => setGrade(e.target.value)}><option value="">— Pilih —</option>{GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}</select>}
            </div>
          </div>
          <div className="form-group"><label>Nama Barang *</label><input value={barang} onChange={e => setBarang(e.target.value.toUpperCase())} placeholder="Merk / Type" /></div>
          <div className="form-row">
            <div className="form-group"><label>Kelengkapan *</label><input value={kelengkapan} onChange={e => setKelengkapan(e.target.value)} placeholder="Kotak, Cas" /></div>
            <div className="form-group"><label>IMEI / SN *</label><input value={imeiSn} onChange={e => setImeiSn(e.target.value)} placeholder="IMEI / SN" /></div>
          </div>
          <div className="form-section-label">NOMINAL</div>
          <div className="form-row">
            <div className="form-group"><label>Taksiran *</label><input value={taksiranRaw} inputMode="numeric" placeholder="0" onChange={e => setTaksiranRaw(formatMoneyInput(e.target.value))} /></div>
            <div className="form-group"><label>Jml Gadai *</label><input value={jmlGadaiRaw} inputMode="numeric" placeholder="0" style={jmlGadai > taksiran && taksiran > 0 ? { borderColor: 'var(--red)' } : {}} onChange={e => setJmlGadaiRaw(formatMoneyInput(e.target.value))} /></div>
          </div>
          {jmlGadai > taksiran && taksiran > 0 && <div className="alert-error">⚠️ Jumlah Gadai melebihi Taksiran ({formatRp(taksiran)})</div>}
          <div className="form-row">
            <div className="form-group"><label>Biaya Admin</label><input value="Rp 10.000" readOnly style={{ color: 'var(--text3)', cursor: 'not-allowed', background: 'var(--bg)' }} /><div className="hint">Fix Rp 10.000</div></div>
            <div className="form-group"><label>Ujrah %</label><input type="text" value={ujrahPersen} placeholder="%" onChange={e => { setUjrahPersen(e.target.value); setPersenManual(true); setUjrahManual(false); }} /></div>
          </div>
          <div className="form-group"><label>Ujrah (Nominal) — bisa diedit</label><input value={ujrahNominalRaw} inputMode="numeric" placeholder="0" onChange={e => { setUjrahNominalRaw(formatMoneyInput(e.target.value)); setUjrahManual(true); }} /></div>
          {showCalc && (
            <div className="calc-box">
              <div className="c-title">📐 Kalkulasi Ujrah</div>
              <div className="calc-row"><span className="c-lbl">Taksiran</span><span className="c-val">{formatRp(taksiran)}</span></div>
              <div className="calc-row"><span className="c-lbl">Ujrah {useEmasFlat ? 'flat' : `${persenNum}%/bln`} → per {isEmas ? 'hari' : '5 hari'}</span><span className="c-val">{useEmasFlat ? fmtRp(1000)+'/hari' : formatRp(isEmas ? Math.ceil((persenNum/100/30)*taksiran/1000)*1000 : Math.ceil((persenNum/100/30)*5*taksiran/1000)*1000)}</span></div>
              <div className="calc-row total"><span className="c-lbl">Jml Gadai Keluar</span><span className="c-val">{formatRp(jmlGadai)}</span></div>
              {breakdown && <div className="ujrah-breakdown"><div className="u-title">Tabel Ujrah (di Surat Kontrak)</div><div className="ujrah-grid">{breakdown.map((val,i) => <div key={i} className="ujrah-cell"><div className="u-period">{i*5+1}-{(i+1)*5} hari</div><div className="u-amount">{formatRp(val)}</div></div>)}</div></div>}
            </div>
          )}
          <div className="form-section-label">PEMBAYARAN</div>
          <div className="payment-tabs">{(['CASH','BANK','SPLIT'] as const).map(m => <div key={m} className={`ptab ${payment===m?'active':''}`} onClick={() => setPayment(m)}>{m==='CASH'?'💵 CASH':m==='BANK'?'🏦 BANK':'💵+🏦 SPLIT'}</div>)}</div>
          {payment === 'SPLIT' && <div className="form-row"><div className="form-group"><label>Cash</label><input value={cashRaw} inputMode="numeric" onChange={e => setCashRaw(formatMoneyInputSigned(e.target.value))} /></div><div className="form-group"><label>Bank</label><input value={bankRaw} inputMode="numeric" onChange={e => setBankRaw(formatMoneyInput(e.target.value))} /></div></div>}
          {payment === 'SPLIT' && <div style={{fontSize:11,color:'var(--text3)'}}>Total split: {formatRp(parseMoney(cashRaw)+parseMoney(bankRaw))}</div>}
          {error && <div className="alert-error">⚠️ {error}</div>}
          <div className="submit-area"><button className="btn btn-success btn-full" onClick={requestSubmit} disabled={submitting}>{submitting ? '⏳ Menyimpan...' : '💰 SUBMIT GADAI'}</button></div>
        </div>
        <div className="form-right">
          <div className="section-title" style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>Data Transaksi Gadai (Hari Ini)<button className="btn btn-outline btn-sm" onClick={loadTodayList} disabled={loadingList}>{loadingList?'⏳':'↻ Refresh'}</button></div>
          <div className="tbl-wrap"><table><thead><tr><th>No Faktur</th><th>Nama</th><th>Barang</th><th className="num">Gadai</th><th>JT</th><th>Bayar</th><th>Kasir</th></tr></thead><tbody>
            {todayList.length===0?<tr><td colSpan={7} className="empty-state">{loadingList?'Memuat...':'Belum ada transaksi hari ini'}</td></tr>
            :todayList.map((r,i)=><tr key={i}><td style={{fontFamily:'var(--mono)',fontSize:11}}>{r.no_faktur}</td><td style={{maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nama}</td><td style={{maxWidth:130,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.barang}</td><td className="num">{formatRp(r.jumlah_gadai)}</td><td style={{fontFamily:'var(--mono)',fontSize:11}}>{formatDate(r.tgl_jt)}</td><td><span className={`badge ${(r.payment||'').toLowerCase()}`}>{r.payment||'—'}</span></td><td>{r.kasir||'—'}</td></tr>)}
          </tbody></table></div>
        </div>
      </div>
      <PinModal open={pinOpen} action={`Submit Gadai — ${nama}`} onSuccess={(pin,k) => doSubmit(pin,k)} onCancel={() => setPinOpen(false)} />
      {successData && (
        <div className="success-overlay" onClick={() => setSuccessData(null)}><div className="success-modal" onClick={e => e.stopPropagation()}>
          <div className="check">✅</div><h3>Gadai Berhasil Disimpan!</h3>
          <div className="info-grid">{[['No Faktur',successData.noFaktur],['Tgl Gadai',successData.tglGadai],['Jatuh Tempo',successData.tglJT],['Tgl Sita',successData.tglSita],['Rak',successData.locationGudang||'—'],['Kasir',successData.kasir]].map(([l,v])=><div className="info-row" key={l}><span className="info-label">{l}</span><span className="info-val">{v||'—'}</span></div>)}</div>
          <div className="success-actions">
            <button className="btn btn-primary btn-full" onClick={() => {
              const printData = { ...successData, ujrahNominal: successData.ujrahNominal || ujrahNominal, ujrahPersen: successData.ujrahPersen || ujrahPersen, biayaAdmin: 10000 };
              printGadai(printData);
              // Backup kontrak ke Supabase Storage (fire-and-forget)
              fetch('/api/backup/kontrak', {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-outlet-id': String(outletId) },
                body: JSON.stringify({ tipe: 'GADAI', noFaktur: successData.noFaktur, ...printData }),
              }).catch(() => {});
            }}>Cetak Surat</button>
            <button className="btn btn-outline btn-full" onClick={() => setSuccessData(null)}>Tutup</button>
          </div>
        </div></div>
      )}
    </AppShell>
  );
}
function fmtRp(v:number){return 'Rp '+v.toLocaleString('id-ID');}
