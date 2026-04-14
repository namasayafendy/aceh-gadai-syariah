// ============================================================
// ACEH GADAI SYARIAH - Riwayat Kontrak API
// File: app/api/riwayat/route.ts
// POST: search kontrak history by No SBR/SJB
//   → Returns gadai/sjb data + tebus/buyback events + sita status
// Mirrors GAS: searchHistoryByKontrak()
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const noKontrak = String(body.noKontrak || '').trim().toUpperCase();
    const outletId = parseInt(body.outletId ?? '0', 10);

    if (!noKontrak) {
      return NextResponse.json({ ok: false, msg: 'No kontrak kosong.' });
    }

    // Get outlet name for filter (optional, 0 = all outlets)
    let outletFilter = '';
    if (outletId > 0) {
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
      outletFilter = outlet ? String((outlet as any).nama) : '';
    }

    // ── 1. Search in tb_gadai ─────────────────────────────────
    let gadaiData: any = null;
    let gadaiTipe = '';

    {
      let q = db.from('tb_gadai')
        .select('*')
        .ilike('no_faktur', noKontrak)
        .limit(1);
      if (outletFilter) q = q.eq('outlet', outletFilter);
      const { data: rows } = await q;
      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        gadaiTipe = 'GADAI';
        const taksiran = Number(r.taksiran ?? 0);
        const jmlGadai = Number(r.jumlah_gadai ?? 0);
        const ujrahSheet = Number(r.ujrah_nominal ?? 0);
        const kat = String(r.kategori ?? '').toUpperCase();
        const emasFlag = ['EMAS', 'EMAS PAUN'].includes(kat);

        // Hitung ujrah berjalan real-time (cermin tebus/page.tsx)
        const tgl1 = new Date(r.tgl_gadai);
        const now = new Date();
        const hariAktual = Math.max(1, Math.floor((now.getTime() - tgl1.getTime()) / 86400000));
        let ujrahBerjalan = 0;
        let hariDihitung = 0;

        if (ujrahSheet > 0) {
          if (emasFlag) {
            hariDihitung = hariAktual;
            ujrahBerjalan = Math.ceil((ujrahSheet / 30) * hariAktual / 1000) * 1000;
          } else {
            hariDihitung = Math.ceil(hariAktual / 5) * 5;
            const per5 = Math.round(ujrahSheet / 6);
            ujrahBerjalan = Math.ceil(per5 * (hariDihitung / 5) / 1000) * 1000;
          }
        } else {
          if (emasFlag) {
            hariDihitung = hariAktual;
            ujrahBerjalan = Math.round((2.8 / 100 / 30) * taksiran * hariAktual);
          } else {
            const persen = jmlGadai <= 3000000 ? 8 : 7;
            hariDihitung = Math.ceil(hariAktual / 5) * 5;
            ujrahBerjalan = Math.round((persen / 100 / 30) * 5 * taksiran * (hariDihitung / 5));
          }
        }

        const totalTebusSistem = Math.ceil((jmlGadai + ujrahBerjalan) / 1000) * 1000;

        gadaiData = {
          tipe: 'GADAI',
          noFaktur: r.no_faktur,
          tglGadai: r.tgl_gadai,
          tglJT: r.tgl_jt,
          nama: r.nama,
          noKtp: r.no_ktp,
          telp: r.telp1,
          kategori: r.kategori,
          barang: r.barang,
          kelengkapan: r.kelengkapan,
          grade: r.grade,
          taksiran,
          jumlahGadai: jmlGadai,
          ujrahPersen: Number(r.ujrah_persen ?? 0),
          ujrahNominal: ujrahSheet,
          // Real-time calculation
          hariAktual,
          hariDihitung,
          ujrahBerjalan,
          totalTebusSistem,
          payment: r.payment,
          kasir: r.kasir,
          outlet: r.outlet,
          status: r.status,
          warning: r.warning ?? '',
          rak: r.rak ?? '',
        };
      }
    }

    // ── 2. If not in tb_gadai, search in tb_sjb ──────────────
    if (!gadaiData) {
      let q = db.from('tb_sjb')
        .select('*')
        .ilike('no_faktur', noKontrak)
        .limit(1);
      if (outletFilter) q = q.eq('outlet', outletFilter);
      const { data: rows } = await q;
      if (rows && rows.length > 0) {
        const r = rows[0] as any;
        gadaiTipe = 'SJB';
        gadaiData = {
          tipe: 'SJB',
          noFaktur: r.no_faktur,
          tglGadai: r.tgl_gadai,
          tglJT: r.tgl_jt,
          nama: r.nama,
          noKtp: r.no_ktp,
          telp: r.telp1,
          kategori: r.kategori,
          barang: r.barang,
          kelengkapan: r.kelengkapan ?? '',
          grade: r.grade ?? '',
          taksiran: Number(r.taksiran ?? 0),
          jumlahGadai: Number(r.harga_jual ?? 0),
          // SJB specific fields
          lamaTitip: Number(r.lama_titip ?? 0),
          hargaBuyback: Number(r.harga_buyback ?? 0),
          ujrahPersen: 0,
          ujrahNominal: 0,
          payment: r.payment,
          kasir: r.kasir,
          outlet: r.outlet,
          status: r.status,
          warning: r.warning ?? '',
          rak: r.rak ?? '',
        };
      }
    }

    if (!gadaiData) {
      return NextResponse.json({ ok: false, msg: `No kontrak "${noKontrak}" tidak ditemukan.` });
    }

    // ── 3. Riwayat Tebus / Perpanjang / Tambah / Kurang ──────
    const events: any[] = [];

    // tb_tebus
    {
      let q = db.from('tb_tebus')
        .select('*')
        .ilike('no_faktur', noKontrak)
        .order('tgl', { ascending: true });
      if (outletFilter) q = q.eq('outlet', outletFilter);
      const { data: tebusRows } = await q;
      if (tebusRows) {
        for (const r of tebusRows) {
          const row = r as any;
          events.push({
            idTebus: row.id_tebus ?? row.id,
            tgl: row.tgl,
            status: String(row.status ?? ''),
            jenis: 'TEBUS',
            nama: row.nama ?? '',
            kategori: row.kategori ?? '',
            barang: row.barang ?? '',
            jumlahGadai: Number(row.jumlah_gadai ?? 0),
            jumlahBaru: Number(row.jumlah_gadai_baru ?? 0),
            hariAktual: Number(row.hari_aktual ?? 0),
            ujrah: Number(row.ujrah_berjalan ?? 0),
            totalSistem: Number(row.total_tebus_sistem ?? 0),
            jumlahBayar: Number(row.jumlah_bayar ?? 0),
            selisih: Number(row.selisih ?? 0),
            payment: row.payment ?? '',
            kasir: row.kasir ?? '',
          });
        }
      }
    }

    // tb_buyback
    {
      let q = db.from('tb_buyback')
        .select('*')
        .ilike('no_faktur', noKontrak)
        .order('tgl', { ascending: true });
      if (outletFilter) q = q.eq('outlet', outletFilter);
      const { data: bbRows } = await q;
      if (bbRows) {
        for (const r of bbRows) {
          const row = r as any;
          events.push({
            idTebus: row.id_buyback ?? row.id,
            tgl: row.tgl,
            status: 'BUYBACK',
            jenis: 'BUYBACK',
            nama: row.nama ?? '',
            kategori: row.kategori ?? '',
            barang: row.barang ?? '',
            jumlahGadai: Number(row.harga_jual ?? 0),
            jumlahBaru: Number(row.harga_jual_baru ?? 0),
            hariAktual: Number(row.hari_aktual ?? 0),
            ujrah: 0,
            totalSistem: Number(row.harga_jual ?? 0),
            jumlahBayar: Number(row.jumlah_bayar ?? 0),
            selisih: Number(row.selisih ?? 0),
            payment: row.payment ?? '',
            kasir: row.kasir ?? '',
          });
        }
      }
    }

    // Sort events by tgl ascending
    events.sort((a, b) => (a.tgl < b.tgl ? -1 : 1));

    // ── 4. Gudang Sita status ────────────────────────────────
    let sitaData: any = null;
    {
      let q = db.from('tb_gudang_sita')
        .select('*')
        .ilike('no_faktur', noKontrak)
        .limit(1);
      if (outletFilter) q = q.eq('outlet', outletFilter);
      const { data: sitaRows } = await q;
      if (sitaRows && sitaRows.length > 0) {
        const row = sitaRows[0] as any;
        sitaData = {
          tglSita: row.tgl_sita ?? '',
          status: row.status ?? '',
          taksiran: Number(row.taksiran ?? 0),
        };
      }
    }

    return NextResponse.json({
      ok: true,
      gadai: gadaiData,
      events,
      sita: sitaData,
    });

  } catch (err) {
    console.error('[riwayat POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
