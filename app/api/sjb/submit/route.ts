// ============================================================
// ACEH GADAI SYARIAH - Submit SJB (Jual Titip) API Route
// File: app/api/sjb/submit/route.ts
//
// Cermin submitSJB() di GAS Code.gs.
// Alur identik gadai — perbedaan utama:
//   - lamaTitip (hari) menggantikan ujrah_persen
//   - harga_buyback menggantikan ujrah_nominal
//   - biaya_admin = 0
//   - noFaktur format SJB-[outlet]-NNNN
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateKas } from '@/lib/db/kas';
import { safeGetNextId, safeGetNextBarcodeA } from '@/lib/db/counter';

interface SubmitSJBBody {
  pin:          string;
  nama:         string;
  noKtp?:       string;
  alamatNasabah?: string;
  telp1?:       string;
  telp2?:       string;
  kategori:     string;
  barang:       string;
  kelengkapan?: string;
  grade?:       string;
  imeiSn?:      string;
  hargaJual:    number;
  hargaBuyback?: number;
  lamaTitip?:   number;    // default 30 hari
  payment:      'CASH' | 'BANK' | 'SPLIT';
  cash?:        number;
  bank?:        number;
}

export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body: SubmitSJBBody = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // ── 1. Validasi PIN ───────────────────────────────────────
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: body.pin.trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) {
      return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    }
    const kasir = pinResult.nama as string;

    // ── 2. Validasi body ──────────────────────────────────────
    if (!body.nama?.trim() || !body.kategori || !body.barang || !body.hargaJual) {
      return NextResponse.json({ ok: false, msg: 'Field nama, kategori, barang, hargaJual wajib diisi.' });
    }

    // ── 3. Ambil outlet ───────────────────────────────────────
    const { data: outlet } = await db.from('outlets').select('*').eq('id', outletId).single();
    if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName: string = outlet.nama;

    // ── 4. Kalkulasi ──────────────────────────────────────────
    const lamaTitip   = parseInt(String(body.lamaTitip ?? 30)) || 30;
    const hargaJual   = Number(body.hargaJual);
    const hargaBuyback = Number(body.hargaBuyback) || Math.round(hargaJual * 1.1);

    const now     = new Date();
    const tglJT   = new Date(now); tglJT.setDate(tglJT.getDate() + lamaTitip);
    const tglSita = new Date(now); tglSita.setDate(tglSita.getDate() + lamaTitip + 30);

    // ── 5. Generate ID ────────────────────────────────────────
    const [noSJB, barcodeA] = await Promise.all([
      safeGetNextId(db, 'SJB', outletId),
      safeGetNextBarcodeA(db, outletId),
    ]);

    // idSJB: SJB-[outletId]-[yyyyMMdd]-[random4]
    const stamp = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).replace(/-/g, '');
    const rand4 = String(Math.floor(1000 + Math.random() * 9000));
    const idSJB = `SJB-${outletId}-${stamp}-${rand4}`;

    // Barcode B = J + YYMMDD + NNN (format mirip gadai yang pakai G + YYMMDD + NNN)
    const barcodeB = 'J' + stamp.substring(2) + rand4;

    // ── 6. Cari rak ───────────────────────────────────────────
    const { data: rak } = await db.rpc('get_assigned_rak', {
      p_kategori: body.kategori, p_outlet_id: outletId, p_tipe: 'SJB',
    });
    const assignedRak = (rak as string) ?? '';

    // ── 7. Insert tb_sjb ──────────────────────────────────────
    // Kolom taksiran = hargaJual (backward compat laporan)
    const { error: insertErr } = await db.from('tb_sjb').insert({
      id:            idSJB,
      no_faktur:     noSJB,
      tgl_gadai:     now.toISOString(),
      tgl_jt:        tglJT.toISOString(),
      tgl_sita:      tglSita.toISOString(),
      nama:          body.nama.trim(),
      no_ktp:        body.noKtp ?? '',
      telp1:         body.telp1 ?? '',
      telp2:         body.telp2 ?? '',
      kategori:      body.kategori,
      barang:        body.barang,
      kelengkapan:   body.kelengkapan ?? '',
      grade:         body.grade ?? '',
      imei_sn:       body.imeiSn ?? '',
      taksiran:      hargaJual,       // = harga_jual (backward compat)
      harga_jual:    hargaJual,
      biaya_admin:   0,               // SJB tidak pakai biaya admin
      lama_titip:    lamaTitip,       // repurpose ujrah_persen
      harga_buyback: hargaBuyback,    // repurpose ujrah_nominal
      barcode_a:     barcodeA,
      barcode_b:     barcodeB,
      rak:           assignedRak,
      status:        'AKTIF',
      payment:       body.payment,
      cash:          Number(body.cash ?? 0),
      bank:          Number(body.bank ?? 0),
      kasir,
      outlet:        outletName,
      outlet_id:     outletId,
      updated_by:    kasir,
      warning:       'BERJALAN',
    });

    if (insertErr) {
      return NextResponse.json({ ok: false, msg: 'Gagal simpan SJB: ' + insertErr.message });
    }

    // ── 8. Kas (alur sama persis GADAI — keluar uang ke konsumen) ─
    await generateKas(db, outletId, {
      noFaktur:       noSJB,
      jenisTransaksi: 'SJB',
      payment:        body.payment,
      cash:           Number(body.cash ?? 0),
      bank:           Number(body.bank ?? 0),
      jumlahGadai:    hargaJual,
      user:           kasir,
      outlet:         outletName,
    });

    // ── 9. Audit log ──────────────────────────────────────────
    await db.from('audit_log').insert({
      user_nama: kasir, tabel: 'tb_sjb', record_id: idSJB,
      aksi: 'INSERT', field: 'ALL',
      nilai_baru: JSON.stringify({ noSJB, nama: body.nama, barang: body.barang }),
      outlet: outletName,
    });

    // ── 10. Response untuk cetak ──────────────────────────────
    const f = (d: Date) => d.toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta',
    });

    return NextResponse.json({
      ok: true,
      noSJB, idSJB, barcodeA, barcodeB,
      kasir,
      tglJual:  f(now),
      tglJT:    f(tglJT),
      tglSita:  f(tglSita),
      outlet:   outletName,
      alamat:   outlet.alamat ?? '',
      kota:     outlet.kota ?? '',
      telpon:   outlet.telepon ?? outlet.telpon ?? '',
      namaPerusahaan:    outlet.nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH',
      waktuOperasional:  outlet.waktu_operasional ?? '',
      statusKepalaGudang: outlet.status_kepala_gudang ?? '',
      nama:      body.nama,
      noKtp:     body.noKtp ?? '',
      alamatNasabah: body.alamatNasabah ?? '',
      kategori:  body.kategori,
      barang:    body.barang,
      grade:     body.grade ?? '',
      kelengkapan: body.kelengkapan ?? '',
      imeiSn:    body.imeiSn ?? '',
      hargaJual, hargaBuyback, lamaTitip,
      locationGudang: assignedRak,
    });

  } catch (err) {
    console.error('[sjb/submit]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
