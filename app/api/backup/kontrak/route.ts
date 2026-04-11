// ============================================================
// ACEH GADAI SYARIAH - Save Kontrak to Storage
// File: app/api/backup/kontrak/route.ts
//
// Dipanggil dari client setelah transaksi berhasil:
//   POST /api/backup/kontrak
//   Body: { tipe: 'GADAI'|'SJB'|'TEBUS'|..., noFaktur, ...data }
//
// Build HTML dari template lalu upload ke Supabase Storage.
// Tidak wajib berhasil — jika gagal, transaksi tetap valid.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { uploadKontrak } from '@/lib/storage/backup';
import { buildGadaiHtml, buildTebusHtml, buildBonHtml } from '@/lib/pdf/templates';
import type { GadaiData, TebusData } from '@/lib/pdf/templates';

export async function POST(request: NextRequest) {
  try {
    const db       = await createServiceClient();
    const body     = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '1', 10) || 1;

    const { tipe, noFaktur } = body;
    if (!tipe || !noFaktur) {
      return NextResponse.json({ ok: false, msg: 'tipe dan noFaktur wajib diisi.' });
    }

    // Ambil outlet name
    const { data: outlet } = await db.from('outlets').select('nama').eq('id', outletId).single() as unknown as { data: { nama: string } | null };
    const outletName = outlet?.nama ?? '';

    let html = '';

    // Build HTML sesuai tipe transaksi
    if (tipe === 'GADAI') {
      html = buildGadaiHtml(body as GadaiData);
    } else if (tipe === 'SJB') {
      // SJB: pakai buildBonHtml karena format surat berbeda dari gadai
      html = buildBonHtml('SJB', body);
    } else if (['TEBUS','PERPANJANG','TAMBAH','KURANG','SITA','JUAL','BUYBACK'].includes(tipe)) {
      html = buildTebusHtml(body as TebusData);
    } else {
      html = buildBonHtml(tipe, body);
    }

    const result = await uploadKontrak(db, outletName, noFaktur, html);

    if (!result.ok) {
      // Log error tapi return ok:true — backup tidak critical
      console.error('[backup/kontrak] upload error:', result.error);
      return NextResponse.json({ ok: false, msg: result.error });
    }

    return NextResponse.json({ ok: true, path: result.path });

  } catch (err) {
    console.error('[backup/kontrak]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
