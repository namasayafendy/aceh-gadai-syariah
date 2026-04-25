'use client';

// ============================================================
// ACEH GADAI SYARIAH - Dashboard
// File: app/page.tsx
// Halaman utama: ringkasan saldo kas + rekap + tabel transaksi hari ini
// Mirrors GAS: _renderDashboard() di index.html
// ============================================================

import { useEffect, useState, useCallback } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, todayISO, formatDate } from '@/lib/format';

// ── Laba calculation — matches GAS _dbHitungLaba ─────────────
function hitungLaba(st: string, jb: number, pi: number, gb: number): number {
  switch (st) {
    case 'TEBUS':
    case 'BUYBACK':    return jb - pi;
    case 'PERPANJANG': return jb;
    case 'TAMBAH':     return (gb - jb) - pi;
    case 'KURANG':     return (jb + gb) - pi;
    case 'JUAL':       return jb - pi;  // = jumlah bayar - pinjaman akad
    case 'SITA':       return jb - pi;  // = nilai sita - pinjaman akad
    default:           return jb - pi;
  }
}

// ── Payment badge ────────────────────────────────────────────
function PayBadge({ pay }: { pay: string }) {
  const p = (pay || 'CASH').toUpperCase();
  const color = p === 'BANK' ? 'var(--accent)' : p === 'CASH&BANK' ? 'var(--warn)' : 'var(--green)';
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${color}22`, color }}>{p}</span>;
}

// ── Status badge ─────────────────────────────────────────────
function StatusBadge({ st }: { st: string }) {
  const colorMap: Record<string, string> = {
    TEBUS: '#10b981', PERPANJANG: 'var(--accent)', TAMBAH: 'var(--green)',
    KURANG: 'var(--warn)', SITA: '#ef4444', JUAL: '#f59e0b', BUYBACK: '#06b6d4',
    GADAI: 'var(--text3)', SJB: 'var(--warn)', AKTIF: 'var(--green)',
  };
  const c = colorMap[st] || 'var(--text3)';
  return <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${c}22`, color: c, textTransform: 'uppercase' as const }}>{st}</span>;
}

export default function DashboardPage() {
  const outletId = useOutletId();
  const [loading, setLoading] = useState(true);
  const [raw, setRaw] = useState<any>(null);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const tgl = todayISO();
      // Parallel fetch: kas saldo + laporan harian
      const [kasRes, lapRes] = await Promise.all([
        fetch(`/api/kas?outletId=${outletId}`),
        fetch(`/api/laporan/harian?tgl=${tgl}&outletId=${outletId}`),
      ]);
      const kasJson = await kasRes.json();
      const lapJson = await lapRes.json();
      setRaw({
        saldo: kasJson.ok ? kasJson.saldo : { cash: 0, bank: 0 },
        gadai: lapJson.ok ? (lapJson.gadai ?? []) : [],
        tebus: lapJson.ok ? (lapJson.tebus ?? []) : [],
        sjb:   lapJson.ok ? (lapJson.sjb ?? []) : [],
        buyback: lapJson.ok ? (lapJson.buyback ?? []) : [],
      });
    } catch { /* silent */ }
    setLoading(false);
  }, [outletId]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // ── Derived data ─────────────────────────────────────────
  const saldo = raw?.saldo ?? { cash: 0, bank: 0 };
  const gadaiRaw: any[] = raw?.gadai ?? [];
  const tebusRaw: any[] = raw?.tebus ?? [];
  const sjbRaw: any[] = raw?.sjb ?? [];
  const buybackRaw: any[] = raw?.buyback ?? [];

  // Merge gadai + sjb for the "Gadai Baru" table (SJB items get isSJB badge)
  // Inject TAMBAH/KURANG dari tebus (gadai regular) ke gadai table.
  // Catatan: SJB tidak punya TAMBAH/KURANG (cuma BUYBACK/PERPANJANG/SITA) — jadi
  //          tb_buyback tidak perlu dicek utk tambah/kurang.
  const tambahKurangRows = tebusRaw.filter(r => {
    const st = String(r.status ?? '').toUpperCase();
    return st === 'TAMBAH' || st === 'KURANG';
  });

  // Build the jumlahLamaMap for correcting gadai display amounts (safety)
  const jumlahLamaMap: Record<string, number> = {};
  tambahKurangRows.forEach(r => {
    const nf = String(r.no_faktur ?? '').trim().toUpperCase();
    jumlahLamaMap[nf] = Number(r.jumlah_gadai ?? 0);
  });

  // Tampilkan SEMUA akad asli hari ini di tabel "Gadai Baru" — tidak di-exclude meski
  // ada PERPANJANG/TAMBAH/KURANG hari yg sama. Akad asli tetap perlu muncul sebagai
  // histori. PERPANJANG/TAMBAH/KURANG tampil di section terpisah (Tebus / Perpanjang).
  const gadaiFiltered = gadaiRaw;
  const sjbFiltered   = sjbRaw;

  // Sort: by no_faktur ASC. Karena 'SBR-' < 'SJB-' alfabetis, SBR group
  // otomatis di atas SJB group. Akad asli (_ket='') sebelum injection
  // TAMBAH/KURANG kalau no_faktur sama.
  const sortByNoFaktur = (a: any, b: any) => {
    const na = String(a.no_faktur ?? '').toUpperCase();
    const nb = String(b.no_faktur ?? '').toUpperCase();
    if (na !== nb) return na < nb ? -1 : 1;
    const ka = a._ket || '';
    const kb = b._ket || '';
    if (ka === '' && kb !== '') return -1;
    if (kb === '' && ka !== '') return 1;
    return 0;
  };

  // Build gadai table list — akad asli + injection TAMBAH/KURANG row terpisah.
  // - Akad asli: pakai jumlahLamaMap override (tb_gadai.jumlah_gadai sudah
  //   di-update ke nilai baru saat TAMBAH/KURANG, jadi tampil nominal akad awal).
  // - Injection TAMBAH/KURANG: tampil row tersendiri dgn jumlah_gadai_baru
  //   (= sisa pinjaman setelah perubahan), label _ket = TAMBAH / KURANG.
  const gadaiTableList = [
    ...gadaiFiltered.map(r => {
      const nf = String(r.no_faktur ?? '').trim().toUpperCase();
      const correctedJumlah = jumlahLamaMap[nf] !== undefined
        ? jumlahLamaMap[nf]
        : Number(r.jumlah_gadai ?? 0);
      return { ...r, jumlah_gadai: correctedJumlah, _isSJB: false, _ket: '' };
    }),
    ...sjbFiltered.map(r => ({
      ...r,
      jumlah_gadai: Number(r.harga_jual ?? 0),
      _isSJB: true,
      _ket: '',
    })),
    ...tambahKurangRows.map(r => ({
      no_faktur: r.no_faktur,
      kategori:  r.kategori,
      barang:    r.barang,
      taksiran:  Number(r.taksiran ?? 0),
      jumlah_gadai: Number(r.jumlah_gadai_baru ?? 0),
      payment:   r.payment ?? 'CASH',
      kasir:     r.kasir ?? '',
      _isSJB:    false,
      _ket:      String(r.status ?? '').toUpperCase(),
    })),
  ].sort(sortByNoFaktur);

  // Helper: normalisasi row tb_buyback supaya kompatibel dengan TebusTable
  // tb_buyback kolom beda: harga_jual/harga_jual_baru (bukan jumlah_gadai),
  //                        total_sistem (bukan total_tebus_sistem),
  //                        tidak ada tgl_gadai → derive dari tgl - hari_aktual (sesuai GAS fallback)
  const mapBuybackRow = (r: any) => {
    let derivedTglGadai: string | null = null;
    try {
      const tglBB = r.tgl ? new Date(r.tgl) : null;
      const ha = Number(r.hari_aktual ?? 0);
      if (tglBB && !isNaN(tglBB.getTime()) && ha > 0) {
        const tgd = new Date(tglBB);
        tgd.setDate(tgd.getDate() - ha);
        derivedTglGadai = tgd.toISOString();
      }
    } catch { /* ignore */ }
    return {
      ...r,
      jumlah_gadai:        Number(r.harga_jual ?? 0),
      jumlah_gadai_baru:   Number(r.harga_jual_baru ?? 0),
      total_tebus_sistem:  Number(r.total_sistem ?? 0),
      tgl_gadai:           derivedTglGadai,
    };
  };

  // Split tebus by status — TEBUS/TAMBAH/KURANG dari tb_tebus (gadai regular)
  // + BUYBACK dari tb_buyback (SJB yg ditebus, secara logika sama dgn tebus biasa)
  // SJB tidak punya TAMBAH/KURANG — hanya BUYBACK/PERPANJANG/SITA
  const tebusOnly = [
    ...tebusRaw.filter(r => {
      const st = String(r.status ?? '').toUpperCase();
      return ['TEBUS', 'TAMBAH', 'KURANG'].includes(st);
    }),
    ...buybackRaw
      .filter(r => String(r.status ?? '').toUpperCase() === 'BUYBACK')
      .map(mapBuybackRow),
  ].sort(sortByNoFaktur);

  // Perpanjang: gabung dari tb_tebus (gadai regular) + tb_buyback (SJB) — sesuai GAS allTebusLike
  const perpanjangList = [
    ...tebusRaw.filter(r => String(r.status ?? '').toUpperCase() === 'PERPANJANG'),
    ...buybackRaw
      .filter(r => String(r.status ?? '').toUpperCase() === 'PERPANJANG')
      .map(mapBuybackRow),
  ].sort(sortByNoFaktur);
  // Jual / Sita: dari tb_tebus (gadai) + tb_buyback (SJB sita)
  const jualSitaList = [
    ...tebusRaw.filter(r => {
      const st = String(r.status ?? '').toUpperCase();
      return st === 'JUAL' || st === 'SITA';
    }),
    ...buybackRaw
      .filter(r => {
        const st = String(r.status ?? '').toUpperCase();
        return st === 'JUAL' || st === 'SITA';
      })
      .map(mapBuybackRow),
  ].sort(sortByNoFaktur);

  // ── Rekap Keluar ─────────────────────────────────────────
  // Total Keluar = sum jumlah_gadai akad asli hari ini (gadai + sjb).
  // Pakai jumlahLamaMap utk override row gadai yg sudah di-update TAMBAH/KURANG
  // -> tetap pakai nominal akad awal.
  // Total Keluar = sum semua row di tabel "Gadai Baru" (akad asli + injection
  // TAMBAH/KURANG). Konsisten antara display tabel & angka total.
  const gadaiNominal = gadaiTableList
    .filter(r => !r._isSJB)
    .reduce((s, r) => s + Number(r.jumlah_gadai ?? 0), 0);
  const sjbNominal = sjbFiltered.reduce((s, r) => s + Number(r.harga_jual ?? 0), 0);
  const gadaiCount = gadaiFiltered.length + tambahKurangRows.length;
  const sjbCount   = sjbFiltered.length;

  // ── Rekap Masuk ──────────────────────────────────────────
  // Sesuai GAS: tb_buyback bisa berisi BUYBACK / PERPANJANG / SITA
  // → harus dipisah berdasarkan status, bukan dijumlah semua ke "Buyback"
  let tebusNom = 0, perpanjangNom = 0, buybackNom = 0;
  tebusRaw.forEach(r => {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    if (st === 'TEBUS') tebusNom += jb;
    else if (st === 'PERPANJANG') perpanjangNom += jb;
    else if (st === 'TAMBAH') tebusNom += Math.max(0, Number(r.jumlah_gadai_baru ?? 0) - jb);
    else if (st === 'KURANG') tebusNom += jb + Number(r.jumlah_gadai_baru ?? 0);
  });
  // tb_buyback hanya berisi BUYBACK / PERPANJANG / SITA — tidak ada TAMBAH/KURANG
  buybackRaw.forEach(r => {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    if (st === 'BUYBACK') buybackNom += jb;
    else if (st === 'PERPANJANG') perpanjangNom += jb;
    // SITA → no cash (0); JUAL (kalau ada) → jualMasuk via jualSitaList di bawah
  });
  const tebusCount = tebusRaw.filter(r => {
    const st = String(r.status ?? '').toUpperCase();
    return ['TEBUS', 'TAMBAH', 'KURANG'].includes(st);
  }).length;
  const buybackCount = buybackRaw.filter(r =>
    String(r.status ?? '').toUpperCase() === 'BUYBACK'
  ).length;

  // Jual & Sita masuk dari jualSitaList. SITA secara kas = 0 (transfer ke aset gudang),
  // tapi utk display "Total Masuk" di laporan harian, nilai sita dihitung sbg realized
  // value masuk inventory (bukan kas).
  let jualMasuk = 0, sitaMasuk = 0, jualCount = 0, sitaCount = 0;
  jualSitaList.forEach(r => {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    if (st === 'JUAL') { jualMasuk += jb; jualCount++; }
    if (st === 'SITA') { sitaMasuk += jb; sitaCount++; }
  });

  const totalMasuk = tebusNom + buybackNom + perpanjangNom + jualMasuk + sitaMasuk;

  // ── Rekap Laba ───────────────────────────────────────────
  // Sesuai GAS: allTebusLike = tebusList + buybackList — status asli dipertahankan
  // (tb_buyback bisa berisi BUYBACK / PERPANJANG / SITA / TAMBAH / KURANG)
  let labaTebus = 0, labaBB = 0, labaPjg = 0, labaJual = 0, labaSita = 0, labaTK = 0;
  const allTebusForLaba = [
    ...tebusRaw.map(r => ({ ...r })),
    ...buybackRaw.map(r => ({
      ...r,
      // Preserve r.status — JANGAN force-cast ke BUYBACK
      jumlah_gadai: r.harga_jual ?? 0,
      jumlah_gadai_baru: r.harga_jual_baru ?? 0,
    })),
  ];
  allTebusForLaba.forEach(r => {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    const pi = Number(r.jumlah_gadai ?? 0);
    const gb = Number(r.jumlah_gadai_baru ?? 0);
    const lb = hitungLaba(st, jb, pi, gb);
    if (st === 'TEBUS') labaTebus += lb;
    else if (st === 'BUYBACK') labaBB += lb;
    else if (st === 'PERPANJANG') labaPjg += lb;
    else if (st === 'JUAL') labaJual += lb;
    else if (st === 'SITA') labaSita += lb;
    else if (st === 'TAMBAH' || st === 'KURANG') labaTK += lb;
  });
  const labaTotal = labaTebus + labaBB + labaPjg + labaJual + labaSita + labaTK;

  // ── Tebus "Jml Tebus" column calc (matches GAS) ─────────
  function calcJmlTebus(r: any): number {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    const gb = Number(r.jumlah_gadai_baru ?? 0);
    const tak = Number(r.taksiran ?? 0);
    if (st === 'TAMBAH') return gb > 0 ? gb - jb : jb;
    if (st === 'KURANG') return gb > 0 ? jb + gb : jb;
    if (st === 'SITA') return tak;
    return jb;
  }

  // ── Sum card helper ────────────────────────────────────────
  const SumCard = ({ label, amount, sub, color, borderColor }: {
    label: string; amount: string; sub?: string; color?: string; borderColor?: string;
  }) => (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderLeft: `3px solid ${borderColor || 'var(--border)'}`,
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 14, fontWeight: 700, color: color || 'var(--text)' }}>
        {amount}
      </div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const subtitle = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <AppShell title="Dashboard" subtitle={`Ringkasan hari ini — ${subtitle}`}>
      <div className="content-area" style={{ padding: '16px 20px', overflowY: 'auto' }}>

        {/* ── Stat Cards ───────────────────────────────────── */}
        <div className="stats-grid" style={{ marginBottom: 16 }}>
          <div className="stat-card gold">
            <div className="s-lbl">Saldo Cash</div>
            <div className="s-val">{loading ? '...' : formatRp(saldo.cash)}</div>
            <div className="s-sub">Laci / Tunai</div>
          </div>
          <div className="stat-card">
            <div className="s-lbl">Saldo Bank</div>
            <div className="s-val">{loading ? '...' : formatRp(saldo.bank)}</div>
            <div className="s-sub">Transfer</div>
          </div>
          <div className="stat-card blue">
            <div className="s-lbl">Gadai Hari Ini</div>
            <div className="s-val">{loading ? '...' : gadaiCount}</div>
            <div className="s-sub">{formatRp(gadaiNominal)}</div>
          </div>
          <div className="stat-card green">
            <div className="s-lbl">Tebus Hari Ini</div>
            <div className="s-val">{loading ? '...' : tebusCount}</div>
            <div className="s-sub">{formatRp(tebusNom)}</div>
          </div>
        </div>

        {/* Refresh */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{subtitle}</div>
          <button className="btn btn-outline btn-sm" onClick={fetchDashboard} disabled={loading}>
            ↻ Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>⏳ Memuat data hari ini...</div>
        ) : (
          <>
            {/* ── Rekap Pengeluaran & Penerimaan ──────────── */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, padding: 14, marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.8px', color: 'var(--text3)', marginBottom: 10 }}>
                📊 Rekap Pengeluaran & Penerimaan
              </div>
              {/* Keluar */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="💸 Gadai Keluar" amount={formatRp(gadaiNominal)} sub={`${gadaiCount} transaksi gadai`} color="var(--red)" borderColor="var(--red)" />
                <SumCard label="🔄 Akad SJB Keluar" amount={formatRp(sjbNominal)} sub={`${sjbCount} akad SJB`} color="var(--warn)" borderColor="var(--warn)" />
                <SumCard label="📤 Total Keluar" amount={formatRp(gadaiNominal + sjbNominal)} sub="Gadai + SJB" color="var(--red)" borderColor="var(--red)" />
              </div>
              {/* Masuk */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="✅ Tebus Masuk" amount={formatRp(tebusNom)} sub={`${tebusCount} transaksi tebus`} color="var(--green)" borderColor="var(--green)" />
                <SumCard label="🔁 Buyback Masuk" amount={formatRp(buybackNom)} sub={`${buybackCount} buyback SJB`} color="#06b6d4" borderColor="#06b6d4" />
                <SumCard label="🔄 Perpanjang" amount={formatRp(perpanjangNom)} sub={`${perpanjangList.length} transaksi`} color="var(--accent)" borderColor="var(--accent)" />
              </div>
              {/* Jual & Sita */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <SumCard label="🏷️ Jual Barang" amount={formatRp(jualMasuk)} sub={`${jualCount} transaksi jual`} color="#dc2626" borderColor="#dc2626" />
                <SumCard label="🔒 Sita Barang" amount={`${sitaCount} transaksi sita`} color="#6b7280" borderColor="#6b7280" />
              </div>
              {/* Total Masuk */}
              <div style={{
                background: 'rgba(16,185,129,.07)', border: '1px solid rgba(16,185,129,.2)',
                borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: '.5px' }}>📥 Total Masuk</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    Tebus: {formatRp(tebusNom)}
                    {buybackNom > 0 && ` + Buyback: ${formatRp(buybackNom)}`}
                    {perpanjangNom > 0 && ` + Perpanjang: ${formatRp(perpanjangNom)}`}
                    {jualMasuk > 0 && ` + Jual: ${formatRp(jualMasuk)}`}
                  </div>
                </div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 16, fontWeight: 900, color: 'var(--green)' }}>
                  {formatRp(totalMasuk)}
                </div>
              </div>
            </div>

            {/* ── Rekap Laba ──────────────────────────────────── */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderLeft: '3px solid var(--green)', borderRadius: 10, padding: 14, marginBottom: 12,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.8px', color: 'var(--text3)', marginBottom: 10 }}>
                💹 Rekap Laba
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="Laba Tebus" amount={formatRp(labaTebus)} borderColor="var(--green)" />
                <SumCard label="Laba Buyback" amount={formatRp(labaBB)} borderColor="#06b6d4" />
                <SumCard label="Laba Perpanjang" amount={formatRp(labaPjg)} borderColor="var(--accent)" />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 8 }}>
                <SumCard label="Laba Jual" amount={formatRp(labaJual)} borderColor="#f59e0b" />
                <SumCard label="Laba Sita" amount={formatRp(labaSita)} borderColor="#6b7280" />
                <SumCard label="Laba Tambah/Kurang" amount={formatRp(labaTK)} borderColor="var(--warn)" />
              </div>
              <div style={{
                background: 'rgba(16,185,129,.1)', border: '1px solid rgba(16,185,129,.3)',
                borderRadius: 8, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)' }}>💰 TOTAL LABA HARI INI</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 900, color: labaTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {formatRp(labaTotal)}
                </div>
              </div>
            </div>

            {/* ── Tabel Gadai Baru ────────────────────────────── */}
            <TableSection
              title="💰 Gadai Baru"
              totalLabel={gadaiTableList.length > 0 ? `Total Gadai: ${formatRp(gadaiTableList.reduce((s, r) => s + Number(r.jumlah_gadai ?? 0), 0))}` : ''}
            >
              <table className="l-mini-tbl">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>No</th>
                    <th>No Faktur</th>
                    <th>Kategori</th>
                    <th>Nama Barang</th>
                    <th className="num">Taksiran</th>
                    <th className="num">Total Gadai</th>
                    <th>Ket</th>
                    <th>Pembayaran</th>
                  </tr>
                </thead>
                <tbody>
                  {gadaiTableList.length === 0 ? (
                    <tr><td colSpan={8} className="empty-state">Tidak ada transaksi gadai</td></tr>
                  ) : gadaiTableList.map((r, i) => {
                    const ket = r._ket;
                    const rowBg = ket === 'TAMBAH' ? 'rgba(16,185,129,.06)'
                      : ket === 'KURANG' ? 'rgba(239,68,68,.06)' : undefined;
                    return (
                      <tr key={i} style={rowBg ? { background: rowBg } : undefined}>
                        <td style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 10 }}>{i + 1}</td>
                        <td>
                          <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{r.no_faktur || '—'}</span>
                          {r._isSJB && <> <StatusBadge st="SJB" /></>}
                        </td>
                        <td><StatusBadge st={r.kategori || '—'} /></td>
                        <td style={{ fontSize: 11 }}>{r.barang || '—'}</td>
                        <td className="num">{formatRp(r.taksiran)}</td>
                        <td className="num" style={{ color: 'var(--red)', fontWeight: 600 }}>{formatRp(r.jumlah_gadai)}</td>
                        <td>{ket ? <StatusBadge st={ket} /> : <span style={{ fontSize: 9, color: 'var(--text3)' }}>GADAI</span>}</td>
                        <td><PayBadge pay={r.payment || 'CASH'} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </TableSection>

            {/* ── Tabel Tebus / Tambah / Kurang ───────────────── */}
            <TableSection
              title="🔓 Tebus / Tambah / Kurang"
              totalLabel={tebusOnly.length > 0 ? `Total Jml Tebus: ${formatRp(tebusOnly.reduce((s, r) => s + calcJmlTebus(r), 0))}` : ''}
            >
              <TebusTable rows={tebusOnly} isTebus />
            </TableSection>

            {/* ── Tabel Perpanjang ────────────────────────────── */}
            <TableSection
              title="🔄 Perpanjang"
              totalLabel={perpanjangList.length > 0 ? `Total Bayar: ${formatRp(perpanjangList.reduce((s, r) => s + Number(r.jumlah_bayar ?? 0), 0))}` : ''}
            >
              <TebusTable rows={perpanjangList} />
            </TableSection>

            {/* ── Tabel Jual / Sita ──────────────────────────── */}
            <TableSection
              title="🏷️ Jual / Sita"
              totalLabel={jualSitaList.length > 0 ? `Total: ${formatRp(jualSitaList.reduce((s, r) => s + Number(r.jumlah_bayar ?? 0), 0))}` : ''}
            >
              <TebusTable rows={jualSitaList} />
            </TableSection>
          </>
        )}
      </div>
    </AppShell>
  );
}

// ── Table Section wrapper ────────────────────────────────────
function TableSection({ title, totalLabel, children }: { title: string; totalLabel?: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 8, marginBottom: 12, overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)',
        fontSize: 12, fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span>{title}</span>
        {totalLabel && <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{totalLabel}</span>}
      </div>
      <div style={{ overflowX: 'auto' }}>{children}</div>
    </div>
  );
}

// ── Tebus/Perpanjang/JualSita table (15 columns, matches GAS) ─
function TebusTable({ rows, isTebus }: { rows: any[]; isTebus?: boolean }) {
  if (rows.length === 0) {
    return (
      <table className="l-mini-tbl">
        <thead>
          <tr>
            <th style={{ width: 28 }}>No</th><th>Tgl Gadai</th><th>Tgl Tebus</th><th>No Faktur</th>
            <th className="num">Lama</th><th>Nama</th><th>Kategori</th><th className="num">Taksiran</th>
            <th className="num">Pinjaman Awal</th><th className="num">Total Sistem</th>
            <th className="num">Jml Bayar</th><th className="num">Jml Tebus</th>
            <th>Pembayaran</th><th>Catatan</th><th className="num">Selisih (Laba)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td colSpan={15} className="empty-state">Tidak ada transaksi</td></tr>
        </tbody>
      </table>
    );
  }

  return (
    <table className="l-mini-tbl">
      <thead>
        <tr>
          <th style={{ width: 28 }}>No</th><th>Tgl Gadai</th><th>Tgl Tebus</th><th>No Faktur</th>
          <th className="num">Lama</th><th>Nama</th><th>Kategori</th><th className="num">Taksiran</th>
          <th className="num">Pinjaman Awal</th><th className="num">Total Sistem</th>
          <th className="num">Jml Bayar</th><th className="num">Jml Tebus</th>
          <th>Pembayaran</th><th>Catatan</th><th className="num">Selisih (Laba)</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const st = String(r.status ?? '').toUpperCase();
          const jb = Number(r.jumlah_bayar ?? 0);
          const pi = Number(r.jumlah_gadai ?? 0);
          const gb = Number(r.jumlah_gadai_baru ?? 0);
          const tak = Number(r.taksiran ?? 0);
          const laba = hitungLaba(st, jb, pi, gb);

          // Jml Tebus calc
          let jmlTebus = jb;
          if (st === 'TAMBAH') jmlTebus = gb > 0 ? gb - jb : jb;
          else if (st === 'KURANG') jmlTebus = gb > 0 ? jb + gb : jb;
          else if (st === 'SITA') jmlTebus = tak;

          // Catatan/Anomali
          const selisih = Number(r.selisih ?? 0);
          let catatan = '';
          if (selisih > 0) catatan = `Diskon ${formatRp(selisih)}`;
          else if (selisih < 0) catatan = `Lebih ${formatRp(Math.abs(selisih))}`;
          if (st === 'TAMBAH') catatan = `TAMBAH → ${formatRp(gb)}`;
          else if (st === 'KURANG') catatan = `KURANG → ${formatRp(gb)}`;

          const rowBg = st === 'TAMBAH' ? 'rgba(16,185,129,.06)'
            : st === 'KURANG' ? 'rgba(239,68,68,.06)'
            : st === 'SITA' ? 'rgba(239,68,68,.04)'
            : st === 'JUAL' ? 'rgba(245,158,11,.04)' : undefined;

          return (
            <tr key={i} style={rowBg ? { background: rowBg } : undefined}>
              <td style={{ textAlign: 'center', color: 'var(--text3)', fontSize: 10 }}>{i + 1}</td>
              <td style={{ fontSize: 10 }}>{formatDate(r.tgl_gadai)}</td>
              <td style={{ fontSize: 10 }}>{formatDate(r.tgl)}</td>
              <td>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 10 }}>{r.no_faktur || '—'}</span>
                {' '}<StatusBadge st={st} />
              </td>
              <td className="num" style={{ fontSize: 10 }}>{r.hari_aktual ?? '—'}</td>
              <td style={{ fontSize: 11 }}>{r.nama ?? '—'}</td>
              <td><StatusBadge st={r.kategori || '—'} /></td>
              <td className="num">{formatRp(tak)}</td>
              <td className="num">{formatRp(pi)}</td>
              <td className="num">{formatRp(r.total_tebus_sistem ?? 0)}</td>
              <td className="num" style={{ fontWeight: 600 }}>{formatRp(jb)}</td>
              <td className="num" style={{ color: 'var(--green)', fontWeight: 600 }}>{formatRp(jmlTebus)}</td>
              <td><PayBadge pay={r.payment || 'CASH'} /></td>
              <td style={{ fontSize: 10, color: catatan ? 'var(--warn)' : 'var(--text3)' }}>
                {catatan || '—'}
              </td>
              <td className="num" style={{ fontWeight: 600, color: laba >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {formatRp(laba)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
