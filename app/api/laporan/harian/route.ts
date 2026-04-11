// ============================================================
// ACEH GADAI SYARIAH - Laporan Harian API Route
// File: app/api/laporan/harian/route.ts
//
// Cermin getLaporanHarian() di GAS Code.gs.
// GET /api/laporan/harian?tgl=yyyy-MM-dd
//
// Returns: gadai + SJB (akad baru), tebus + buyback (masuk),
//          perpanjang, sita/jual, kas, saldo, rekap laba.
// Filter by outlet dari header x-outlet-id.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// ─── Helper: hitung laba per status (cermin _hitungLaba GAS) ──
function hitungLaba(
  status: string, jumlahBayar: number,
  jumlahGadai: number, jumlahGadaiBaru: number
): number {
  switch (status.toUpperCase()) {
    case 'TEBUS':
    case 'BUYBACK':    return jumlahBayar - jumlahGadai;
    case 'TAMBAH':     return (jumlahGadaiBaru - jumlahBayar) - jumlahGadai;
    case 'KURANG':     return (jumlahBayar + jumlahGadaiBaru) - jumlahGadai;
    case 'PERPANJANG': return jumlahBayar;
    default:           return jumlahBayar - jumlahGadai; // JUAL, SITA
  }
}

export async function GET(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // Tanggal filter — default hari ini WIB
    const tgl = searchParams.get('tgl')
      ?? new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    // Ambil outlet name
    const { data: outletRow } = await db
      .from('outlets').select('nama').eq('id', outletId).single();
    const outletName = outletRow ? String((outletRow as any).nama) : ''

    // ── Helper: filter rows by tanggal + outlet (string compare) ─
    const filterByDate = (rows: any[], dateCol: string) =>
      (rows ?? []).filter(r => {
        if (!r.id) return false;
        const tglStr = r[dateCol] ? String(r[dateCol]).substring(0, 10) : '';
        if (tglStr !== tgl) return false;
        if (r.status?.toUpperCase() === 'BATAL') return false;
        if (r.outlet && outletName && r.outlet !== outletName) return false;
        return true;
      });

    // ── 1. Gadai akad baru ────────────────────────────────────
    const { data: gadaiRaw } = await db
      .from('tb_gadai')
      .select('no_faktur,nama,kategori,barang,jumlah_gadai,taksiran,payment,kasir,outlet,tgl_gadai,status')
      .eq('outlet', outletName)
      .gte('tgl_gadai', tgl + 'T00:00:00+07:00')
      .lte('tgl_gadai', tgl + 'T23:59:59+07:00')
      .neq('status', 'BATAL');

    // ── 2. SJB akad baru (keluar uang = sama section gadai) ───
    const { data: sjbRaw } = await db
      .from('tb_sjb')
      .select('no_faktur,nama,kategori,barang,harga_jual,taksiran,payment,kasir,outlet,tgl_gadai,status')
      .eq('outlet', outletName)
      .gte('tgl_gadai', tgl + 'T00:00:00+07:00')
      .lte('tgl_gadai', tgl + 'T23:59:59+07:00')
      .neq('status', 'BATAL');

    // Normalize SJB ke format gadai (jumlah_gadai = harga_jual)
    const sjbList = (sjbRaw ?? []).map(r => ({
      ...r,
      jumlah_gadai: r.harga_jual,
      isSJB: true,
    }));

    // ── 3. Tebus (dari tb_gadai) ──────────────────────────────
    const { data: tebusRaw } = await db
      .from('tb_tebus')
      .select('*')
      .eq('outlet', outletName)
      .gte('tgl', tgl + 'T00:00:00+07:00')
      .lte('tgl', tgl + 'T23:59:59+07:00')
      .neq('status', 'BATAL');

    // ── 4. Buyback (dari tb_sjb) ──────────────────────────────
    const { data: buybackRaw } = await db
      .from('tb_buyback')
      .select('*')
      .eq('outlet', outletName)
      .gte('tgl', tgl + 'T00:00:00+07:00')
      .lte('tgl', tgl + 'T23:59:59+07:00')
      .neq('status', 'BATAL');

    // ── 5. TAMBAH/KURANG hari ini — inject ke gadai section ───
    // Koreksi jumlah_gadai di gadaiRaw dengan jumlah gadai LAMA
    // (supaya laporan menampilkan pinjaman awal, bukan sesudah ubah)
    const tambahKurangToday = (tebusRaw ?? []).filter(r =>
      ['TAMBAH','KURANG'].includes((r.status ?? '').toUpperCase())
    );
    const jumlahLamaMap: Record<string, number> = {};
    const tambahKurangList: any[] = [];
    for (const r of tambahKurangToday) {
      jumlahLamaMap[r.no_faktur] = Number(r.jumlah_gadai);
      tambahKurangList.push({
        no_faktur:   r.no_faktur,
        nama:        r.nama_nasabah,
        kategori:    r.kategori,
        barang:      r.barang,
        taksiran:    r.taksiran,
        jumlah_gadai: r.jumlah_gadai_baru,
        payment:     r.payment,
        kasir:       r.kasir,
        ket:         r.status,
        status:      'AKTIF',
      });
    }
    // Koreksi gadaiRaw: jika ada TAMBAH/KURANG, tampilkan jumlah LAMA
    const gadaiList = (gadaiRaw ?? []).map(r => ({
      ...r,
      jumlah_gadai: jumlahLamaMap[r.no_faktur] ?? r.jumlah_gadai,
    })).concat(tambahKurangList);

    // ── 6. Lookup tgl_gadai untuk enrich tebus/buyback ────────
    // Ambil dari tb_gadai dan tb_sjb
    const allNoFakturs = [
      ...(tebusRaw ?? []).map(r => r.no_faktur),
      ...(buybackRaw ?? []).map(r => r.no_faktur),
    ].filter(Boolean);

    const gadaiLookup: Record<string, string> = {};
    const sjbLookup: Record<string, string>   = {};

    if (allNoFakturs.length > 0) {
      const { data: gadaiLkp } = await db
        .from('tb_gadai').select('no_faktur,tgl_gadai')
        .in('no_faktur', allNoFakturs);
      (gadaiLkp ?? []).forEach(r => {
        gadaiLookup[r.no_faktur] = r.tgl_gadai
          ? String(r.tgl_gadai).substring(0, 10) : '';
      });

      const { data: sjbLkp } = await db
        .from('tb_sjb').select('no_faktur,tgl_gadai')
        .in('no_faktur', allNoFakturs);
      (sjbLkp ?? []).forEach(r => {
        sjbLookup[r.no_faktur] = r.tgl_gadai
          ? String(r.tgl_gadai).substring(0, 10) : '';
      });
    }

    // Enrich tebus dengan tgl_gadai asal
    const tebusEnriched = (tebusRaw ?? []).map(r => ({
      ...r,
      xTglGadai: gadaiLookup[r.no_faktur] ?? '',
    }));
    const buybackEnriched = (buybackRaw ?? []).map(r => ({
      ...r,
      xTglGadai: sjbLookup[r.no_faktur] ?? '',
    }));

    // ── 7. Kas hari ini ───────────────────────────────────────
    const { data: kasRows } = await db
      .from('tb_kas')
      .select('id,tgl,no_ref,keterangan,tipe,tipe_kas,jumlah,jenis,sumber,kasir')
      .eq('outlet', outletName)
      .gte('tgl', tgl + 'T00:00:00+07:00')
      .lte('tgl', tgl + 'T23:59:59+07:00')
      .order('tgl', { ascending: true });

    // ── 8. Saldo kas total ────────────────────────────────────
    const { data: saldoResult } = await db.rpc('get_saldo_kas', {
      p_outlet:    outletName,
      p_tipe_kas:  null,
      p_sampai:    null,
    });
    // Get split cash/bank
    const { data: saldoCash } = await db.rpc('get_saldo_kas', {
      p_outlet: outletName, p_tipe_kas: 'CASH', p_sampai: null,
    });
    const { data: saldoBank } = await db.rpc('get_saldo_kas', {
      p_outlet: outletName, p_tipe_kas: 'BANK', p_sampai: null,
    });

    // ── 9. Hitung rekap & laba ────────────────────────────────
    const allTebusLike = [...tebusEnriched, ...buybackEnriched];

    let gadaiKeluar = 0, gadaiCount = 0;
    let tebusMasuk = 0, tebusUjrah = 0, tebusCount = 0;
    let perpanjangMasuk = 0, perpanjangUjrah = 0, perpanjangCount = 0;
    let sitaCount = 0, jualMasuk = 0;

    const tebusOnly: any[]     = [];
    const perpanjangList: any[] = [];
    const jualSitaList: any[]   = [];

    let gadaiNominal = 0, sjbNominal = 0;
    let tebusNominal = 0, buybackNominal = 0;
    let labaTebus = 0, labaBuyback = 0, labaPerpanjang = 0;
    let labaSita = 0, labaJual = 0, labaTambah = 0, labaKurang = 0;

    gadaiList.forEach(g => { gadaiKeluar += Number(g.jumlah_gadai ?? 0); gadaiCount++; gadaiNominal += Number(g.jumlah_gadai ?? 0); });
    sjbList.forEach(s  => { gadaiKeluar += Number(s.jumlah_gadai ?? 0); gadaiCount++; sjbNominal  += Number(s.jumlah_gadai ?? 0); });

    allTebusLike.forEach(t => {
      const st    = String(t.status ?? '').toUpperCase();
      const jb    = Number(t.jumlah_bayar ?? 0);
      const ujrah = Number(t.ujrah_berjalan ?? 0);
      const sel   = Number(t.selisih ?? 0);
      const pinja = Number(t.jumlah_gadai ?? t.harga_jual ?? 0);
      const gbaru = Number(t.jumlah_gadai_baru ?? t.harga_jual_baru ?? 0);
      const laba  = hitungLaba(st, jb, pinja, gbaru);
      const isBB  = !!t.id_sjb;

      if (st === 'PERPANJANG') {
        perpanjangMasuk += jb; perpanjangUjrah += ujrah; perpanjangCount++;
        labaPerpanjang  += laba;
        perpanjangList.push(t);
      } else if (st === 'SITA') {
        sitaCount++; labaSita += laba;
        jualSitaList.push(t);
      } else if (st === 'JUAL') {
        jualMasuk += jb; labaJual += laba;
        jualSitaList.push(t);
      } else if (st === 'TAMBAH') {
        tebusNominal += Math.max(0, gbaru - jb);
        labaTambah   += laba;
        tebusOnly.push(t);
      } else if (st === 'KURANG') {
        tebusNominal += jb + gbaru;
        labaKurang   += laba;
        tebusOnly.push(t);
      } else {
        // TEBUS / BUYBACK
        tebusMasuk  += jb; tebusUjrah += (ujrah + sel); tebusCount++;
        if (isBB) { buybackNominal += jb; labaBuyback += laba; }
        else       { tebusNominal  += jb; labaTebus   += laba; }
        tebusOnly.push(t);
      }
    });

    const labaTotal = labaTebus + labaBuyback + labaPerpanjang
                    + labaSita  + labaJual    + labaTambah + labaKurang;

    return NextResponse.json({
      ok: true, tgl, outlet: outletName,
      gadai: {
        keluar: Math.round(gadaiKeluar),
        count:  gadaiCount,
        list:   [...gadaiList, ...sjbList],
      },
      tebus: {
        masuk: Math.round(tebusMasuk),
        ujrah: Math.round(tebusUjrah),
        count: tebusCount,
      },
      perpanjang: {
        masuk: Math.round(perpanjangMasuk),
        ujrah: Math.round(perpanjangUjrah),
        count: perpanjangCount,
      },
      lainnya: { sitaCount, jualMasuk: Math.round(jualMasuk) },
      kas:  kasRows ?? [],
      saldo: {
        cash: Math.round(Number(saldoCash ?? 0)),
        bank: Math.round(Number(saldoBank ?? 0)),
      },
      tebusDetailList: allTebusLike,
      tebusOnly,
      perpanjangList,
      jualSitaList,
      rekap: {
        gadaiNominal:       Math.round(gadaiNominal),
        sjbNominal:         Math.round(sjbNominal),
        tebusNominal:       Math.round(tebusNominal),
        buybackNominal:     Math.round(buybackNominal),
        perpanjangNominal:  Math.round(perpanjangMasuk),
        totalMasuk:         Math.round(tebusNominal + buybackNominal + perpanjangMasuk),
        totalMasukTebusPjg: Math.round(tebusNominal + perpanjangMasuk),
        labaTebus:      Math.round(labaTebus),
        labaBuyback:    Math.round(labaBuyback),
        labaPerpanjang: Math.round(labaPerpanjang),
        labaSita:       Math.round(labaSita),
        labaJual:       Math.round(labaJual),
        labaTambah:     Math.round(labaTambah),
        labaKurang:     Math.round(labaKurang),
        labaTotal:      Math.round(labaTotal),
      },
    });

  } catch (err) {
    console.error('[laporan/harian]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
