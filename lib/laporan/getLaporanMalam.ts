// ============================================================
// ACEH GADAI SYARIAH - Shared "Laporan Malam" Data Fetcher
// File: lib/laporan/getLaporanMalam.ts
//
// COPY EXACT dari logic GET /api/laporan/malam/route.ts.
// Dipakai oleh cron /api/laporan/nightly-send supaya bisa loop
// semua outlet tanpa internal HTTP call.
//
// Endpoint /api/laporan/malam yang asli TETAP UTUH — fungsi ini
// adalah duplikat sengaja supaya production tidak ke-impact.
// Kalau ada bug-fix di laporan malam, fix di KEDUA tempat.
//
// ALUR KAS / FILTER / REKAP TIDAK DIUBAH.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Helper: hitung laba per row (selaras /laporan/page.tsx & lib/print.ts) ──
export function hitungLaba(st: string, jb: number, pinja: number, _uj: number, gadaiBaru: number): number {
  switch (st) {
    case 'TEBUS':
    case 'BUYBACK':    return jb - pinja;
    case 'PERPANJANG': return jb;
    case 'TAMBAH':     return (gadaiBaru - jb) - pinja;
    case 'KURANG':     return (jb + gadaiBaru) - pinja;
    default:           return jb - pinja;
  }
}

// ── Helper: derive list & angka tambahan dari result GET ──
// Cermin transformasi di app/laporan/page.tsx supaya PDF cron
// tampil identik dgn yg dilihat owner di tombol "Cetak".
export interface LaporanExtras {
  allTebus: any[];
  tebusOnly: any[];
  perpanjangList: any[];
  jualSitaList: any[];
  labaTebus: number;
  labaBB: number;
  labaPjg: number;
  labaJual: number;
  labaSita: number;
  labaTK: number;
  labaTotal: number;
  buybackMasuk: number;
  jualMasuk: number;
  sitaMasuk: number;
  totalMasukAll: number;
}

export function computeLaporanExtras(d: LaporanMalamResult): LaporanExtras {
  const tebusList: any[] = d.tebusList ?? [];
  const buybackList: any[] = d.buybackList ?? [];

  const allTebus = [
    ...tebusList.map((r: any) => ({ ...r, _isBuyback: false })),
    ...buybackList.map((r: any) => ({
      ...r,
      nama_nasabah:      r.nama,
      jumlah_gadai:      r.harga_jual,
      jumlah_gadai_baru: r.harga_jual_baru,
      _isBuyback: true,
    })),
  ];

  const tebusOnly      = allTebus.filter(r => ['TEBUS', 'TAMBAH', 'KURANG', 'BUYBACK'].includes((r.status || '').toUpperCase()));
  const perpanjangList = allTebus.filter(r => (r.status || '').toUpperCase() === 'PERPANJANG');
  const jualSitaList   = allTebus.filter(r => ['JUAL', 'SITA'].includes((r.status || '').toUpperCase()));

  let labaTebus = 0, labaBB = 0, labaPjg = 0, labaJual = 0, labaSita = 0, labaTK = 0;
  allTebus.forEach((r: any) => {
    const st = (r.status || '').toUpperCase();
    const lb = hitungLaba(
      st,
      Number(r.jumlah_bayar || 0),
      Number(r.jumlah_gadai || 0),
      Number(r.ujrah_berjalan || 0),
      Number(r.jumlah_gadai_baru || 0),
    );
    if      (st === 'TEBUS')      labaTebus += lb;
    else if (st === 'BUYBACK')    labaBB    += lb;
    else if (st === 'PERPANJANG') labaPjg   += lb;
    else if (st === 'JUAL')       labaJual  += lb;
    else if (st === 'SITA')       labaSita  += lb;
    else if (st === 'TAMBAH' || st === 'KURANG') labaTK += lb;
  });
  const labaTotal = labaTebus + labaBB + labaPjg + labaJual + labaSita + labaTK;

  const buybackMasuk = buybackList
    .filter((r: any) => (r.status || '').toUpperCase() === 'BUYBACK')
    .reduce((s: number, r: any) => s + Number(r.jumlah_bayar || 0), 0);
  const jualMasuk = jualSitaList
    .filter((r: any) => (r.status || '').toUpperCase() === 'JUAL')
    .reduce((s: number, r: any) => s + Number(r.jumlah_bayar || 0), 0);
  const sitaMasuk = jualSitaList
    .filter((r: any) => (r.status || '').toUpperCase() === 'SITA')
    .reduce((s: number, r: any) => s + Number(r.jumlah_bayar || 0), 0);

  const totalMasukAll =
    (d.rekap.tebusMasuk || 0) +
    (d.rekap.perpanjangMasuk || 0) +
    buybackMasuk + jualMasuk + sitaMasuk;

  return {
    allTebus, tebusOnly, perpanjangList, jualSitaList,
    labaTebus, labaBB, labaPjg, labaJual, labaSita, labaTK, labaTotal,
    buybackMasuk, jualMasuk, sitaMasuk, totalMasukAll,
  };
}

export interface LaporanMalamResult {
  ok: boolean;
  msg?: string;
  tgl: string;
  outlet: {
    nama: string;
    alamat: string;
    kota: string;
    telpon: string;
    namaPerusahaan: string;
    waktuOperasional: string;
  };
  cetakInfo: { tglCetak: string; jamCetak: string };
  gadaiList: any[];
  sjbList: any[];
  tebusList: any[];
  buybackList: any[];
  kasList: any[];
  rekap: {
    gadaiKeluar: number;
    sjbKeluar: number;
    totalKeluar: number;
    tebusMasuk: number;
    perpanjangMasuk: number;
    buybackMasuk: number;
    totalMasuk: number;
    labaTotal: number;
    kasMasukHari: number;
    kasKeluarHari: number;
  };
  saldo: { cash: number; bank: number; total: number };
}

export async function getLaporanMalam(
  db: SupabaseClient,
  outletId: number,
  tgl: string,
): Promise<LaporanMalamResult> {
  // Ambil outlet info
  const { data: outletRow } = await db
    .from('outlets').select('*').eq('id', outletId).single();
  if (!outletRow) {
    return {
      ok: false, msg: 'Outlet tidak ditemukan.', tgl,
      outlet: { nama: '', alamat: '', kota: '', telpon: '', namaPerusahaan: '', waktuOperasional: '' },
      cetakInfo: { tglCetak: '', jamCetak: '' },
      gadaiList: [], sjbList: [], tebusList: [], buybackList: [], kasList: [],
      rekap: { gadaiKeluar: 0, sjbKeluar: 0, totalKeluar: 0, tebusMasuk: 0, perpanjangMasuk: 0, buybackMasuk: 0, totalMasuk: 0, labaTotal: 0, kasMasukHari: 0, kasKeluarHari: 0 },
      saldo: { cash: 0, bank: 0, total: 0 },
    };
  }
  const outletName: string = (outletRow as any).nama;

  // Timestamp untuk header cetak
  const now = new Date();
  const jamCetak = now.toLocaleTimeString('id-ID', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta',
  });
  const tglCetak = now.toLocaleDateString('id-ID', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });

  // ── Gadai akad baru ───────────────────────────────────────
  const { data: gadaiRaw } = await db
    .from('tb_gadai')
    .select('no_faktur,nama,kategori,barang,jumlah_gadai,taksiran,payment,kasir,status,created_at,tgl_gadai')
    .eq('outlet', outletName)
    .gte('tgl_gadai', tgl + 'T00:00:00+07:00')
    .lte('tgl_gadai', tgl + 'T23:59:59+07:00')
    .neq('status', 'BATAL')
    .order('tgl_gadai', { ascending: true });

  // ── SJB akad baru ─────────────────────────────────────────
  const { data: sjbRaw } = await db
    .from('tb_sjb')
    .select('no_faktur,nama,kategori,barang,harga_jual,payment,kasir,status,created_at,tgl_gadai')
    .eq('outlet', outletName)
    .gte('tgl_gadai', tgl + 'T00:00:00+07:00')
    .lte('tgl_gadai', tgl + 'T23:59:59+07:00')
    .neq('status', 'BATAL')
    .order('tgl_gadai', { ascending: true });

  // ── Tebus + Buyback ───────────────────────────────────────
  const { data: tebusRaw } = await db
    .from('tb_tebus')
    .select('id,tgl,no_faktur,nama_nasabah,kategori,barang,taksiran,jumlah_gadai,jumlah_gadai_baru,ujrah_berjalan,total_tebus_sistem,jumlah_bayar,selisih,id_diskon,status,alasan,payment,kasir,hari_aktual,tanpa_surat')
    .eq('outlet', outletName)
    .gte('tgl', tgl + 'T00:00:00+07:00')
    .lte('tgl', tgl + 'T23:59:59+07:00')
    .neq('status', 'BATAL')
    .order('tgl', { ascending: true });

  const { data: buybackRaw } = await db
    .from('tb_buyback')
    .select('id,tgl,no_faktur,nama,kategori,barang,taksiran,harga_jual,harga_jual_baru,ujrah_berjalan,total_sistem,jumlah_bayar,selisih,id_diskon,status,alasan,payment,kasir,hari_aktual,tanpa_surat')
    .eq('outlet', outletName)
    .gte('tgl', tgl + 'T00:00:00+07:00')
    .lte('tgl', tgl + 'T23:59:59+07:00')
    .neq('status', 'BATAL')
    .order('tgl', { ascending: true });

  // ── Kas hari ini (urutan ascending untuk cetak) ───────────
  const { data: kasRaw } = await db
    .from('tb_kas')
    .select('id,tgl,no_ref,keterangan,tipe,tipe_kas,jumlah,jenis,sumber,kasir')
    .eq('outlet', outletName)
    .gte('tgl', tgl + 'T00:00:00+07:00')
    .lte('tgl', tgl + 'T23:59:59+07:00')
    .order('tgl', { ascending: true });

  // ── Saldo kas total sampai akhir hari ini ─────────────────
  const sampaiAkhirHari = tgl + 'T23:59:59+07:00';
  const [{ data: saldoCash }, { data: saldoBank }] = await Promise.all([
    db.rpc('get_saldo_kas', { p_outlet: outletName, p_tipe_kas: 'CASH', p_sampai: sampaiAkhirHari }),
    db.rpc('get_saldo_kas', { p_outlet: outletName, p_tipe_kas: 'BANK', p_sampai: sampaiAkhirHari }),
  ]);

  // ── Bangun exclusion set ──────────────────────────────────
  // Sama dgn /api/laporan/malam: Gadai/SJB yg PERPANJANG/TAMBAH/KURANG
  // hari ini → exclude dari list "Gadai Baru" karena akad lamanya
  // ikut muncul (tgl_gadai di-reset).
  const reissueNoFakturs = new Set<string>();
  (tebusRaw ?? []).forEach((r: any) => {
    const st = String(r.status ?? '').toUpperCase();
    if (st === 'PERPANJANG' || st === 'TAMBAH' || st === 'KURANG') {
      reissueNoFakturs.add(String(r.no_faktur ?? '').trim().toUpperCase());
    }
  });
  (buybackRaw ?? []).forEach((r: any) => {
    const st = String(r.status ?? '').toUpperCase();
    if (st === 'PERPANJANG') {
      reissueNoFakturs.add(String(r.no_faktur ?? '').trim().toUpperCase());
    }
  });

  const isReissue = (r: any) =>
    reissueNoFakturs.has(String(r.no_faktur ?? '').trim().toUpperCase());

  // Filter akad asli "Gadai Baru": hanya yg MEMANG dibuat di tanggal laporan
  // (created_at sama hari dgn tgl_gadai). Akad lama yg tgl_gadai-nya di-update
  // oleh TAMBAH/KURANG/PERPANJANG hari ini → exclude. Kasus akad baru + TAMBAH
  // di hari yg sama → keduanya tetap muncul. Pakai shift +7h utk Asia/Jakarta.
  const sameJktDate = (a: any, b: any): boolean => {
    if (!a || !b) return true;
    const da = new Date(a); da.setUTCHours(da.getUTCHours() + 7);
    const db_ = new Date(b); db_.setUTCHours(db_.getUTCHours() + 7);
    return da.toISOString().slice(0, 10) === db_.toISOString().slice(0, 10);
  };
  const gadaiFiltered = (gadaiRaw ?? []).filter((r: any) => sameJktDate(r.created_at, r.tgl_gadai));
  const sjbFiltered   = (sjbRaw   ?? []).filter((r: any) => sameJktDate(r.created_at, r.tgl_gadai));

  // jumlahLamaMap: override jumlah_gadai akad asli ke nilai AWAL (sebelum
  // TAMBAH/KURANG update tb_gadai). tb_tebus.jumlah_gadai menyimpan nilai
  // sebelum perubahan -> dipakai sbg map. Konsisten dgn dashboard.
  const jumlahLamaMap: Record<string, number> = {};
  (tebusRaw ?? []).forEach((r: any) => {
    const st = String(r.status ?? '').toUpperCase();
    if (st === 'TAMBAH' || st === 'KURANG') {
      const nf = String(r.no_faktur ?? '').trim().toUpperCase();
      jumlahLamaMap[nf] = Number(r.jumlah_gadai ?? 0);
    }
  });

  // Override gadaiFiltered.jumlah_gadai ke nilai akad asli kalau ada di map
  const gadaiWithOriginal = gadaiFiltered.map((r: any) => {
    const nf = String(r.no_faktur ?? '').trim().toUpperCase();
    if (jumlahLamaMap[nf] !== undefined) {
      return { ...r, jumlah_gadai: jumlahLamaMap[nf] };
    }
    return r;
  });

  // Inject TAMBAH/KURANG sbg row di "Gadai Baru" pakai jumlah baru
  const tambahKurangInjected = (tebusRaw ?? []).filter((r: any) => {
    const st = String(r.status ?? '').toUpperCase();
    return st === 'TAMBAH' || st === 'KURANG';
  }).map((r: any) => ({
    no_faktur:    r.no_faktur,
    kategori:     r.kategori,
    barang:       r.barang,
    taksiran:     Number(r.taksiran ?? 0),
    jumlah_gadai: Number(r.jumlah_gadai_baru ?? 0),
    payment:      r.payment ?? 'CASH',
    kasir:        r.kasir ?? '',
    _ket:         String(r.status ?? '').toUpperCase(),
  }));

  // ── Hitung rekap ──────────────────────────────────────────
  const ceil = (v: number) => Math.round(v);
  let gadaiKeluar = 0, sjbKeluar = 0;
  let tebusMasuk = 0, perpanjangMasuk = 0, buybackMasuk = 0;
  let labaTotal = 0;

  gadaiWithOriginal.forEach((r: any) => { gadaiKeluar += Number(r.jumlah_gadai ?? 0); });
  tambahKurangInjected.forEach(r => { gadaiKeluar += Number(r.jumlah_gadai ?? 0); });
  sjbFiltered.forEach((r: any) => { sjbKeluar += Number(r.harga_jual ?? 0); });

  (tebusRaw ?? []).forEach((r: any) => {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    const pb = Number(r.jumlah_gadai_baru ?? 0);
    if (st === 'TEBUS') tebusMasuk += jb;
    else if (st === 'PERPANJANG') perpanjangMasuk += jb;
    else if (st === 'TAMBAH') tebusMasuk += Math.max(0, pb - jb);
    else if (st === 'KURANG') tebusMasuk += jb + pb;
  });
  (buybackRaw ?? []).forEach((r: any) => {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    if (st === 'BUYBACK') buybackMasuk += jb;
    else if (st === 'PERPANJANG') perpanjangMasuk += jb;
  });

  // ── Laba ──
  const allTebus = [
    ...(tebusRaw ?? []).map((r: any) => ({ ...r, _type: 'TEBUS' })),
    ...(buybackRaw ?? []).map((r: any) => ({
      ...r,
      nama_nasabah: r.nama,
      jumlah_gadai: r.harga_jual,
      jumlah_gadai_baru: r.harga_jual_baru,
      _type: 'BUYBACK',
    })),
  ];

  allTebus.forEach((r: any) => {
    const st = String(r.status ?? '').toUpperCase();
    const jb = Number(r.jumlah_bayar ?? 0);
    const pg = Number(r.jumlah_gadai ?? 0);
    const pb = Number(r.jumlah_gadai_baru ?? 0);
    let laba = 0;
    switch (st) {
      case 'TEBUS':
      case 'BUYBACK':    laba = jb - pg; break;
      case 'PERPANJANG': laba = jb;      break;
      case 'TAMBAH':     laba = (pb - jb) - pg; break;
      case 'KURANG':     laba = (jb + pb) - pg; break;
      default:           laba = jb - pg;
    }
    labaTotal += laba;
  });

  let kasMasukHari = 0, kasKeluarHari = 0;
  (kasRaw ?? []).forEach((r: any) => {
    const jml = Number(r.jumlah ?? 0);
    if (r.tipe === 'MASUK') kasMasukHari  += jml;
    else                     kasKeluarHari += jml;
  });

  return {
    ok: true,
    tgl,
    outlet: {
      nama:              outletName,
      alamat:            (outletRow as any).alamat          ?? '',
      kota:              (outletRow as any).kota             ?? '',
      telpon:            (outletRow as any).telepon        ?? (outletRow as any).telpon ?? '',
      namaPerusahaan:    (outletRow as any).nama_perusahaan  ?? 'PT. ACEH GADAI SYARIAH',
      waktuOperasional:  (outletRow as any).waktu_operasional ?? '',
    },
    cetakInfo: { tglCetak, jamCetak },
    gadaiList:  [...gadaiWithOriginal, ...tambahKurangInjected],
    sjbList:    sjbFiltered.map((r: any) => ({ ...r, jumlah_gadai: r.harga_jual })),
    tebusList:  tebusRaw   ?? [],
    buybackList: buybackRaw ?? [],
    kasList:    kasRaw     ?? [],
    rekap: {
      gadaiKeluar:      ceil(gadaiKeluar),
      sjbKeluar:        ceil(sjbKeluar),
      totalKeluar:      ceil(gadaiKeluar + sjbKeluar),
      tebusMasuk:       ceil(tebusMasuk),
      perpanjangMasuk:  ceil(perpanjangMasuk),
      buybackMasuk:     ceil(buybackMasuk),
      totalMasuk:       ceil(tebusMasuk + buybackMasuk + perpanjangMasuk),
      labaTotal:        ceil(labaTotal),
      kasMasukHari:     ceil(kasMasukHari),
      kasKeluarHari:    ceil(kasKeluarHari),
    },
    saldo: {
      cash:  ceil(Number(saldoCash ?? 0)),
      bank:  ceil(Number(saldoBank ?? 0)),
      total: ceil(Number(saldoCash ?? 0) + Number(saldoBank ?? 0)),
    },
  };
}
