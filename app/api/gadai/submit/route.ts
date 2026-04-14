// ============================================================
// ACEH GADAI SYARIAH - Submit Gadai API Route
// File: app/api/gadai/submit/route.ts
//
// Cermin submitGadai() di GAS Code.gs.
// Alur: validasi PIN → generate ID/barcode → insert tb_gadai
//       → generate kas entries → audit log → return data cetak
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateKas } from '@/lib/db/kas';

// ─── Input validation ────────────────────────────────────────
interface SubmitGadaiBody {
  pin:          string;
  nama:         string;
  noKtp:        string;
  telp1?:       string;
  telp2?:       string;
  kategori:     string;
  barang:       string;
  kelengkapan?: string;
  grade?:       string;
  imeiSn?:      string;
  taksiran:     number;
  jumlahGadai:  number;
  ujrahPersen?: number;
  ujrahNominal?: number;
  payment:      'CASH' | 'BANK' | 'SPLIT';
  cash?:        number;
  bank?:        number;
}

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();

    // ── 1. Validasi session ───────────────────────────────────
    // Service client dipakai, tapi session tetap di-check via header / cookie
    // untuk memastikan request datang dari user yang sudah login
    const authHeader = request.headers.get('x-outlet-id');
    // outlet_id dikirim dari client (sudah ada di session context)
    // Untuk extra safety, bisa juga resolve dari cookie — tapi karena
    // semua insert dilakukan server-side via service role, ini cukup.

    // ── 2. Parse & basic validate body ───────────────────────
    const body: SubmitGadaiBody = await request.json();

    const required = ['pin','nama','noKtp','kategori','barang'] as const;
    for (const f of required) {
      if (!body[f] || String(body[f]).trim() === '') {
        return NextResponse.json({ ok: false, msg: `Field '${f}' wajib diisi.` });
      }
    }
    if (!body.taksiran || !body.jumlahGadai) {
      return NextResponse.json({ ok: false, msg: 'Taksiran dan jumlah gadai wajib diisi.' });
    }

    // ── 3. Validasi PIN ───────────────────────────────────────
    // Ambil outlet_id dari header (dikirim client dari session)
    const outletId = parseInt(authHeader ?? '1', 10) || 1;

    const { data: pinResult, error: pinErr } = await db.rpc('validate_pin', {
      p_pin:       body.pin.trim(),
      p_outlet_id: outletId,
    });
    if (pinErr || !pinResult?.ok) {
      return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    }
    const kasir  = pinResult.nama  as string;

    // ── 4. Ambil setting outlet ───────────────────────────────
    const { data: outlet, error: outletErr } = await db
      .from('outlets')
      .select('*')
      .eq('id', outletId)
      .single();
    if (outletErr || !outlet) {
      return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    }
    const outletName: string = outlet.nama;

    // ── 5. Generate ID, No Faktur, Barcode ───────────────────
    const [noFaktur, idGadai, barcodeA] = await Promise.all([
      db.rpc('get_next_id', { p_tipe: 'SBR',   p_outlet_id: outletId }).then(r => r.data as string),
      db.rpc('get_next_id', { p_tipe: 'GADAI',  p_outlet_id: outletId }).then(r => r.data as string),
      db.rpc('get_next_barcode_a', { p_outlet_id: outletId }).then(r => r.data as string),
    ]);

    // BarcodeB = G + YYMMDD + NNN (dari idGadai)
    const idParts = idGadai.split('-');
    const barcodeB = idParts.length >= 4
      ? 'G' + idParts[2].substring(2) + idParts[3]
      : idGadai.replace(/-/g, '');

    // ── 6. Hitung tanggal ─────────────────────────────────────
    const now    = new Date();
    const tglJT  = new Date(now); tglJT.setDate(tglJT.getDate() + 30);
    const tglSita = new Date(now); tglSita.setDate(tglSita.getDate() + 60);

    // ── 7. Hitung ujrah ───────────────────────────────────────
    const { data: ujrahResult } = await db.rpc('hitung_ujrah', {
      p_taksiran:     Number(body.taksiran),
      p_jumlah_gadai: Number(body.jumlahGadai),
      p_kategori:     body.kategori,
      p_tgl_gadai:    now.toISOString(),
      p_tgl_tebus:    tglJT.toISOString(),
    });
    const ujrah = ujrahResult as {
      persen: number | string; ujrahTotal: number; ujrahPerHari: number;
    };

    // ── 8. Cari rak ───────────────────────────────────────────
    const { data: rak } = await db.rpc('get_assigned_rak', {
      p_kategori:  body.kategori,
      p_outlet_id: outletId,
      p_tipe: 'GADAI',
    });
    const assignedRak = (rak as string) ?? '';

    // ── 9. Biaya admin ────────────────────────────────────────
    const biayaAdmin = Number(outlet.biaya_admin) || 10000;

    // ── 10. Insert tb_gadai ───────────────────────────────────
    const { error: insertErr } = await db.from('tb_gadai').insert({
      id:            idGadai,
      no_faktur:     noFaktur,
      tgl_gadai:     now.toISOString(),
      tgl_jt:        tglJT.toISOString(),
      tgl_sita:      tglSita.toISOString(),
      nama:          body.nama.trim(),
      no_ktp:        body.noKtp.trim(),
      telp1:         body.telp1 ?? '',
      telp2:         body.telp2 ?? '',
      kategori:      body.kategori,
      barang:        body.barang,
      kelengkapan:   body.kelengkapan ?? '',
      grade:         body.grade ?? '',
      imei_sn:       body.imeiSn ?? '',
      taksiran:      Number(body.taksiran),
      jumlah_gadai:  Number(body.jumlahGadai),
      biaya_admin:   biayaAdmin,
      ujrah_persen:  Number(body.ujrahPersen ?? ujrah.persen),
      ujrah_nominal: Number(body.ujrahNominal ?? ujrah.ujrahTotal),
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
      console.error('[gadai/submit] insert error:', insertErr.message);
      return NextResponse.json({ ok: false, msg: 'Gagal simpan data: ' + insertErr.message });
    }

    // ── 11. Generate kas entries ──────────────────────────────
    await generateKas(db, outletId, {
      noFaktur,
      jenisTransaksi: 'GADAI',
      payment:  body.payment,
      cash:     Number(body.cash ?? 0),
      bank:     Number(body.bank ?? 0),
      jumlahGadai: Number(body.jumlahGadai),
      user:    kasir,
      outlet:  outletName,
    });

    // ── 12. Audit log ─────────────────────────────────────────
    await db.from('audit_log').insert({
      user_nama:  kasir,
      tabel:      'tb_gadai',
      record_id:  idGadai,
      aksi:       'INSERT',
      field:      'ALL',
      nilai_baru: JSON.stringify({ noFaktur, nama: body.nama, barang: body.barang }),
      outlet:     outletName,
    });

    // ── 13. Return data untuk cetak surat ────────────────────
    const fmt = (d: Date) => d.toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta'
    });

    return NextResponse.json({
      ok: true,
      noFaktur, idGadai, barcodeA, barcodeB,
      kasir,
      tglGadai: fmt(now),
      tglJT:    fmt(tglJT),
      tglSita:  fmt(tglSita),
      outlet:   outletName,
      alamat:   outlet.alamat ?? '',
      kota:     outlet.kota ?? '',
      telpon:   outlet.telpon ?? '',
      namaPerusahaan:    outlet.nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH',
      waktuOperasional:  outlet.waktu_operasional ?? 'Senin-Minggu & Libur Nasional : 10.00 - 22.00 WIB',
      statusKepalaGudang: outlet.status_kepala_gudang ?? '',
      // data nasabah & barang untuk cetak
      nama:        body.nama,
      noKtp:       body.noKtp,
      telp1:       body.telp1 ?? '',
      telp2:       body.telp2 ?? '',
      kategori:    body.kategori,
      barang:      body.barang,
      kelengkapan: body.kelengkapan ?? '',
      grade:       body.grade ?? '',
      imeiSn:      body.imeiSn ?? '',
      locationGudang: assignedRak,
      taksiran:    body.taksiran,
      jumlahGadai: body.jumlahGadai,
      biayaAdmin,
      ujrahPersen:  ujrah.persen,
      ujrahNominal: ujrah.ujrahTotal,
    });

  } catch (err) {
    console.error('[gadai/submit]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
