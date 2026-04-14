// ============================================================
// ACEH GADAI SYARIAH - Edit Tebus API
// File: app/api/edit/tebus/route.ts
//
// POST:   Cari semua tebus + buyback untuk sebuah no kontrak
//         Cermin editCariTebus() di GAS Code.gs
// PATCH:  Edit jumlah_bayar + payment tebus/buyback
//         Cermin editSimpanTebus() di GAS Code.gs
// DELETE: Batalkan tebus/buyback → revert gadai/sjb ke AKTIF + reverse kas
//         Cermin batalTebus() di GAS Code.gs
//
// ADMIN/OWNER only — semua perubahan dicatat di audit_log
// ALUR KAS TIDAK BOLEH DIUBAH
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateKas, type TipeTransaksi, type PaymentMethod } from '@/lib/db/kas';

// ── Helper: validasi PIN + role check ─────────────────────────
async function validateAdmin(db: any, pin: string, outletId: number) {
  const { data: pinResult } = await db.rpc('validate_pin', {
    p_pin: String(pin).trim(), p_outlet_id: outletId,
  });
  if (!pinResult?.ok) return { ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' };
  const role = String(pinResult.role ?? '').toUpperCase();
  if (!['ADMIN', 'OWNER'].includes(role)) return { ok: false, msg: 'Akses ditolak. Hanya Admin/Owner.' };
  return { ok: true, nama: pinResult.nama as string };
}

// ── Helper: reverse kas entries by no_ref (cermin _reverseKas di GAS) ──
async function reverseKasByRef(
  db: any, noRef: string, jenis: string | null,
  kasir: string, outletName: string, outletId: number
): Promise<number> {
  let query = db.from('tb_kas').select('*').eq('no_ref', noRef).neq('sumber', 'BATAL');
  if (jenis) query = query.eq('jenis', jenis);
  const { data: kasEntries } = await query.order('tgl', { ascending: true });

  let count = 0;
  if (kasEntries && kasEntries.length > 0) {
    for (const entry of kasEntries) {
      const e = entry as any;
      const tipeAsli = String(e.tipe || '');
      const tipeReverse = tipeAsli === 'MASUK' ? 'KELUAR' : 'MASUK';
      const jumlah = Number(e.jumlah || 0);
      if (jumlah === 0) continue;

      const { data: newKasId } = await db.rpc('get_next_id', { p_tipe: 'KAS', p_outlet_id: outletId });
      await db.from('tb_kas').insert({
        id: newKasId as string,
        tgl: new Date().toISOString(),
        no_ref: noRef,
        keterangan: 'BATAL ' + String(e.keterangan || ''),
        tipe: tipeReverse,
        tipe_kas: String(e.tipe_kas || 'CASH'),
        jumlah: jumlah,
        jenis: String(e.jenis || ''),
        sumber: 'BATAL',
        kasir: kasir,
        outlet: outletName,
      });
      await db.from('tb_kas').update({ sumber: 'BATAL' }).eq('id', e.id);
      count++;
    }
  }
  return count;
}

// ══════════════════════════════════════════════════════════════
// POST: Cari semua tebus + buyback untuk sebuah no kontrak
// Cermin editCariTebus() di GAS Code.gs
// ══════════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    const auth = await validateAdmin(db, body.pin, outletId);
    if (!auth.ok) return NextResponse.json(auth);

    const noKontrak = String(body.noKontrak ?? '').trim().toUpperCase();
    if (!noKontrak) return NextResponse.json({ ok: false, msg: 'No kontrak tidak boleh kosong.' });

    // Cari di tb_tebus dan tb_buyback (cermin GAS editCariTebus)
    const results: any[] = [];

    const { data: tebusRows } = await db.from('tb_tebus')
      .select('*')
      .ilike('no_faktur', noKontrak)
      .neq('status', 'BATAL')
      .order('tgl', { ascending: false });

    if (tebusRows) {
      for (const r of tebusRows) {
        const t = r as any;
        results.push({
          tipe: 'TEBUS',
          idTebus: t.id,
          tgl: t.tgl,
          noFaktur: t.no_faktur,
          idGadai: t.id_gadai,
          nama: t.nama_nasabah || '',
          barang: t.barang || '',
          taksiran: parseFloat(t.taksiran) || 0,
          jumlahGadai: parseFloat(t.jumlah_gadai) || 0,
          jumlahGadaiBaru: parseFloat(t.jumlah_gadai_baru) || 0,
          ujrahBerjalan: parseFloat(t.ujrah_berjalan) || 0,
          totalSistem: parseFloat(t.total_tebus_sistem) || 0,
          jumlahBayar: parseFloat(t.jumlah_bayar) || 0,
          selisih: parseFloat(t.selisih) || 0,
          status: t.status || '',
          payment: t.payment || 'CASH',
          kasir: t.kasir || '',
        });
      }
    }

    const { data: buybackRows } = await db.from('tb_buyback')
      .select('*')
      .ilike('no_faktur', noKontrak)
      .neq('status', 'BATAL')
      .order('tgl', { ascending: false });

    if (buybackRows) {
      for (const r of buybackRows) {
        const b = r as any;
        results.push({
          tipe: 'BUYBACK',
          idTebus: b.id,
          tgl: b.tgl,
          noFaktur: b.no_faktur,
          idGadai: b.id_sjb,
          nama: b.nama || '',
          barang: b.barang || '',
          taksiran: parseFloat(b.taksiran) || 0,
          jumlahGadai: parseFloat(b.harga_jual) || 0,
          jumlahGadaiBaru: parseFloat(b.harga_jual_baru) || 0,
          ujrahBerjalan: parseFloat(b.ujrah_berjalan) || 0,
          totalSistem: parseFloat(b.total_sistem) || 0,
          jumlahBayar: parseFloat(b.jumlah_bayar) || 0,
          selisih: parseFloat(b.selisih) || 0,
          status: b.status || '',
          payment: b.payment || 'CASH',
          kasir: b.kasir || '',
        });
      }
    }

    if (!results.length) {
      return NextResponse.json({ ok: false, msg: `Tidak ada transaksi tebus untuk kontrak "${noKontrak}".` });
    }

    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error('[edit/tebus POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════
// PATCH: Edit jumlah_bayar + payment tebus/buyback
// Cermin editSimpanTebus() di GAS Code.gs
// ══════════════════════════════════════════════════════════════
export async function PATCH(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    const auth = await validateAdmin(db, body.pin, outletId);
    if (!auth.ok) return NextResponse.json(auth);
    const kasir = auth.nama!;

    const { idTebus, tipe } = body;
    if (!idTebus) return NextResponse.json({ ok: false, msg: 'ID Tebus wajib.' });

    const shName = tipe === 'BUYBACK' ? 'tb_buyback' : 'tb_tebus';

    // Get current record
    const { data: current } = await db.from(shName).select('*').eq('id', idTebus).single();
    if (!current) return NextResponse.json({ ok: false, msg: 'ID Tebus tidak ditemukan.' });
    const r = current as any;

    // Get outlet name
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = outlet ? String((outlet as any).nama) : '';

    // Track changes (cermin GAS editSimpanTebus)
    const changes: string[] = [];
    const updates: Record<string, any> = {};

    // Jumlah Bayar
    if (body.jumlahBayar !== undefined && body.jumlahBayar !== '') {
      const v = parseFloat(body.jumlahBayar) || 0;
      const oldVal = parseFloat(r.jumlah_bayar) || 0;
      if (v !== oldVal) {
        updates.jumlah_bayar = v;
        changes.push(`Jumlah Bayar: ${oldVal} → ${v}`);
        // Update selisih (cermin GAS: totalSistem - jumlahBayar)
        const totalSistem = shName === 'tb_buyback'
          ? parseFloat(r.total_sistem) || 0
          : parseFloat(r.total_tebus_sistem) || 0;
        updates.selisih = totalSistem - v;
      }
    }

    // Payment
    if (body.payment && body.payment !== String(r.payment ?? '')) {
      updates.payment = body.payment;
      changes.push(`Payment: ${r.payment} → ${body.payment}`);
    }

    // Updated timestamp
    updates.updated_at = new Date().toISOString();
    updates.updated_by = kasir;

    if (changes.length === 0) {
      return NextResponse.json({ ok: false, msg: 'Tidak ada perubahan.' });
    }

    // Update record
    const { error } = await db.from(shName).update(updates).eq('id', idTebus);
    if (error) return NextResponse.json({ ok: false, msg: 'Gagal update: ' + error.message });

    // Audit log
    await db.from('audit_log').insert({
      user_nama: kasir, tabel: shName, record_id: idTebus,
      aksi: 'EDIT', field: changes.join(' | '),
      nilai_lama: JSON.stringify({ jumlah_bayar: r.jumlah_bayar, payment: r.payment }),
      nilai_baru: JSON.stringify(updates),
      outlet: outletName,
    });

    // ── Kas reverse + regenerate jika payment / jumlahBayar berubah ──
    // Cermin GAS editSimpanTebus
    const paymentBerubah = body.payment && body.payment !== String(r.payment ?? '');
    const jmlBayarBerubah = body.jumlahBayar !== undefined &&
      (parseFloat(body.jumlahBayar) || 0) !== (parseFloat(r.jumlah_bayar) || 0);

    if (paymentBerubah || jmlBayarBerubah) {
      const noFaktur = String(r.no_faktur || '');
      const jenisTx = (tipe === 'BUYBACK' ? 'BUYBACK' : r.status?.toUpperCase() || 'TEBUS') as TipeTransaksi;

      // Reverse kas lama — coba by idTebus dulu, kalau 0 coba by noFaktur+jenis (cermin GAS)
      let reversed = await reverseKasByRef(db, idTebus, null, kasir, outletName, outletId);
      if (reversed === 0) {
        reversed = await reverseKasByRef(db, noFaktur, jenisTx, kasir, outletName, outletId);
      }

      // Generate kas baru
      const jmlBayar = body.jumlahBayar !== undefined
        ? (parseFloat(body.jumlahBayar) || 0)
        : (parseFloat(r.jumlah_bayar) || 0);
      const newPayment = (body.payment || String(r.payment || 'CASH')) as PaymentMethod;
      const cashVal = newPayment === 'CASH' ? jmlBayar
        : newPayment === 'BANK' ? 0
        : (parseFloat(body.cash) || 0);
      const bankVal = newPayment === 'BANK' ? jmlBayar
        : newPayment === 'CASH' ? 0
        : (parseFloat(body.bank) || 0);

      await generateKas(db, outletId, {
        noFaktur,
        noRef: idTebus,
        jenisTransaksi: jenisTx,
        payment: newPayment,
        cash: cashVal,
        bank: bankVal,
        jumlahBayar: jmlBayar,
        jumlahGadai: parseFloat(r.jumlah_gadai ?? r.harga_jual) || 0,
        jumlahGadaiBaru: parseFloat(r.jumlah_gadai_baru ?? r.harga_jual_baru) || 0,
        ujrahBerjalan: parseFloat(r.ujrah_berjalan) || 0,
        taksiran: parseFloat(r.taksiran) || 0,
        taksiranJual: parseFloat(r.taksiran) || 0,
        taksiranSita: parseFloat(r.taksiran) || 0,
        user: kasir,
        outlet: outletName,
      });

      // Update cash/bank on tebus record
      await db.from(shName).update({ cash: cashVal, bank: bankVal }).eq('id', idTebus);

      // Audit log kas update
      await db.from('audit_log').insert({
        user_nama: kasir, tabel: shName, record_id: idTebus,
        aksi: 'KAS_UPDATE',
        field: (paymentBerubah ? `payment: ${r.payment} → ${newPayment} ` : '') +
               (jmlBayarBerubah ? `jumlahBayar: ${r.jumlah_bayar} → ${jmlBayar}` : ''),
        nilai_lama: `${reversed} entries reversed`,
        nilai_baru: `payment=${newPayment} cash=${cashVal} bank=${bankVal}`,
        outlet: outletName,
      });
    }

    return NextResponse.json({ ok: true, msg: 'Perubahan disimpan: ' + changes.join(', ') });
  } catch (err) {
    console.error('[edit/tebus PATCH]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════
// DELETE: Batalkan tebus/buyback → revert gadai/sjb ke AKTIF + reverse kas
// Cermin batalTebus() di GAS Code.gs
// ══════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    const auth = await validateAdmin(db, body.pin, outletId);
    if (!auth.ok) return NextResponse.json(auth);
    const kasir = auth.nama!;

    const { idTebus, tipe } = body;
    if (!idTebus) return NextResponse.json({ ok: false, msg: 'ID Tebus wajib.' });

    const shName = tipe === 'BUYBACK' ? 'tb_buyback' : 'tb_tebus';

    // Get current record
    const { data: current } = await db.from(shName).select('*').eq('id', idTebus).single();
    if (!current) return NextResponse.json({ ok: false, msg: 'ID Tebus tidak ditemukan.' });
    const r = current as any;
    const noFaktur = String(r.no_faktur || '');
    const idGadai = String(tipe === 'BUYBACK' ? r.id_sjb : r.id_gadai || '');

    // Get outlet name
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = outlet ? String((outlet as any).nama) : '';

    // ── 1. Mark tebus as BATAL ────────────────────────────────
    const { error: updateErr } = await db.from(shName).update({
      status: 'BATAL',
      updated_at: new Date().toISOString(),
      updated_by: kasir,
    }).eq('id', idTebus);
    if (updateErr) return NextResponse.json({ ok: false, msg: 'Gagal update: ' + updateErr.message });

    await db.from('audit_log').insert({
      user_nama: kasir, tabel: shName, record_id: idTebus,
      aksi: 'BATAL', field: 'Status',
      nilai_lama: r.status, nilai_baru: 'BATAL',
      outlet: outletName,
    });

    // ── 2. Revert gadai/sjb status ke AKTIF (cermin GAS batalTebus) ──
    // Cari di tb_gadai dulu
    const { data: gadaiRow } = await db.from('tb_gadai').select('id, status')
      .or(`id.eq.${idGadai},no_faktur.ilike.${noFaktur}`)
      .limit(1).single();

    if (gadaiRow) {
      const g = gadaiRow as any;
      await db.from('tb_gadai').update({
        status: 'AKTIF',
        updated_at: new Date().toISOString(),
        updated_by: kasir,
      }).eq('id', g.id);
      await db.from('audit_log').insert({
        user_nama: kasir, tabel: 'tb_gadai', record_id: noFaktur,
        aksi: 'REVERT', field: 'Status',
        nilai_lama: g.status, nilai_baru: 'AKTIF',
        outlet: outletName,
        catatan: `Batal tebus ${idTebus}`,
      });
    } else {
      // Cek tb_sjb (cermin GAS batalTebus yang juga cek tb_sjb)
      const { data: sjbRow } = await db.from('tb_sjb').select('id, status')
        .ilike('no_faktur', noFaktur)
        .limit(1).single();

      if (sjbRow) {
        const s = sjbRow as any;
        await db.from('tb_sjb').update({
          status: 'AKTIF',
          updated_at: new Date().toISOString(),
          updated_by: kasir,
        }).eq('id', s.id);
        await db.from('audit_log').insert({
          user_nama: kasir, tabel: 'tb_sjb', record_id: noFaktur,
          aksi: 'REVERT', field: 'Status',
          nilai_lama: s.status, nilai_baru: 'AKTIF',
          outlet: outletName,
          catatan: `Batal tebus ${idTebus}`,
        });
      }
    }

    // ── 3. Reverse kas entries (cermin GAS batalTebus) ─────────
    const kasCount = await reverseKasByRef(db, noFaktur, null, kasir, outletName, outletId);

    await db.from('audit_log').insert({
      user_nama: kasir, tabel: shName, record_id: idTebus,
      aksi: 'BATAL_KAS', field: 'reverseKas',
      nilai_lama: noFaktur, nilai_baru: `${kasCount} entries`,
      outlet: outletName,
    });

    return NextResponse.json({
      ok: true,
      msg: `Tebus ${idTebus} dibatalkan. Status kontrak ${noFaktur} dikembalikan ke AKTIF. ${kasCount} entri kas di-reverse.`,
    });
  } catch (err) {
    console.error('[edit/tebus DELETE]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
