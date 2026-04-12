// ============================================================
// ACEH GADAI SYARIAH - Outlet Settings API
// File: app/api/outlet/route.ts
// GET:  list all outlets
// PUT:  update outlet settings (OWNER only)
// POST: add new outlet (OWNER only)
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

    const { id, nama, alamat, kota, telpon, waktu_operasional, nama_perusahaan, biaya_admin, web_url } = body;
    if (!id) return NextResponse.json({ ok: false, msg: 'ID outlet wajib.' });

    const { error } = await db.from('outlets').update({
      nama: nama ?? undefined,
      alamat: alamat ?? undefined,
      kota: kota ?? undefined,
      telpon: telpon ?? undefined,
      waktu_operasional: waktu_operasional ?? undefined,
      nama_perusahaan: nama_perusahaan ?? undefined,
      biaya_admin: biaya_admin !== undefined ? Number(biaya_admin) : undefined,
      web_url: web_url ?? undefined,
      updated_at: new Date().toISOString(),
    }).eq('id', id);

    if (error) return NextResponse.json({ ok: false, msg: error.message });

    await db.from('audit_log').insert({
      user_nama: pinResult.nama, tabel: 'outlets', record_id: String(id),
      aksi: 'EDIT', field: 'settings',
      nilai_baru: JSON.stringify(body),
      outlet: nama || '',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
