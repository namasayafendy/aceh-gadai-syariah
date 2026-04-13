// ============================================================
// ACEH GADAI SYARIAH - Outlet Settings API
// File: app/api/outlet/route.ts
// GET:  list all outlets
// PUT:  update outlet settings (OWNER only)
// DB column: 'telepon' (bukan 'telpon')
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const db = await createServiceClient();
    const { data: rows, error } = await db.from('outlets').select('*').order('id');
    if (error) return NextResponse.json({ ok: false, msg: error.message });
    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '0', 10);

    // PIN validation (OWNER only)
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    if (String(pinResult.role).toUpperCase() !== 'OWNER') {
      return NextResponse.json({ ok: false, msg: 'Hanya OWNER yang bisa edit outlet.' });
    }

    const id = body.id;
    if (!id) return NextResponse.json({ ok: false, msg: 'ID outlet wajib.' });

    // Build update — only include non-null fields
    // DB column is 'telepon' not 'telpon'
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.nama != null) updates.nama = body.nama;
    if (body.alamat != null) updates.alamat = body.alamat;
    if (body.kota != null) updates.kota = body.kota;
    if (body.telpon != null) updates.telepon = body.telpon;       // frontend sends 'telpon', DB column is 'telepon'
    if (body.telepon != null) updates.telepon = body.telepon;     // also accept 'telepon' directly
    if (body.waktu_operasional != null) updates.waktu_operasional = body.waktu_operasional;
    if (body.nama_perusahaan != null) updates.nama_perusahaan = body.nama_perusahaan;
    if (body.biaya_admin !== undefined) updates.biaya_admin = Number(body.biaya_admin);
    if (body.web_url != null) updates.web_url = body.web_url;

    const { error } = await db.from('outlets').update(updates).eq('id', id);
    if (error) return NextResponse.json({ ok: false, msg: error.message });

    await db.from('audit_log').insert({
      user_nama: pinResult.nama, tabel: 'outlets', record_id: String(id),
      aksi: 'EDIT', field: 'settings',
      nilai_baru: JSON.stringify(body),
      outlet: body.nama || '',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[outlet PUT]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
