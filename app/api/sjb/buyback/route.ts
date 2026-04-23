// ============================================================
// ACEH GADAI SYARIAH - Submit SJB Buyback / Perpanjang API
// File: app/api/sjb/buyback/route.ts
//
// Cermin submitBuyback() di GAS Code.gs.
// SJB buyback/perpanjang/sita simpan ke tb_buyback (BUKAN tb_tebus)
// Status: BUYBACK, PERPANJANG, SITA
// Alur kas tidak diubah — lihat lib/db/kas.ts
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateKas } from '@/lib/db/kas';
import { safeGetNextId } from '@/lib/db/counter';
import type { TipeTransaksi, PaymentMethod } from '@/lib/db/kas';

interface SubmitBuybackBody {
  pin:              string;
  idSJB:            string;
  noSJB:            string;
  nama:             string;
  kategori:         string;
  barang:           string;
  taksiran:         number;
  hargaJual:        number;
  hargaJualBaru?:   number;   // untuk TAMBAH / KURANG
  hariAktual:       number;
  ujrahBerjalan:    number;
  totalSistem:      number;
  jumlahBayar:      number;
  status:           'BUYBACK' | 'PERPANJANG' | 'SITA' | 'TAMBAH' | 'KURANG';
  alasan?:          string;
  payment:          PaymentMethod;
  cash?:            number;
  bank?:            number;
  barcodeA?:        string;
  tanpaSurat?:      boolean;
  // Fase 3: kalau diskon ≥ Rp 10.000, frontend wajib request approval dulu
  // via /api/diskon/request, lalu kirim id_diskon yg sudah APPROVED ke sini.
  idDiskonApproved?: string;
}

// Threshold diskon yang butuh approval Telegram (selaras Fase 3).
// Nilai ini SENGAJA disamakan dengan /api/diskon/request supaya validasi
// server-side konsisten: client tidak bisa bypass approval.
const DISKON_APPROVAL_THRESHOLD = 10000;

export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body: SubmitBuybackBody = await request.json();
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
    const selisih = Number(body.totalSistem) - Number(body.jumlahBayar);
    if (selisih > 0) {
      if (!body.alasan || body.alasan.trim().replace(/\s+/g, '').length < 2) {
        return NextResponse.json({
          ok: false,
          msg: `Ada selisih Rp ${selisih.toLocaleString('id-ID')}. Catatan wajib diisi.`,
        });
      }
    }
    // Tanpa surat wajib catatan
    if (body.tanpaSurat === true) {
      if (!body.alasan || body.alasan.trim().replace(/\s+/g, '').length < 2) {
        return NextResponse.json({ ok: false, msg: 'Transaksi TANPA SURAT: Catatan wajib diisi.' });
      }
    }

    // ── 3. Ambil outlet ───────────────────────────────────────
    const { data: outlet } = await db.from('outlets').select('*').eq('id', outletId).single();
    if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName: string = outlet.nama;

    // ── 4. Generate ID Buyback ────────────────────────────────
    // Format: BB-[outletId]-[yyyyMMdd]-[random4]
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const dateStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`;
    const rand4 = String(Math.floor(Math.random() * 9000) + 1000);
    const idBB = `BB-${outletId}-${dateStr}-${rand4}`;

    // ── 5. Simpan diskon jika ada (selisih > Rp 9.000) ───────
    // - Selisih 9.001 – 9.999 : old path, insert langsung (tidak butuh approval).
    // - Selisih ≥ 10.000      : Fase 3 path, WAJIB idDiskonApproved yg sudah
    //                           di-approve Owner via Telegram. Row tb_diskon
    //                           sudah ada (status=APPROVED) → cukup finalize.
    // SITA tidak masuk alur diskon approval (konsisten dgn tebus: SITA/JUAL dikecualikan).
    const adaDiskon = selisih > 9000;
    const needApproval = body.status !== 'SITA' && selisih >= DISKON_APPROVAL_THRESHOLD;
    let idDiskon = '';

    if (needApproval) {
      if (!body.idDiskonApproved) {
        return NextResponse.json({
          ok: false,
          msg: `Diskon Rp ${selisih.toLocaleString('id-ID')} ≥ Rp 10.000 wajib approval Owner via Telegram. Submit request diskon dulu.`,
        });
      }
      const { data: dskRow } = await db.from('tb_diskon')
        .select('id_diskon, status, outlet_id, finalized_at, besaran_potongan')
        .eq('id_diskon', body.idDiskonApproved)
        .maybeSingle();

      if (!dskRow) {
        return NextResponse.json({ ok: false, msg: `Diskon ${body.idDiskonApproved} tidak ditemukan.` });
      }
      const dsk = dskRow as any;
      if (dsk.status !== 'APPROVED') {
        return NextResponse.json({ ok: false, msg: `Diskon belum APPROVED (status: ${dsk.status}).` });
      }
      if (Number(dsk.outlet_id ?? 0) !== outletId) {
        return NextResponse.json({ ok: false, msg: 'Outlet diskon tidak cocok dengan outlet sekarang.' });
      }
      if (dsk.finalized_at) {
        return NextResponse.json({ ok: false, msg: 'Diskon ini sudah pernah di-finalize sebelumnya.' });
      }
      // Safety: pastikan nominal tidak dimanipulasi client-side
      if (Math.abs(Number(dsk.besaran_potongan ?? 0) - selisih) > 1) {
        return NextResponse.json({
          ok: false,
          msg: `Nominal diskon tidak cocok dengan yang di-approve (approved: Rp ${Number(dsk.besaran_potongan).toLocaleString('id-ID')}, submit: Rp ${selisih.toLocaleString('id-ID')}).`,
        });
      }
      idDiskon = body.idDiskonApproved;
      // Update row dilakukan di section finalize setelah tb_buyback berhasil insert.
    } else if (adaDiskon) {
      // Old path (selisih 9.001 – 9.999): insert langsung tanpa approval.
      idDiskon = await safeGetNextId(db, 'DISKON', outletId);

      await db.from('tb_diskon').insert({
        id_diskon:            idDiskon,
        no_faktur:            body.noSJB,
        id_tebus:             idBB,
        nama_nasabah:         body.nama,
        jumlah_pinjaman:      Number(body.hargaJual),
        ujrah_berjalan:       Number(body.ujrahBerjalan),
        lama_titip:           Number(body.hariAktual),
        total_seharusnya:     Number(body.totalSistem),
        besaran_potongan:     selisih,
        total_setelah_diskon: Number(body.jumlahBayar),
        alasan:               body.alasan ?? '',
        status_tebus:         body.status,
        kasir,
        outlet: outletName,
        // status default 'DONE' via migration 010 — legacy-friendly.
      });
    }

    // ── 6. Tanpa surat ────────────────────────────────────────
    const tanpaSurat = body.tanpaSurat === true;
    let idKehilangan = '';
    if (tanpaSurat) {
      idKehilangan = await safeGetNextId(db, 'KEHILANGAN', outletId);
    }

    // ── 7. Insert tb_buyback ─────────────────────────────────
    // Struktur kolom mirror tb_tebus tapi untuk SJB
    const bbRow = {
      id:               idBB,
      tgl:              now.toISOString(),
      id_sjb:           body.idSJB,
      no_faktur:        body.noSJB,
      nama:             body.nama,
      kategori:         body.kategori,
      barang:           body.barang,
      taksiran:         Number(body.taksiran),
      harga_jual:       Number(body.hargaJual),
      harga_jual_baru:  Number(body.hargaJualBaru ?? 0),
      hari_aktual:      Number(body.hariAktual),
      ujrah_berjalan:   Number(body.ujrahBerjalan),
      total_sistem:     Number(body.totalSistem),
      jumlah_bayar:     Number(body.jumlahBayar),
      selisih:          selisih > 0 ? selisih : 0,
      id_diskon:        idDiskon,
      status:           body.status,
      alasan:           body.alasan ?? '',
      payment:          body.payment,
      cash:             Number(body.cash ?? 0),
      bank:             Number(body.bank ?? 0),
      barcode_a:        body.barcodeA ?? '',
      kasir,
      outlet:           outletName,
      tanpa_surat:      tanpaSurat ? `TANPA_SURAT|${idKehilangan}` : '',
      updated_by:       kasir,
    };

    const { error: bbErr } = await db.from('tb_buyback').insert(bbRow);
    if (bbErr) {
      return NextResponse.json({ ok: false, msg: 'Gagal simpan buyback: ' + bbErr.message });
    }

    // ── 7b. Finalize diskon Fase 3 (kalau path needApproval) ─
    // Row tb_diskon sudah ada (APPROVED). Update: id_tebus=idBB, status=DONE,
    // finalized_at, sinkron kolom legacy `approved='Y'`.
    if (needApproval && idDiskon) {
      await db.from('tb_diskon').update({
        id_tebus:     idBB,
        status:       'DONE',
        finalized_at: new Date().toISOString(),
        approved:     'Y',
      }).eq('id_diskon', idDiskon);
    }

    // ── 8. Update status di tb_sjb ────────────────────────────
    await db.from('tb_sjb')
      .update({ status: body.status, tgl_bb: now.toISOString(), updated_by: kasir })
      .eq('id', body.idSJB);

    // ── 9. Update tanggal / jumlah untuk reset ────────────────
    let tglJualBaru = '', tglJTBaru = '', tglSitaBaru = '';

    if (body.status === 'PERPANJANG') {
      const tglJTNew   = new Date(now); tglJTNew.setDate(tglJTNew.getDate() + 30);
      const tglSitaNew = new Date(now); tglSitaNew.setDate(tglSitaNew.getDate() + 60);
      // Persis seperti GAS _updateSJBTanggal: RESET status ke AKTIF
      await db.from('tb_sjb').update({
        status:    'AKTIF',              // ← reset ke AKTIF (sesuai GAS)
        tgl_gadai: now.toISOString(),
        tgl_jt:    tglJTNew.toISOString(),
        tgl_sita:  tglSitaNew.toISOString(),
        updated_by: kasir,
      }).eq('id', body.idSJB);
      tglJualBaru = fmt(now);
      tglJTBaru   = fmt(tglJTNew);
      tglSitaBaru = fmt(tglSitaNew);
    }

    if (body.status === 'TAMBAH' || body.status === 'KURANG') {
      const tglJTNew   = new Date(now); tglJTNew.setDate(tglJTNew.getDate() + 30);
      const tglSitaNew = new Date(now); tglSitaNew.setDate(tglSitaNew.getDate() + 60);
      await db.from('tb_sjb').update({
        harga_jual: Number(body.hargaJualBaru ?? body.hargaJual),
        tgl_gadai:  now.toISOString(),
        tgl_jt:     tglJTNew.toISOString(),
        tgl_sita:   tglSitaNew.toISOString(),
        updated_by: kasir,
      }).eq('id', body.idSJB);
      tglJualBaru = fmt(now);
      tglJTBaru   = fmt(tglJTNew);
      tglSitaBaru = fmt(tglSitaNew);
    }

    // ── 10. Kas entries ───────────────────────────────────────
    // Map status ke jenisTransaksi (BUYBACK → TEBUS di kas)
    const kasJenis: TipeTransaksi = body.status === 'BUYBACK' ? 'TEBUS'
      : body.status as TipeTransaksi;

    await generateKas(db, outletId, {
      noFaktur:       body.noSJB,
      noRef:          idBB,
      jenisTransaksi: kasJenis,
      payment:        body.payment,
      cash:           Number(body.cash ?? 0),
      bank:           Number(body.bank ?? 0),
      jumlahGadai:    Number(body.hargaJual),
      jumlahGadaiBaru: Number(body.hargaJualBaru ?? 0),
      ujrahBerjalan:  Number(body.ujrahBerjalan),
      taksiran:       Number(body.taksiran),
      taksiranJual:   Number(body.taksiran),
      taksiranSita:   Number(body.taksiran),
      jumlahBayar:    Number(body.jumlahBayar),
      user:           kasir,
      outlet:         outletName,
    });

    // ── 11. Audit log ─────────────────────────────────────────
    await db.from('audit_log').insert({
      user_nama:  kasir,
      tabel:      'tb_buyback',
      record_id:  idBB,
      aksi:       'INSERT',
      field:      'ALL',
      nilai_baru: JSON.stringify({ noSJB: body.noSJB, status: body.status }),
      outlet:     outletName,
    });

    // ── 12. Response ──────────────────────────────────────────
    const tglFmt = now.toLocaleDateString('id-ID', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
    });

    return NextResponse.json({
      ok: true,
      idBB, idDiskon, adaDiskon, tanpaSurat, idKehilangan,
      kasir,
      tglBB: tglFmt,
      tglJualBaru: tglJualBaru, tglJTBaru, tglSitaBaru,
      outlet:   outletName,
      alamat:   outlet.alamat ?? '',
      kota:     outlet.kota ?? '',
      telpon:   outlet.telepon ?? outlet.telpon ?? '',
      namaPerusahaan:   outlet.nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH',
      waktuOperasional: outlet.waktu_operasional ?? '',
      statusKepalaGudang: outlet.status_kepala_gudang ?? '',
      noSJB: body.noSJB, status: body.status,
      namaNasabah: body.nama, kategori: body.kategori, barang: body.barang,
      cetakKontrak: ['PERPANJANG', 'TAMBAH', 'KURANG'].includes(body.status),
    });

  } catch (err) {
    console.error('[sjb/buyback]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

function fmt(d: Date): string {
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Jakarta'
  });
}
