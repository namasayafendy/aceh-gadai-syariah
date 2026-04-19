// ============================================================
// ACEH GADAI SYARIAH - Edit Gadai API
// File: app/api/edit/gadai/route.ts
// POST: edit field yang boleh diubah
// ADMIN/OWNER only — semua perubahan dicatat di audit_log
//
// Cermin editSimpanGadai() di GAS Code.gs:
// - Edit nama, barang, kelengkapan, imei_sn, no_ktp, telp1
// - Edit taksiran, jumlah_gadai, ujrah_persen, ujrah_nominal, payment
// - Kalau payment ATAU jumlah_gadai berubah → reverse kas lama + generate kas baru
//
// ALUR KAS TIDAK BOLEH DIUBAH
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { generateKas, type TipeTransaksi, type PaymentMethod } from '@/lib/db/kas';
import { safeGetNextId } from '@/lib/db/counter';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // ── 1. Validasi PIN (ADMIN/OWNER only) ────────────────────
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    const role = String(pinResult.role ?? '').toUpperCase();
    if (!['ADMIN', 'OWNER'].includes(role)) {
      return NextResponse.json({ ok: false, msg: 'Akses ditolak. Hanya Admin/Owner.' });
    }
    const kasir = pinResult.nama as string;

    const { id, noFaktur } = body;
    if (!id || !noFaktur) return NextResponse.json({ ok: false, msg: 'ID dan No Faktur wajib.' });

    // Detect source table
    const source = body.source || 'GADAI';
    const tableName = source === 'SJB' ? 'tb_sjb' : 'tb_gadai';

    // Get current data
    const { data: current } = await db.from(tableName).select('*').eq('id', id).single();
    if (!current) return NextResponse.json({ ok: false, msg: 'Kontrak tidak ditemukan.' });

    const c = current as any;

    // ── 2. Build update object + track changes ────────────────
    const updates: Record<string, any> = {};
    const changes: string[] = [];

    // Non-financial editable fields
    const editableText: Record<string, string> = {
      nama: 'nama', barang: 'barang', kelengkapan: 'kelengkapan',
      imeiSn: 'imei_sn', noKtp: 'no_ktp', telp1: 'telp1',
    };

    for (const [bodyKey, dbKey] of Object.entries(editableText)) {
      if (body[bodyKey] !== undefined && String(body[bodyKey]).trim() !== String(c[dbKey] ?? '').trim()) {
        const oldVal = c[dbKey] ?? '';
        const newVal = String(body[bodyKey]).trim();
        updates[dbKey] = newVal;
        changes.push(`${dbKey}: ${oldVal} → ${newVal}`);
      }
    }

    // Financial editable fields (cermin GAS editSimpanGadai)
    const editableNum: Record<string, string> = {
      taksiran: 'taksiran',
      jumlahGadai: source === 'SJB' ? 'harga_jual' : 'jumlah_gadai',
      ujrahPersen: 'ujrah_persen',
      ujrahNominal: 'ujrah_nominal',
    };

    for (const [bodyKey, dbKey] of Object.entries(editableNum)) {
      if (body[bodyKey] !== undefined && body[bodyKey] !== '') {
        const newVal = parseFloat(body[bodyKey]) || 0;
        const oldVal = parseFloat(c[dbKey]) || 0;
        if (newVal !== oldVal) {
          updates[dbKey] = newVal;
          changes.push(`${dbKey}: ${oldVal} → ${newVal}`);
        }
      }
    }

    // Payment field
    if (body.payment && body.payment !== String(c.payment ?? '')) {
      updates.payment = body.payment;
      changes.push(`payment: ${c.payment} → ${body.payment}`);
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, msg: 'Tidak ada perubahan.' });
    }

    // ── 3. Update record ──────────────────────────────────────
    updates.updated_at = new Date().toISOString();
    updates.updated_by = kasir;
    const { error } = await db.from(tableName).update(updates).eq('id', id);
    if (error) return NextResponse.json({ ok: false, msg: 'Gagal update: ' + error.message });

    // ── 4. Audit log for field changes ────────────────────────
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = outlet ? String((outlet as any).nama) : '';

    await db.from('audit_log').insert({
      user_nama: kasir, tabel: tableName, record_id: noFaktur,
      aksi: 'EDIT', field: changes.join(' | '),
      nilai_lama: JSON.stringify(Object.fromEntries(
        Object.keys(updates).filter(k => k !== 'updated_at' && k !== 'updated_by').map(k => [k, c[k]])
      )),
      nilai_baru: JSON.stringify(updates),
      outlet: outletName,
    });

    // ── 5. Kas reverse + regenerate jika payment / jumlah berubah ──
    // Cermin GAS editSimpanGadai: kalau payment ATAU jumlahGadai berubah → reverse kas lama + generate kas baru
    const jumlahDbKey = source === 'SJB' ? 'harga_jual' : 'jumlah_gadai';
    const gadaiPaymentBerubah = body.payment && body.payment !== String(c.payment ?? '');
    const gadaiJmlBerubah = body.jumlahGadai !== undefined && body.jumlahGadai !== '' &&
      (parseFloat(body.jumlahGadai) || 0) !== (parseFloat(c[jumlahDbKey]) || 0);

    if (gadaiPaymentBerubah || gadaiJmlBerubah) {
      // ── 5a. Reverse kas lama (cermin _reverseKas di GAS) ──
      const { data: kasEntries } = await db.from('tb_kas')
        .select('*')
        .eq('no_ref', noFaktur)
        .neq('sumber', 'BATAL')
        .order('tgl', { ascending: true });

      let reverseCount = 0;
      if (kasEntries && kasEntries.length > 0) {
        for (const entry of kasEntries) {
          const e = entry as any;
          const tipeAsli = String(e.tipe || '');
          const tipeReverse = tipeAsli === 'MASUK' ? 'KELUAR' : 'MASUK';
          const jumlah = Number(e.jumlah || 0);
          if (jumlah === 0) continue;

          const newKasId = await safeGetNextId(db, 'KAS', outletId);
          await db.from('tb_kas').insert({
            id: newKasId,
            tgl: new Date().toISOString(),
            no_ref: noFaktur,
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
          reverseCount++;
        }
      }

      // ── 5b. Generate kas baru (cermin GAS editSimpanGadai) ──
      const jmlGadai = body.jumlahGadai !== undefined && body.jumlahGadai !== ''
        ? (parseFloat(body.jumlahGadai) || 0)
        : (parseFloat(c[jumlahDbKey]) || 0);
      const newPayment = (body.payment || String(c.payment || 'CASH')) as PaymentMethod;
      const cashVal = newPayment === 'CASH' ? jmlGadai
        : newPayment === 'BANK' ? 0
        : (parseFloat(body.cash) || 0);
      const bankVal = newPayment === 'BANK' ? jmlGadai
        : newPayment === 'CASH' ? 0
        : (parseFloat(body.bank) || 0);
      const tipe: TipeTransaksi = source === 'SJB' ? 'SJB' : 'GADAI';

      await generateKas(db, outletId, {
        noFaktur,
        jenisTransaksi: tipe,
        payment: newPayment,
        cash: cashVal,
        bank: bankVal,
        jumlahGadai: jmlGadai,
        user: kasir,
        outlet: outletName,
      });

      // Update cash/bank fields on the record too
      await db.from(tableName).update({
        cash: cashVal,
        bank: bankVal,
      }).eq('id', id);

      // Audit log for kas update
      await db.from('audit_log').insert({
        user_nama: kasir, tabel: tableName, record_id: noFaktur,
        aksi: 'KAS_UPDATE',
        field: (gadaiPaymentBerubah ? `payment: ${c.payment} → ${newPayment} ` : '') +
               (gadaiJmlBerubah ? `${jumlahDbKey}: ${c[jumlahDbKey]} → ${jmlGadai}` : ''),
        nilai_lama: `${reverseCount} entries reversed`,
        nilai_baru: `payment=${newPayment} cash=${cashVal} bank=${bankVal}`,
        outlet: outletName,
      });
    }

    return NextResponse.json({ ok: true, msg: 'Berhasil: ' + changes.join(', '), changes });
  } catch (err) {
    console.error('[edit/gadai]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
