// ============================================================
// ACEH GADAI SYARIAH - Edit Gadai API
// File: app/api/edit/gadai/route.ts
// POST: edit field yang boleh diubah (nama, barang, dll)
// ADMIN/OWNER only — semua perubahan dicatat di audit_log
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    // Validasi PIN (ADMIN/OWNER only)
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

    // Build update object + track changes
    const updates: Record<string, any> = {};
    const changes: string[] = [];
    const c = current as any;

    const editable: Record<string, string> = {
      nama: 'nama', barang: 'barang', kelengkapan: 'kelengkapan',
      imeiSn: 'imei_sn', noKtp: 'no_ktp', telp1: 'telp1',
    };

    for (const [bodyKey, dbKey] of Object.entries(editable)) {
      if (body[bodyKey] !== undefined && String(body[bodyKey]).trim() !== String(c[dbKey] ?? '').trim()) {
        const oldVal = c[dbKey] ?? '';
        const newVal = String(body[bodyKey]).trim();
        updates[dbKey] = newVal;
        changes.push(`${dbKey}: ${oldVal} → ${newVal}`);
      }
    }

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, msg: 'Tidak ada perubahan.' });
    }

    // Update
    updates.updated_at = new Date().toISOString();
    updates.updated_by = kasir;
    const { error } = await db.from(tableName).update(updates).eq('id', id);
    if (error) return NextResponse.json({ ok: false, msg: 'Gagal update: ' + error.message });

    // Audit log
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single();
    const outletName = outlet ? String((outlet as any).nama) : '';

    await db.from('audit_log').insert({
      user_nama: kasir, tabel: tableName, record_id: noFaktur,
      aksi: 'EDIT', field: changes.join(' | '),
      nilai_lama: JSON.stringify(Object.fromEntries(Object.keys(updates).filter(k => k !== 'updated_at' && k !== 'updated_by').map(k => [k, c[k]]))),
      nilai_baru: JSON.stringify(updates),
      outlet: outletName,
    });

    return NextResponse.json({ ok: true, msg: 'Berhasil: ' + changes.join(', '), changes });
  } catch (err) {
    console.error('[edit/gadai]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
