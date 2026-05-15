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
import { safeGetNextId } from '@/lib/db/counter';
import type { TipeTransaksi, PaymentMethod } from '@/lib/db/kas';
import { queueWA } from '@/lib/wa/sender';

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
    // SITA / JUAL / BATAL: tidak ada konsep diskon/alasan (sesuai GAS)
    const statusPerluDiskon = ['TEBUS', 'PERPANJANG', 'TAMBAH', 'KURANG'].includes(body.status);
    const selisih = Number(body.totalTebusSistem) - Number(body.jumlahBayar);
    if (statusPerluDiskon && selisih > 0) {
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
    const idTebus = await safeGetNextId(db, 'TEBUS', outletId);

    const now = new Date();

    // ── 5. Simpan diskon jika ada (selisih > Rp 9.000) ───────
    // - Selisih 9.001 – 9.999 : old path, insert langsung (tidak butuh approval).
    // - Selisih ≥ 10.000      : Fase 3 path, WAJIB idDiskonApproved yg sudah
    //                           di-approve Owner via Telegram. Row tb_diskon
    //                           sudah ada (status=APPROVED) → cukup finalize.
    let idDiskon = '';
    const adaDiskon = statusPerluDiskon && selisih > 9000;
    const needApproval = statusPerluDiskon && selisih >= DISKON_APPROVAL_THRESHOLD;

    if (needApproval) {
      // Fase 3: wajib idDiskonApproved dari /api/diskon/request
      if (!body.idDiskonApproved) {
        return NextResponse.json({
          ok: false,
          msg: `Diskon Rp ${selisih.toLocaleString('id-ID')} ≥ Rp 10.000 wajib approval Owner via Telegram. Submit request diskon dulu.`,
        });
      }
      // Validasi row tb_diskon: harus APPROVED, outlet cocok, belum difinalize
      const { data: dskRow } = await db.from('tb_diskon')
        .select('id_diskon, status, outlet_id, finalized_at, besaran_potongan, total_setelah_diskon')
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
      // Update row dilakukan di section finalize setelah tb_tebus berhasil insert.
    } else if (adaDiskon) {
      // Old path (selisih 9.001 – 9.999): insert langsung tanpa approval.
      idDiskon = await safeGetNextId(db, 'DISKON', outletId);

      await db.from('tb_diskon').insert({
        id_diskon:            idDiskon,
        no_faktur:            body.noFaktur,
        id_tebus:             idTebus,
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
        // status default 'DONE' via migration 010 — legacy-friendly.
      });
    }

    // ── 6. Tanpa surat ────────────────────────────────────────
    const tanpaSurat = body.tanpaSurat === true;
    let idKehilangan = '';
    if (tanpaSurat) {
      idKehilangan = await safeGetNextId(db, 'KEHILANGAN', outletId);
    }

    // ── 7. Insert tb_tebus ────────────────────────────────────
    const tebusRow = {
      id:                  idTebus,
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

    // ── 7b. Finalize diskon Fase 3 (kalau path needApproval) ─
    // Row tb_diskon sudah ada (APPROVED). Kita update: id_tebus, status=DONE,
    // finalized_at, sinkron kolom legacy `approved='Y'`.
    if (needApproval && idDiskon) {
      await db.from('tb_diskon').update({
        id_tebus:     idTebus,
        status:       'DONE',
        finalized_at: new Date().toISOString(),
        approved:     'Y',
      }).eq('id_diskon', idDiskon);
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
      // Persis seperti GAS _updateGadaiTanggal: RESET status ke AKTIF
      await db.from('tb_gadai').update({
        status:    'AKTIF',             // ← reset ke AKTIF (sesuai GAS)
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
      // RESET status ke AKTIF — kontrak masih berjalan dgn jumlah baru.
      // Tanpa reset, gadai hilang dari Jatuh Tempo / Cek Stok (filter status=AKTIF).
      await db.from('tb_gadai').update({
        status:       'AKTIF',
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
      const sitaId = await safeGetNextId(db, 'SITA', outletId);
      const modalTaksiran = body.status === 'SITA'
        ? Number(body.taksiranSita ?? body.taksiran)
        : Number(body.taksiranJual ?? body.taksiran);

      await db.from('tb_gudang_sita').insert({
        sita_id:       sitaId,
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
      noRef:          idTebus,
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
      record_id:  idTebus,
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

    // ── 13b. Fire-and-forget WA konfirmasi (NON-BLOCKING) ─────
    // Mapping status -> template. Pakai try/catch supaya error WA tidak
    // mempengaruhi response transaksi. queueWA() sendiri tidak throw,
    // try/catch sini untuk safety extra (mis. async setup error).
    try {
      // Fetch telp dari tb_gadai (body tebus tidak include telp)
      const { data: gadaiTelp } = await db
        .from('tb_gadai')
        .select('telp1, telp2')
        .eq('id', body.idGadai)
        .maybeSingle();
      const telp1WA = (gadaiTelp as any)?.telp1 ?? '';
      const telp2WA = (gadaiTelp as any)?.telp2 ?? undefined;

      // Map status -> template_code
      const TPL_MAP: Record<string, string> = {
        TEBUS: 'TEBUS_OK',
        PERPANJANG: 'PERPANJANG_OK',
        TAMBAH: 'TAMBAH_OK',
        KURANG: 'KURANG_OK',
        SITA: 'SITA_GADAI_OK',
        JUAL: 'JUAL_OK',
      };
      const tplCode = TPL_MAP[body.status];

      // Build vars per status
      let vars: Record<string, string | number> = {
        nama: body.namaNasabah,
        no_faktur: body.noFaktur,
        barang: body.barang,
      };
      if (body.status === 'TEBUS') {
        vars = { ...vars, jumlah_bayar: Number(body.jumlahBayar), tgl_tebus: tglFmt };
      } else if (body.status === 'PERPANJANG') {
        vars = { ...vars, jumlah_bayar: Number(body.jumlahBayar), tgl_jt_baru: tglJTBaru };
      } else if (body.status === 'TAMBAH') {
        vars = {
          ...vars,
          jumlah_lama: Number(body.jumlahGadai),
          jumlah_baru: Number(body.jumlahGadaiBaru ?? 0),
          selisih: Math.abs(Number(body.jumlahGadaiBaru ?? 0) - Number(body.jumlahGadai)),
          tgl_jt: tglJTBaru,
        };
      } else if (body.status === 'KURANG') {
        vars = {
          ...vars,
          jumlah_lama: Number(body.jumlahGadai),
          jumlah_baru: Number(body.jumlahGadaiBaru ?? 0),
          selisih: Math.abs(Number(body.jumlahGadai) - Number(body.jumlahGadaiBaru ?? 0)),
          tgl_jt: tglJTBaru,
        };
      } else if (body.status === 'SITA') {
        vars = { ...vars, tgl_sita: tglFmt };
      } else if (body.status === 'JUAL') {
        const totalKewajiban = Number(body.jumlahGadai) + Number(body.ujrahBerjalan);
        const hargaJual = Number(body.taksiranJual ?? body.taksiran);
        vars = {
          ...vars,
          harga_jual: hargaJual,
          total_kewajiban: totalKewajiban,
          selisih_kelebihan: Math.max(0, hargaJual - totalKewajiban),
        };
      }

      if (tplCode) {
        queueWA({
          outletId,
          templateCode: tplCode,
          vars,
          toNumber: telp1WA,
          toNumber2: telp2WA,
          refTable: 'tb_tebus',
          refId: idTebus,
          noFaktur: body.noFaktur,
          namaNasabah: body.namaNasabah,
        });
      }

      // Diskon confirm: kirim hanya kalau ada selisih > 0 dan status
      // yang memang punya konsep diskon (TEBUS/PERPANJANG/TAMBAH/KURANG)
      if (statusPerluDiskon && selisih > 0) {
        queueWA({
          outletId,
          templateCode: 'DISKON_CONFIRM',
          vars: {
            nama: body.namaNasabah,
            no_faktur: body.noFaktur,
            ujrah_seharusnya: Number(body.ujrahBerjalan),
            selisih: selisih,
            jumlah_bayar: Number(body.jumlahBayar),
            alasan: body.alasan ?? '',
            wa_owner: '',
          },
          toNumber: telp1WA,
          toNumber2: telp2WA,
          refTable: 'tb_tebus',
          refId: idTebus + '-DSK',
          noFaktur: body.noFaktur,
          namaNasabah: body.namaNasabah,
        });
      }
    } catch (e) {
      console.error('[tebus/submit] WA queue error (ignored):', e);
    }

    return NextResponse.json({
      ok: true,
      idTebus, idDiskon, adaDiskon, tanpaSurat, idKehilangan,
      kasir,
      tglTebus: tglFmt,
      tglGadaiBaru, tglJTBaru, tglSitaBaru,
      outlet:   outletName,
      alamat:   outlet.alamat ?? '',
      kota:     outlet.kota ?? '',
      telpon:   outlet.telepon ?? outlet.telpon ?? '',
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
