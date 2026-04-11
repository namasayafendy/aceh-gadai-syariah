// ============================================================
// ACEH GADAI SYARIAH - Kas API Routes
// File: app/api/kas/route.ts
//
// Handles:
//   POST /api/kas          → addKasManual (cermin addKasManual GAS)
//   GET  /api/kas          → getKasEntries (cermin getKasEntries GAS)
//   POST /api/kas/saldo-awal → setSaldoAwal (cermin setSaldoAwal GAS)
//
// ALUR KAS TIDAK DIUBAH — custom sesuai pembukuan perusahaan.
// Running balance dihitung dinamis saat query, tidak di-cache.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

// ════════════════════════════════════════════════════════════
// POST /api/kas — Tambah entri kas manual
// Cermin addKasManual() di GAS
// ════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body     = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // Validasi PIN
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) {
      return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    }
    const kasir = pinResult.nama as string;

    // Validasi field wajib
    if (!['MASUK','KELUAR'].includes(body.tipe)) {
      return NextResponse.json({ ok: false, msg: "Tipe harus 'MASUK' atau 'KELUAR'." });
    }
    if (!['CASH','BANK'].includes(body.tipeKas)) {
      return NextResponse.json({ ok: false, msg: "Tipe kas harus 'CASH' atau 'BANK'." });
    }
    if (!body.jumlah || Number(body.jumlah) <= 0) {
      return NextResponse.json({ ok: false, msg: 'Jumlah harus lebih dari 0.' });
    }

    // Ambil outlet name
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = (outlet?.nama as string) ?? '';

    // Generate ID Kas
    const { data: kasId } = await db.rpc('get_next_id', {
      p_tipe: 'KAS', p_outlet_id: outletId,
    });

    const tgl = body.tgl ? new Date(body.tgl).toISOString() : new Date().toISOString();

    const { error } = await db.from('tb_kas').insert({
      id:          kasId as string,
      tgl,
      no_ref:      body.noRef || '-',
      keterangan:  body.keterangan || '',
      tipe:        body.tipe,
      tipe_kas:    body.tipeKas,
      jumlah:      Number(body.jumlah),
      jenis:       'MANUAL',
      sumber:      'MANUAL',
      kasir,
      outlet:      outletName,
    });

    if (error) {
      return NextResponse.json({ ok: false, msg: 'Gagal simpan kas: ' + error.message });
    }

    // Audit log
    await db.from('audit_log').insert({
      user_nama: kasir, tabel: 'tb_kas', record_id: kasId as string,
      aksi: 'INSERT', field: 'MANUAL',
      nilai_baru: JSON.stringify({ tipe: body.tipe, tipeKas: body.tipeKas, jumlah: body.jumlah }),
      outlet: outletName,
    });

    return NextResponse.json({ ok: true, id: kasId, kasir });

  } catch (err) {
    console.error('[kas POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

// ════════════════════════════════════════════════════════════
// GET /api/kas?tglFrom=yyyy-MM-dd&tglTo=yyyy-MM-dd&filter=CASH|BANK
// Cermin getKasEntries() di GAS — running balance per baris.
// Entri BATAL tidak dihapus dari running balance (sudah ter-
// reverse via entri kebalikan), sesuai alur kas yg sudah ada.
// ════════════════════════════════════════════════════════════
export async function GET(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    const tglFrom = searchParams.get('tglFrom') ?? null;  // yyyy-MM-dd
    const tglTo   = searchParams.get('tglTo')   ?? null;
    const filter  = searchParams.get('filter')  ?? null;  // CASH | BANK | null

    // Ambil outlet name untuk filter
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = (outlet?.nama as string) ?? '';

    // Query semua kas entri outlet ini, urutkan dari awal (untuk running balance)
    let query = db.from('tb_kas')
      .select('*')
      .eq('outlet', outletName)
      .order('tgl', { ascending: true })
      .order('id',  { ascending: true });

    const { data: rows, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, msg: 'Query error: ' + error.message }, { status: 500 });
    }

    // Hitung running balance sambil apply filter tanggal
    let runCash = 0, runBank = 0;
    let totalMasuk = 0, totalKeluar = 0;
    const result: object[] = [];

    for (const r of (rows ?? [])) {
      const tipe    = String(r.tipe    ?? '');
      const tipeKas = String(r.tipe_kas ?? '');
      const jumlah  = Number(r.jumlah  ?? 0);
      const isBatal = String(r.sumber ?? '').toUpperCase() === 'BATAL';

      // Running balance menggunakan SEMUA entri outlet (termasuk di luar range filter)
      // Entri BATAL tetap dihitung karena sudah ada entri kebalikannya
      const sign = tipe === 'MASUK' ? 1 : -1;
      if (tipeKas === 'CASH') runCash += sign * jumlah;
      else if (tipeKas === 'BANK') runBank += sign * jumlah;

      // Apply filter tanggal (pakai string untuk menghindari timezone bug)
      const tglStr = r.tgl ? String(r.tgl).substring(0, 10) : '';
      if (tglFrom && tglStr < tglFrom) continue;
      if (tglTo   && tglStr > tglTo)   continue;

      // Apply filter tipe kas
      if (filter === 'CASH' && tipeKas !== 'CASH') continue;
      if (filter === 'BANK' && tipeKas !== 'BANK') continue;

      // Skip entri BATAL dari total masuk/keluar periode
      // (tidak di-skip dari running agar saldo tetap akurat)
      if (!isBatal) {
        if (tipe === 'MASUK') totalMasuk += jumlah;
        else totalKeluar += jumlah;
      }

      result.push({
        id:       r.id,
        tgl:      r.tgl,
        noRef:    r.no_ref,
        ket:      r.keterangan,
        tipe,
        tipeKas,
        jumlah,
        jenis:    r.jenis    ?? '',
        metode:   r.sumber   ?? '',
        kasir:    r.kasir    ?? '',
        outlet:   r.outlet   ?? '',
        saldoCash: Math.round(runCash),
        saldoBank: Math.round(runBank),
      });
    }

    return NextResponse.json({
      ok: true,
      rows: result,
      totalMasuk:  Math.round(totalMasuk),
      totalKeluar: Math.round(totalKeluar),
      saldo: { cash: Math.round(runCash), bank: Math.round(runBank) },
    });

  } catch (err) {
    console.error('[kas GET]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
