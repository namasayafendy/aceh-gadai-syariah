// ============================================================
// File: app/api/wa/test-send/route.ts
// Test endpoint untuk smoke-test sender.
//
// USAGE (back-test):
//   POST /api/wa/test-send
//   {
//     "outletId": 1,
//     "templateCode": "GADAI_NEW",
//     "vars": { "nama": "TEST", "no_faktur": "TEST-1", "barang": "TEST", ... },
//     "toNumber": "081234567890",
//     "mockMode": true   // force mock — tidak benar-benar kirim ke Wablas
//   }
//
// SECURITY:
//   - Owner-only (PIN owner)
//   - HANYA untuk testing — JANGAN dipakai di production transaksi
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendWA } from '@/lib/wa/sender';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Owner-only protection
    if (!body.pin) {
      return NextResponse.json({ ok: false, msg: 'PIN owner wajib untuk test endpoint.' });
    }
    const db = await createServiceClient();
    const outletId = Number(body.outletId ?? 1);
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin).trim(),
      p_outlet_id: outletId,
    });
    if (!pinResult?.ok) {
      return NextResponse.json({ ok: false, msg: 'PIN tidak valid.' });
    }

    // Optional mock mode override (just for this call)
    const prev = process.env.WA_MOCK_MODE;
    if (body.mockMode === true) {
      process.env.WA_MOCK_MODE = '1';
    }

    const result = await sendWA({
      outletId,
      templateCode: String(body.templateCode || 'GADAI_NEW'),
      vars: body.vars ?? {},
      toNumber: String(body.toNumber || ''),
      toNumber2: body.toNumber2 ? String(body.toNumber2) : undefined,
      refTable: body.refTable,
      refId: body.refId,
      noFaktur: body.noFaktur,
      namaNasabah: body.namaNasabah,
      dedupeHours: body.dedupeHours,
    });

    // Restore mock env
    if (body.mockMode === true) {
      if (prev === undefined) {
        delete process.env.WA_MOCK_MODE;
      } else {
        process.env.WA_MOCK_MODE = prev;
      }
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error('[wa/test-send]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + (e as Error).message }, { status: 500 });
  }
}
