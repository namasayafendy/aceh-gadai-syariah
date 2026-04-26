// ============================================================
// ACEH GADAI SYARIAH - Laporan Malam API Route
// File: app/api/laporan/malam/route.ts
//
// Laporan Malam = Laporan Harian yang diformat untuk cetak
// malam hari + ringkasan saldo per outlet.
//
// GET  /api/laporan/malam?tgl=yyyy-MM-dd
//   → data laporan lengkap + format cetak + saldo per kas
//
// POST /api/laporan/malam
//   → simpan catatan serah terima laporan malam (PIN required)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// ─── GET: ambil data laporan malam ───────────────────────────
export async function GET(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    const tgl = searchParams.get('tgl')
      ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    // Ambil outlet info
    const { data: outletRow } = await db
      .from('outlets').select('*').eq('id', outletId).single();
    if (!outletRow) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName: string = outletRow.nama;

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
    // Gadai/SJB yg PERPANJANG/TAMBAH/KURANG hari ini → tgl_gadai di-reset
    // ke hari ini, jadi akad lamanya ikut muncul di list "Gadai Baru".
    // Sama seperti dashboard: eksklusi no_faktur yg dalam tebus/buyback
    // hari ini berstatus PERPANJANG (utk SJB) atau PERPANJANG/TAMBAH/KURANG (utk tb_tebus).
    // Catatan: SJB TIDAK punya status TAMBAH/KURANG (hanya BUYBACK/PERPANJANG/SITA).
    const reissueNoFakturs = new Set<string>();
    (tebusRaw ?? []).forEach(r => {
      const st = String(r.status ?? '').toUpperCase();
      if (st === 'PERPANJANG' || st === 'TAMBAH' || st === 'KURANG') {
        reissueNoFakturs.add(String(r.no_faktur ?? '').trim().toUpperCase());
      }
    });
    (buybackRaw ?? []).forEach(r => {
      const st = String(r.status ?? '').toUpperCase();
      if (st === 'PERPANJANG') {
        reissueNoFakturs.add(String(r.no_faktur ?? '').trim().toUpperCase());
      }
    });

    const isReissue = (r: any) =>
      reissueNoFakturs.has(String(r.no_faktur ?? '').trim().toUpperCase());

    // Filter akad asli "Gadai Baru": hanya yg MEMANG dibuat di tanggal laporan
    // (created_at sama hari dgn tgl_gadai). Akad lama yg tgl_gadai-nya di-update
    // oleh TAMBAH/KURANG/PERPANJANG hari ini -> exclude. Kasus akad baru + TAMBAH
    // di hari yg sama -> keduanya tetap muncul. Pakai shift +7h utk Asia/Jakarta.
    const sameJktDate = (a: any, b: any): boolean => {
      if (!a || !b) return true;
      const da = new Date(a); da.setUTCHours(da.getUTCHours() + 7);
      const db_ = new Date(b); db_.setUTCHours(db_.getUTCHours() + 7);
      return da.toISOString().slice(0, 10) === db_.toISOString().slice(0, 10);
    };
    const gadaiFiltered = (gadaiRaw ?? []).filter((r: any) => sameJktDate(r.created_at, r.tgl_gadai));
    const sjbFiltered   = (sjbRaw   ?? []).filter((r: any) => sameJktDate(r.created_at, r.tgl_gadai));

    // jumlahLamaMap: override jumlah_gadai akad asli ke nilai AWAL (sebelum
    // TAMBAH/KURANG update tb_gadai). Konsisten dgn dashboard.
    const jumlahLamaMap: Record<string, number> = {};
    (tebusRaw ?? []).forEach(r => {
      const st = String(r.status ?? '').toUpperCase();
      if (st === 'TAMBAH' || st === 'KURANG') {
        const nf = String(r.no_faktur ?? '').trim().toUpperCase();
        jumlahLamaMap[nf] = Number(r.jumlah_gadai ?? 0);
      }
    });
    const gadaiWithOriginal = gadaiFiltered.map(r => {
      const nf = String(r.no_faktur ?? '').trim().toUpperCase();
      if (jumlahLamaMap[nf] !== undefined) {
        return { ...r, jumlah_gadai: jumlahLamaMap[nf] };
      }
      return r;
    });

    // Inject TAMBAH/KURANG sbg row di "Gadai Baru" pakai jumlah baru (mirror dashboard)
    // SJB tidak punya TAMBAH/KURANG → hanya dari tb_tebus
    const tambahKurangInjected = (tebusRaw ?? []).filter(r => {
      const st = String(r.status ?? '').toUpperCase();
      return st === 'TAMBAH' || st === 'KURANG';
    }).map(r => ({
      no_faktur:    r.no_faktur,
      kategori:     r.kategori,
      barang:       r.barang,
      taksiran:     Number(r.taksiran ?? 0),
      jumlah_gadai: Number(r.jumlah_gadai_baru ?? 0),
      payment:      r.payment ?? 'CASH',
      kasir:        r.kasir ?? '',
      _ket:         String(r.status ?? '').toUpperCase(), // 'TAMBAH' | 'KURANG'
    }));

    // ── Hitung rekap ──────────────────────────────────────────
    const ceil = (v: number) => Math.round(v);
    let gadaiKeluar = 0, sjbKeluar = 0;
    let tebusMasuk = 0, perpanjangMasuk = 0, buybackMasuk = 0;
    let labaTotal = 0;

    // Total Keluar = row "Gadai Baru" yg ditampilkan di tabel:
    //   • gadaiFiltered        → akad baru hari ini (exclude yg cuma PERPANJANG/TAMBAH/KURANG)
    //   • sjbFiltered          → akad SJB baru hari ini (exclude PERPANJANG)
    //   • tambahKurangInjected → TAMBAH/KURANG hari ini (pakai jumlah BARU)
    // Konsisten antara count & nominal dgn tabel "Gadai Baru". (match dashboard)
    gadaiWithOriginal.forEach(r => { gadaiKeluar += Number(r.jumlah_gadai ?? 0); });
    tambahKurangInjected.forEach(r => { gadaiKeluar += Number(r.jumlah_gadai ?? 0); });
    sjbFiltered.forEach(r   => { sjbKeluar   += Number(r.harga_jual    ?? 0); });

    // ── Rekap Masuk (mirror dashboard — pisah tebus/buyback/perpanjang) ──
    // tb_tebus (gadai regular): TEBUS/TAMBAH/KURANG → tebusMasuk, PERPANJANG → perpanjangMasuk
    // tb_buyback (SJB): BUYBACK → buybackMasuk, PERPANJANG → perpanjangMasuk
    (tebusRaw ?? []).forEach(r => {
      const st = String(r.status ?? '').toUpperCase();
      const jb = Number(r.jumlah_bayar ?? 0);
      const pb = Number(r.jumlah_gadai_baru ?? 0);
      if (st === 'TEBUS') tebusMasuk += jb;
      else if (st === 'PERPANJANG') perpanjangMasuk += jb;
      else if (st === 'TAMBAH') tebusMasuk += Math.max(0, pb - jb);
      else if (st === 'KURANG') tebusMasuk += jb + pb;
      // JUAL/SITA: no cash masuk (JUAL dihitung terpisah di page)
    });
    (buybackRaw ?? []).forEach(r => {
      const st = String(r.status ?? '').toUpperCase();
      const jb = Number(r.jumlah_bayar ?? 0);
      if (st === 'BUYBACK') buybackMasuk += jb;
      else if (st === 'PERPANJANG') perpanjangMasuk += jb;
      // SITA: no cash masuk; JUAL dihitung terpisah di page
    });

    // ── Laba (mirror dashboard — status asli dipertahankan) ──
    const allTebus = [
      ...(tebusRaw   ?? []).map(r => ({ ...r, _type: 'TEBUS' })),
      ...(buybackRaw ?? []).map(r => ({
        ...r,
        nama_nasabah:    r.nama,
        jumlah_gadai:    r.harga_jual,
        jumlah_gadai_baru: r.harga_jual_baru,
        _type: 'BUYBACK',
      })),
    ];

    allTebus.forEach(r => {
      const st  = String(r.status ?? '').toUpperCase();
      const jb  = Number(r.jumlah_bayar ?? 0);
      const pg  = Number(r.jumlah_gadai ?? 0);
      const pb  = Number(r.jumlah_gadai_baru ?? 0);

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

    // ── Kas rekap (masuk/keluar hari ini) ─────────────────────
    let kasMasukHari = 0, kasKeluarHari = 0;
    (kasRaw ?? []).forEach(r => {
      const jml = Number(r.jumlah ?? 0);
      if (r.tipe === 'MASUK') kasMasukHari  += jml;
      else                     kasKeluarHari += jml;
    });

    return NextResponse.json({
      ok: true,
      tgl,
      outlet: {
        nama:              outletName,
        alamat:            outletRow.alamat          ?? '',
        kota:              outletRow.kota             ?? '',
        telpon:            outletRow.telepon        ?? outletRow.telpon ?? '',
        namaPerusahaan:    outletRow.nama_perusahaan  ?? 'PT. ACEH GADAI SYARIAH',
        waktuOperasional:  outletRow.waktu_operasional ?? '',
      },
      cetakInfo: { tglCetak, jamCetak },

      // Detail lists untuk tabel cetak
      // gadaiList: row akad baru (filter exclude yg hari ini PERPANJANG/TAMBAH/KURANG)
      //           + row TAMBAH/KURANG (jumlah_gadai = jumlah_gadai_baru, _ket penanda)
      // sjbList:  row akad SJB baru (filter exclude yg hari ini PERPANJANG)
      gadaiList:  [...gadaiWithOriginal, ...tambahKurangInjected],
      sjbList:    sjbFiltered.map(r => ({ ...r, jumlah_gadai: r.harga_jual })),
      tebusList:  tebusRaw   ?? [],
      buybackList: buybackRaw ?? [],
      kasList:    kasRaw     ?? [],

      // Rekap angka
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

      // Saldo kas akhir hari
      saldo: {
        cash: ceil(Number(saldoCash ?? 0)),
        bank: ceil(Number(saldoBank ?? 0)),
        total: ceil(Number(saldoCash ?? 0) + Number(saldoBank ?? 0)),
      },
    });

  } catch (err) {
    console.error('[laporan/malam GET]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

// ─── POST: simpan catatan serah terima laporan malam ─────────
// Opsional — kasir bisa tandai laporan malam sudah diserahkan
export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body     = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) {
      return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    }

    const { data: outletRow } = await db
      .from('outlets').select('nama').eq('id', outletId).single();
    const outletName = outletRow ? String((outletRow as any).nama) : ''

    const tgl = body.tgl
      ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    // Simpan ke audit_log sebagai catatan serah terima laporan malam
    await db.from('audit_log').insert({
      user_nama:  pinResult.nama,
      tabel:      'laporan_malam',
      record_id:  tgl,
      aksi:       'SERAH_TERIMA',
      field:      'ALL',
      nilai_baru: JSON.stringify({
        tgl,
        catatan:    body.catatan ?? '',
        kasAkhir:   body.kasAkhir ?? {},
      }),
      outlet:     outletName,
      catatan:    body.catatan ?? '',
    });

    return NextResponse.json({
      ok: true,
      msg: 'Laporan malam berhasil disimpan.',
      kasir: pinResult.nama,
    });

  } catch (err) {
    console.error('[laporan/malam POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
