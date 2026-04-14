'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Laporan Malam
// File: app/laporan/page.tsx
// Replika 100% dari laporanmalam.html (GAS)
// Termasuk: highlight anomali (diskon/tanpa surat), rekap laba,
// tabel terpisah per status, buyback SJB
// ============================================================

import { useState, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { todayISO } from '@/lib/format';

// ── Helpers ──────────────────────────────────────────────────
function fmtRp(v: number | string) { return 'Rp\u00a0' + (parseFloat(String(v || 0)) || 0).toLocaleString('id-ID'); }
function payBadge(p: string) {
  const u = (p || 'CASH').toUpperCase();
  const c = u === 'BANK' ? 'bank' : (u.includes('BANK') && u.includes('CASH')) ? 'cashbank' : 'cash';
  return <span className={`badge ${c}`}>{p || 'CASH'}</span>;
}
function hitungLaba(st: string, jb: number, pinja: number, _uj: number, gadaiBaru: number) {
  switch (st) {
    case 'TEBUS': case 'BUYBACK': return jb - pinja;
    case 'PERPANJANG': return jb;
    case 'TAMBAH': return (gadaiBaru - jb) - pinja;
    case 'KURANG': return (jb + gadaiBaru) - pinja;
    default: return jb - pinja;
  }
}

export default function LaporanPage() {
  const outletId = useOutletId();
  const [tgl, setTgl] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);

  const loadLaporan = useCallback(async () => {
    setLoading(true); setData(null);
    try {
      const res = await fetch(`/api/laporan/malam?tgl=${tgl}`, {
        headers: { 'x-outlet-id': String(outletId) },
      });
      const json = await res.json();
      if (json.ok) setData(json);
    } catch { /* silent */ }
    setLoading(false);
  }, [tgl, outletId]);

  // ── Computed ───────────────────────────────────────────────
  const rk = data?.rekap || {};
  const saldo = data?.saldo || {};
  const gadaiList: any[] = data?.gadaiList || [];
  const sjbList: any[] = data?.sjbList || [];
  const tebusList: any[] = data?.tebusList || [];
  const buybackList: any[] = data?.buybackList || [];

  // Merge + normalize
  const allTebus = [
    ...tebusList.map((r: any) => ({ ...r, _isBuyback: false })),
    ...buybackList.map((r: any) => ({
      ...r, nama_nasabah: r.nama, jumlah_gadai: r.harga_jual,
      jumlah_gadai_baru: r.harga_jual_baru, _isBuyback: true,
    })),
  ];
  const tebusOnly = allTebus.filter(r => ['TEBUS', 'TAMBAH', 'KURANG', 'BUYBACK'].includes((r.status || '').toUpperCase()));
  const perpanjangList = allTebus.filter(r => (r.status || '').toUpperCase() === 'PERPANJANG');
  const jualSitaList = allTebus.filter(r => ['JUAL', 'SITA'].includes((r.status || '').toUpperCase()));

  // Laba per kategori
  let labaTebus = 0, labaBB = 0, labaPjg = 0, labaJual = 0, labaSita = 0, labaTK = 0;
  allTebus.forEach(r => {
    const st = (r.status || '').toUpperCase();
    const lb = hitungLaba(st, Number(r.jumlah_bayar || 0), Number(r.jumlah_gadai || 0), Number(r.ujrah_berjalan || 0), Number(r.jumlah_gadai_baru || 0));
    if (st === 'TEBUS') labaTebus += lb;
    else if (st === 'BUYBACK') labaBB += lb;
    else if (st === 'PERPANJANG') labaPjg += lb;
    else if (st === 'JUAL') labaJual += lb;
    else if (st === 'SITA') labaSita += lb;
    else if (st === 'TAMBAH' || st === 'KURANG') labaTK += lb;
  });
  const labaTotal = labaTebus + labaBB + labaPjg + labaJual + labaSita + labaTK;

  const buybackMasuk = buybackList.filter(r => (r.status || '').toUpperCase() === 'BUYBACK').reduce((s: number, r: any) => s + Number(r.jumlah_bayar || 0), 0);
  const buybackCount = buybackList.filter(r => (r.status || '').toUpperCase() === 'BUYBACK').length;
  const jualMasuk = jualSitaList.filter(r => (r.status || '').toUpperCase() === 'JUAL').reduce((s: number, r: any) => s + Number(r.jumlah_bayar || 0), 0);
  const totalMasukAll = (rk.tebusMasuk || 0) + (rk.perpanjangMasuk || 0) + buybackMasuk + jualMasuk;

  // ── Row builder (sesuai GAS buildRow) ──────────────────────
  const td: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid rgba(46,51,73,.4)' };
  const thS: React.CSSProperties = { padding: '7px 10px', textAlign: 'left', fontWeight: 600, color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', borderBottom: '1px solid var(--border)' };
  const thN: React.CSSProperties = { ...thS, textAlign: 'right' };

  function buildRow(r: any, idx: number, showAnom: boolean) {
    const jb = Number(r.jumlah_bayar || 0), pi = Number(r.jumlah_gadai || 0);
    const gb = Number(r.jumlah_gadai_baru || 0), uj = Number(r.ujrah_berjalan || 0);
    const tak = Number(r.taksiran || 0), tot = Number(r.total_tebus_sistem || r.total_sistem || 0);
    const sel = Number(r.selisih || 0), hr = Number(r.hari_aktual || 0);
    const st = (r.status || '').toUpperCase(), nama = r.nama_nasabah || r.nama || '';
    const nf = r.no_faktur || '', pay = r.payment || 'CASH', cat = r.alasan || '';
    const tanpaSrt = r.tanpa_surat ? String(r.tanpa_surat).includes('TANPA_SURAT') : false;
    const idDiskon = r.id_diskon || '';
    const laba = hitungLaba(st, jb, pi, uj, gb);

    // Anomali (sesuai GAS)
    const anomParts: string[] = [];
    if (sel > 1000) anomParts.push(`⚠️ DISKON${idDiskon ? ` [${idDiskon}]` : ''}`);
    if (tanpaSrt) anomParts.push('🔴 TANPA BARCODE');
    const hasAnom = anomParts.length > 0;
    const catatanStr = hasAnom && cat ? anomParts.join(' | ') + ' — ' + cat : hasAnom ? anomParts.join(' | ') : cat || '—';
    const doHL = showAnom && hasAnom;

    let jmlTebus: number;
    if (st === 'TAMBAH') jmlTebus = gb > 0 ? (gb - jb) : jb;
    else if (st === 'KURANG') jmlTebus = gb > 0 ? (jb + gb) : jb;
    else if (st === 'SITA') jmlTebus = tak;
    else jmlTebus = jb;
    const isTK = ['TAMBAH', 'KURANG', 'SITA'].includes(st);

    return (
      <tr key={idx} style={doHL ? { background: 'rgba(245,158,11,.13)', outline: '2px solid rgba(245,158,11,.45)', outlineOffset: -1 } : undefined}>
        <td style={{ ...td, textAlign: 'center', color: 'var(--text3)', fontSize: 10 }}>{idx + 1}</td>
        <td style={{ ...td, fontSize: 10, whiteSpace: 'nowrap', fontWeight: doHL ? 700 : undefined }}>{r.tgl_gadai ? new Date(r.tgl_gadai).toLocaleDateString('id-ID') : '—'}</td>
        <td style={{ ...td, fontSize: 10, whiteSpace: 'nowrap', fontWeight: doHL ? 700 : undefined }}>{r.tgl ? new Date(r.tgl).toLocaleDateString('id-ID') : '—'}</td>
        <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 10, fontWeight: doHL ? 700 : undefined }}>{nf}</td>
        <td style={{ ...td, textAlign: 'right', fontSize: 10 }}>{hr > 0 ? hr + ' hr' : '—'}</td>
        <td style={{ ...td, fontWeight: doHL ? 700 : undefined }}>
          {nama}
          {r._isBuyback && <span className="badge" style={{ background: 'var(--warn)', color: '#fff', fontSize: 9, padding: '1px 4px', marginLeft: 4 }}>SJB</span>}
          {showAnom && st && !['TEBUS', 'PERPANJANG'].includes(st) && <span className="badge" style={{ fontSize: 9, padding: '1px 4px', marginLeft: 4 }}>{st}</span>}
        </td>
        <td style={{ ...td, fontSize: 10 }}>{r.kategori || ''}</td>
        <td style={{ ...td, textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)' }}>{fmtRp(tak)}</td>
        <td style={{ ...td, textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)' }}>{fmtRp(pi)}</td>
        <td style={{ ...td, textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)', color: 'var(--text3)' }}>{fmtRp(tot)}</td>
        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: 'var(--green)' }}>{fmtRp(jb)}</td>
        <td style={{ ...td, textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)', color: isTK ? 'var(--accent)' : 'var(--green)', fontWeight: 600 }}>{fmtRp(jmlTebus)}</td>
        <td style={{ ...td, whiteSpace: 'nowrap' }}>{payBadge(pay)}</td>
        <td style={{ ...td, fontSize: 10, color: doHL ? 'var(--warn)' : 'var(--text3)', fontWeight: doHL ? 700 : undefined }}>{catatanStr}</td>
        <td style={{ ...td, textAlign: 'right', fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, color: laba > 0 ? 'var(--green)' : laba < 0 ? 'var(--red)' : 'var(--text3)' }}>{fmtRp(laba)}</td>
      </tr>
    );
  }

  const TH14 = (
    <tr><th style={{ ...thS, width: 28 }}>No</th><th style={thS}>Tgl Gadai</th><th style={thS}>Tgl Tebus</th>
    <th style={thS}>No Faktur</th><th style={thN}>Lama</th><th style={thS}>Nama</th><th style={thS}>Kategori</th>
    <th style={thN}>Taksiran</th><th style={thN}>Pinjaman</th><th style={thN}>Total Sistem</th>
    <th style={thN}>Jml Bayar</th><th style={thN}>Jml Tebus</th><th style={thS}>Bayar</th>
    <th style={thS}>Catatan / Anomali</th><th style={thN}>Selisih (Laba)</th></tr>
  );

  const SumCard = ({ label, amount, color, sub }: { label: string; amount: string; color: string; sub?: string }) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color }}>{amount}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const Sec = ({ title, total, children }: { title: string; total?: string; children: React.ReactNode }) => (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 16, overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
        <span>{title}</span>{total && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{total}</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  );

  return (
    <AppShell title="Laporan Malam" subtitle="Rekap harian transaksi">
      <div style={{ display: 'flex', gap: 20, height: '100%', overflow: 'hidden' }}>
        {/* LEFT */}
        <div style={{ width: 240, minWidth: 240, overflowY: 'auto', padding: '20px 0 20px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 10 }}>📋 Laporan Harian</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Tanggal</div>
              <input type="date" value={tgl} onChange={e => setTgl(e.target.value)} style={{ fontSize: 12, padding: '7px 10px', width: '100%' }} />
            </div>
            <button className="btn btn-primary btn-full btn-sm" onClick={loadLaporan}>📊 Tampilkan</button>
          </div>
          {data && (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 10 }}>Ringkasan</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {([['Gadai Keluar', fmtRp(rk.gadaiKeluar), 'var(--red)'], ['Akad SJB', fmtRp(rk.sjbKeluar), 'var(--warn)'],
                  ['Tebus Masuk', fmtRp(rk.tebusMasuk), 'var(--green)'], ['Buyback', fmtRp(buybackMasuk), '#06b6d4'],
                  ['Perpanjang', fmtRp(rk.perpanjangMasuk), 'var(--green)'], ['Jual Barang', fmtRp(jualMasuk), 'var(--gold)'],
                ] as [string, string, string][]).map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: 'var(--text3)' }}>{l}</span><span style={{ fontFamily: 'var(--mono)', color: c }}>{v}</span>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '3px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)', fontWeight: 700 }}>📥 Total Masuk</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{fmtRp(totalMasukAll)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)', fontWeight: 700 }}>💰 Total Laba</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 900, fontSize: 12, color: labaTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtRp(labaTotal)}</span>
                </div>
                <div style={{ borderTop: '1px solid var(--border)', margin: '3px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>Saldo Cash</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--green)' }}>{fmtRp(saldo.cash)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                  <span style={{ color: 'var(--text3)' }}>Saldo Bank</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 700, color: 'var(--accent)' }}>{fmtRp(saldo.bank)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 20px 0' }}>
          {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>⏳ Memuat laporan...</div>}
          {!loading && !data && <div style={{ textAlign: 'center', padding: 60, color: 'var(--text3)' }}>Pilih tanggal dan klik "Tampilkan"</div>}
          {data && (<>
            {/* REKAP */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 10 }}>📊 Rekap Pengeluaran & Penerimaan</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="💸 Gadai Keluar" amount={fmtRp(rk.gadaiKeluar)} color="var(--red)" sub={`${gadaiList.length} transaksi`} />
                <SumCard label="🔄 Akad SJB" amount={fmtRp(rk.sjbKeluar)} color="var(--warn)" sub={`${sjbList.length} akad`} />
                <SumCard label="📤 Total Keluar" amount={fmtRp(rk.totalKeluar)} color="var(--red)" sub="Gadai + SJB" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="✅ Tebus Masuk" amount={fmtRp(rk.tebusMasuk)} color="var(--green)" sub={`${tebusOnly.filter(r => r.status === 'TEBUS').length} transaksi`} />
                <SumCard label="🔁 Buyback" amount={fmtRp(buybackMasuk)} color="#06b6d4" sub={`${buybackCount} SJB`} />
                <SumCard label="🔄 Perpanjang" amount={fmtRp(rk.perpanjangMasuk)} color="var(--accent)" sub={`${perpanjangList.length} transaksi`} />
              </div>
              <div style={{ background: 'rgba(16,185,129,.07)', border: '1px solid rgba(16,185,129,.2)', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' }}>📥 Total Masuk</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 900, color: 'var(--green)' }}>{fmtRp(totalMasukAll)}</div>
              </div>
            </div>

            {/* LABA */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--green)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .8, color: 'var(--text3)', marginBottom: 10 }}>💹 Rekap Laba</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="Laba Tebus" amount={fmtRp(labaTebus)} color="var(--green)" />
                <SumCard label="Laba Buyback" amount={fmtRp(labaBB)} color="#06b6d4" />
                <SumCard label="Laba Perpanjang" amount={fmtRp(labaPjg)} color="var(--accent)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="Laba Jual" amount={fmtRp(labaJual)} color="var(--gold)" />
                <SumCard label="Laba Sita" amount={fmtRp(labaSita)} color="var(--text2)" />
                <SumCard label="Laba Tambah/Kurang" amount={fmtRp(labaTK)} color="var(--warn)" />
              </div>
              <div style={{ background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)', borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700 }}>💰 TOTAL LABA HARI INI</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 900, color: labaTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtRp(labaTotal)}</div>
              </div>
            </div>

            {/* RINGKASAN AKHIR */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 14 }}>
              {[['📤 Total Keluar', fmtRp(rk.totalKeluar), 'var(--red)', 'rgba(239,68,68,'], ['📥 Total Masuk', fmtRp(totalMasukAll), 'var(--green)', 'rgba(16,185,129,'], ['💰 Total Laba', fmtRp(labaTotal), labaTotal >= 0 ? 'var(--green)' : 'var(--red)', 'rgba(16,185,129,']].map(([lbl, val, clr, bg], i) => (
                <div key={i} style={{ background: `${bg}.1)`, border: `2px solid ${bg}.4)`, borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 6 }}>{lbl}</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 900, color: clr as string }}>{val}</div>
                </div>
              ))}
            </div>

            {/* SALDO */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
              <SumCard label="💰 Saldo Kas" amount={fmtRp(saldo.total)} color="var(--gold)" sub={`Cash ${fmtRp(saldo.cash)} | Bank ${fmtRp(saldo.bank)}`} />
              <SumCard label="📊 Net Hari Ini" amount={fmtRp(totalMasukAll - rk.totalKeluar)} color={(totalMasukAll - rk.totalKeluar) >= 0 ? 'var(--green)' : 'var(--red)'} sub="(Masuk - Keluar)" />
            </div>

            {/* GADAI BARU */}
            <Sec title="💰 Gadai Baru" total={`Total: ${fmtRp(rk.gadaiKeluar + rk.sjbKeluar)}`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead><tr><th style={{ ...thS, width: 28 }}>No</th><th style={thS}>No Faktur</th><th style={thS}>Kategori</th><th style={thS}>Barang</th><th style={thN}>Taksiran</th><th style={thN}>Total Gadai</th><th style={thS}>Ket</th><th style={thS}>Bayar</th></tr></thead>
                <tbody>
                  {gadaiList.length === 0 && sjbList.length === 0
                    ? <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>Tidak ada transaksi</td></tr>
                    : [...gadaiList.map((r: any) => ({ ...r, _isSJB: false })), ...sjbList.map((r: any) => ({ ...r, _isSJB: true }))].map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(46,51,73,.4)' }}>
                        <td style={{ ...td, textAlign: 'center', color: 'var(--text3)', fontSize: 10 }}>{i + 1}</td>
                        <td style={{ ...td, fontFamily: 'var(--mono)', fontSize: 10 }}>{r.no_faktur} {r._isSJB && <span className="badge" style={{ background: 'var(--warn)', color: '#fff', fontSize: 9, padding: '1px 4px' }}>SJB</span>}</td>
                        <td style={td}><span className="badge aktif">{r.kategori}</span></td>
                        <td style={{ ...td, fontSize: 11 }}>{r.barang}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmtRp(r.taksiran || r.harga_jual)}</td>
                        <td style={{ ...td, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)', fontWeight: 600 }}>{fmtRp(r.jumlah_gadai || r.harga_jual)}</td>
                        <td style={{ ...td, fontSize: 9 }}>{r._isSJB ? 'SJB' : 'GADAI'}</td>
                        <td style={td}>{payBadge(r.payment)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Sec>

            {/* TEBUS / TAMBAH / KURANG (showAnom=true) */}
            <Sec title="🔓 Tebus / Tambah / Kurang" total={`${tebusOnly.length} transaksi`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}><thead>{TH14}</thead>
                <tbody>{tebusOnly.length === 0 ? <tr><td colSpan={15} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>—</td></tr> : tebusOnly.map((r, i) => buildRow(r, i, true))}</tbody>
              </table>
            </Sec>

            {/* PERPANJANG */}
            <Sec title="🔄 Perpanjang" total={`${perpanjangList.length} transaksi`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}><thead>{TH14}</thead>
                <tbody>{perpanjangList.length === 0 ? <tr><td colSpan={15} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>—</td></tr> : perpanjangList.map((r, i) => buildRow(r, i, false))}</tbody>
              </table>
            </Sec>

            {/* JUAL / SITA */}
            <Sec title="🏷️ Jual / Sita" total={`${jualSitaList.length} transaksi`}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}><thead>{TH14}</thead>
                <tbody>{jualSitaList.length === 0 ? <tr><td colSpan={15} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)' }}>—</td></tr> : jualSitaList.map((r, i) => buildRow(r, i, false))}</tbody>
              </table>
            </Sec>
          </>)}
        </div>
      </div>
    </AppShell>
  );
}
