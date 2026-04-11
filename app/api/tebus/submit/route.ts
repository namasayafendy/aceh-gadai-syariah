// ============================================================
// ACEH GADAI SYARIAH - Submit Tebus API Route
// File: app/api/tebus/submit/route.ts
//
// Cermin submitTebus() di GAS Code.gs.
// Status yang bisa diproses: TEBUS, PERPANJANG, TAMBAH, KURANG,
//                             SITA, JUAL, BATAL
// Alur kas tidak diubah — lihat lib/db/kas.ts
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateKas } from '@/lib/db/kas';
import type { TipeTransaksi, PaymentMethod } from '@/lib/db/kas';

interface SubmitTebusBody {
  pin:               string;
  idGadai:           string;
  noFaktur:          string;
  namaNasabah:       string;
  kategori:          string;
  barang:            string;
  taksiran:          number;
  jumlahGadai:       number;
  jumlahGadaiBaru?:  number;   // untuk TAMBAH / KURANG
  hariAktual:        number;
  ujrahBerjalan:     number;
  totalTebusSistem:  number;
  jumlahBayar:       number;
  status:            'TEBUS' | 'PERPANJANG' | 'TAMBAH' | 'KURANG' | 'SITA' | 'JUAL' | 'BATAL';
  alasan?:           string;
  payment:           PaymentMethod;
  cash?:             number;
  bank?:             number;
  barcodeA?:         string;
  taksiranJual?:     number;
  taksiranSita?:     number;
  tanpaSurat?:       boolean;
}

export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body: SubmitTebusBody = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // ── 1. Validasi PIN ───────────────────────────────────────
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: body.pin.trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) {
      return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    }
    const kasir = pinResult.nama as string;

    // ── 2. Validasi diskon wajib alasan ───────────────────────
    const selisih = Number(body.totalTebusSistem) - Number(body.jumlahBayar);
    if (selisih > 0) {
      if (!body.alasan || body.alasan.trim().replace(/\s+/g, '').length < 2) {
        return NextResponse.json({
          ok: false,
          msg: `Ada selisih Rp ${selisih.toLocaleString('id-ID')} dari total sistem. Catatan/Alasan wajib diisi.`,
        });
      }
    }

    // ── 3. Ambil outlet ───────────────────────────────────────
    const { data: outlet } = await db.from('outlets').select('*').eq('id', outletId).single();
    if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName: string = outlet.nama;

    // ── 4. Generate ID Tebus ──────────────────────────────────
    const { data: idTebus } = await db.rpc('get_next_id', {
      p_tipe: 'TEBUS', p_outlet_id: outletId,
    });

    const now = new Date();

    // ── 5. Simpan diskon jika ada (selisih > Rp 9.000) ───────
    let idDiskon = '';
    const adaDiskon = selisih > 9000;
    if (adaDiskon) {
      const { data: idDsk } = await db.rpc('get_next_id', {
        p_tipe: 'DISKON', p_outlet_id: outletId,
      });
      idDiskon = idDsk as string;

      await db.from('tb_diskon').insert({
        id_diskon:            idDiskon,
        no_faktur:            body.noFaktur,
        id_tebus:             idTebus as string,
        nama_nasabah:         body.namaNasabah,
        jumlah_pinjaman:      Number(body.jumlahGadai),
        ujrah_berjalan:       Number(body.ujrahBerjalan),
        lama_titip:           Number(body.hariAktual),
        total_seharusnya:     Number(body.totalTebusSistem),
        besaran_potongan:     selisih,
        total_setelah_diskon: Number(body.jumlahBayar),
        alasan:               body.alasan ?? '',
        status_tebus:         body.status,
        kasir,
        outlet: outletName,
      });
    }

    // ── 6. Tanpa surat ────────────────────────────────────────
    const tanpaSurat = body.tanpaSurat === true;
    let idKehilangan = '';
    if (tanpaSurat) {
      const { data: idKhl } = await db.rpc('get_next_id', {
        p_tipe: 'KEHILANGAN', p_outlet_id: outletId,
      });
      idKehilangan = (idKhl as string) ?? '';
    }

    // ── 7. Insert tb_tebus ────────────────────────────────────
    const tebusRow = {
      id:                  idTebus as string,
      tgl:                 now.toISOString(),
      id_gadai:            body.idGadai,
      no_faktur:           body.noFaktur,
      nama_nasabah:        body.namaNasabah,
      kategori:            body.kategori,
      barang:              body.barang,
      taksiran:            Number(body.taksiran),
      jumlah_gadai:        Number(body.jumlahGadai),
      jumlah_gadai_baru:   Number(body.jumlahGadaiBaru ?? 0),
      hari_aktual:         Number(body.hariAktual),
      ujrah_berjalan:      Number(body.ujrahBerjalan),
      total_tebus_sistem:  Number(body.totalTebusSistem),
      jumlah_bayar:        Number(body.jumlahBayar),
      selisih,
      id_diskon:           idDiskon,
      status:              body.status,
      alasan:              body.alasan ?? '',
      payment:             body.payment,
      cash:                Number(body.cash ?? 0),
      bank:                Number(body.bank ?? 0),
      barcode_a:           body.barcodeA ?? '',
      kasir,
      outlet:              outletName,
      tanpa_surat:         tanpaSurat ? `TANPA_SURAT|${idKehilangan}` : '',
      updated_by:          kasir,
    };

    const { error: tebErr } = await db.from('tb_tebus').insert(tebusRow);
    if (tebErr) {
      return NextResponse.json({ ok: false, msg: 'Gagal simpan tebus: ' + tebErr.message });
    }

    // ── 8. Update status tb_gadai ─────────────────────────────
    await db.from('tb_gadai')
      .update({ status: body.status, tgl_tebus: now.toISOString(), updated_by: kasir })
      .eq('id', body.idGadai);

    // ── 9. Update tanggal / jumlah gadai untuk reset ──────────
    let tglGadaiBaru = '', tglJTBaru = '', tglSitaBaru = '';

    if (body.status === 'PERPANJANG') {
      const tglJTNew   = new Date(now); tglJTNew.setDate(tglJTNew.getDate() + 30);
      const tglSitaNew = new Date(now); tglSitaNew.setDate(tglSitaNew.getDate() + 60);
      await db.from('tb_gadai').update({
        tgl_gadai: now.toISOString(),
        tgl_jt:    tglJTNew.toISOString(),
        tgl_sita:  tglSitaNew.toISOString(),
        updated_by: kasir,
      }).eq('id', body.idGadai);
      tglGadaiBaru = fmt(now);
      tglJTBaru    = fmt(tglJTNew);
      tglSitaBaru  = fmt(tglSitaNew);
    }

    if (body.status === 'TAMBAH' || body.status === 'KURANG') {
      const tglJTNew   = new Date(now); tglJTNew.setDate(tglJTNew.getDate() + 30);
      const tglSitaNew = new Date(now); tglSitaNew.setDate(tglSitaNew.getDate() + 60);
      await db.from('tb_gadai').update({
        jumlah_gadai: Number(body.jumlahGadaiBaru ?? body.jumlahGadai),
        tgl_gadai:    now.toISOString(),
        tgl_jt:       tglJTNew.toISOString(),
        tgl_sita:     tglSitaNew.toISOString(),
        updated_by:   kasir,
      }).eq('id', body.idGadai);
      tglGadaiBaru = fmt(now);
      tglJTBaru    = fmt(tglJTNew);
      tglSitaBaru  = fmt(tglSitaNew);
    }

    // ── 10. Tambah ke gudang sita jika SITA / JUAL ────────────
    if (body.status === 'SITA' || body.status === 'JUAL') {
      const { data: sitaId } = await db.rpc('get_next_id', {
        p_tipe: 'SITA', p_outlet_id: outletId,
      });
      const modalTaksiran = body.status === 'SITA'
        ? Number(body.taksiranSita ?? body.taksiran)
        : Number(body.taksiranJual ?? body.taksiran);

      await db.from('tb_gudang_sita').insert({
        sita_id:       sitaId as string,
        no_faktur:     body.noFaktur,
        id_gadai:      body.idGadai,
        tgl_sita:      now.toISOString(),
        barang:        body.barang,
        kategori:      body.kategori,
        nama_nasabah:  body.namaNasabah,
        keterangan:    body.status,
        taksiran_modal: modalTaksiran,
        status_gudang: 'DI GUDANG SITA',
        outlet:        outletName,
      });
    }

    // ── 11. Generate kas ──────────────────────────────────────
    // noRef = idTebus supaya reverse per-transaksi presisi
    await generateKas(db, outletId, {
      noFaktur:       body.noFaktur,
      noRef:          idTebus as string,
      jenisTransaksi: body.status as TipeTransaksi,
      payment:        body.payment,
      cash:           Number(body.cash ?? 0),
      bank:           Number(body.bank ?? 0),
      jumlahGadai:    Number(body.jumlahGadai),
      jumlahGadaiBaru: Number(body.jumlahGadaiBaru ?? 0),
      ujrahBerjalan:  Number(body.ujrahBerjalan),
      taksiran:       Number(body.taksiran),
      taksiranJual:   Number(body.taksiranJual ?? body.taksiran),
      taksiranSita:   Number(body.taksiranSita ?? body.taksiran),
      jumlahBayar:    Number(body.jumlahBayar),
      user:           kasir,
      outlet:         outletName,
    });

    // ── 12. Audit log ─────────────────────────────────────────
    await db.from('audit_log').insert({
      user_nama:  kasir,
      tabel:      'tb_tebus',
      record_id:  idTebus as string,
      aksi:       'INSERT',
      field:      'ALL',
      nilai_baru: JSON.stringify({ noFaktur: body.noFaktur, status: body.status }),
      outlet:     outletName,
    });

    // ── 13. Response ──────────────────────────────────────────
    const tglFmt = now.toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });

    return NextResponse.json({
      ok: true,
      idTebus, idDiskon, adaDiskon, tanpaSurat, idKehilangan,
      kasir,
      tglTebus: tglFmt,
      tglGadaiBaru, tglJTBaru, tglSitaBaru,
      outlet:   outletName,
      alamat:   outlet.alamat ?? '',
      kota:     outlet.kota ?? '',
      telpon:   outlet.telpon ?? '',
      namaPerusahaan:   outlet.nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH',
      waktuOperasional: outlet.waktu_operasional ?? '',
      statusKepalaGudang: outlet.status_kepala_gudang ?? '',
    });

  } catch (err) {
    console.error('[tebus/submit]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

function fmt(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
}
