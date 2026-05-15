// ============================================================
// File: app/api/wa/config/test/route.ts
// Owner-only: kirim test message via config aktif outlet
//
// Body: {
//   pin: string;
//   outletId: number;
//   toNumber: string;     // nomor tujuan test (mis. nomor admin/Pak Fendy sendiri)
//   testMessage?: string; // optional custom message, default standard
// }
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { wablasSend } from '@/lib/wa/adapters/wablas';
import { fonnteSend } from '@/lib/wa/adapters/fonnte';
import { mockSend } from '@/lib/wa/adapters/mock';
import { normalizePhoneID } from '@/lib/wa/normalize';
import type { WaConfig, AdapterResult } from '@/lib/wa/types';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();

    const outletId = Number(body.outletId);
    if (!outletId) return NextResponse.json({ ok: false, msg: 'outletId wajib' });

    // Owner PIN check
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin || '').trim(),
      p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid' });
    const role = String(pinResult.role || '').toUpperCase();
    if (role !== 'OWNER') return NextResponse.json({ ok: false, msg: 'Hanya OWNER yang boleh test' });

    // Resolve config aktif
    const { data: configRow } = await db
      .from('tb_wa_config')
      .select('*')
      .eq('outlet_id', outletId)
      .eq('status', 'ACTIVE')
      .eq('enabled', true)
      .maybeSingle();

    if (!configRow) {
      return NextResponse.json({ ok: false, msg: 'Belum ada config aktif untuk outlet ini' });
    }
    const config = configRow as WaConfig;

    // Normalize nomor tujuan
    const toNumber = normalizePhoneID(String(body.toNumber || ''));
    if (!toNumber) return NextResponse.json({ ok: false, msg: 'Nomor tujuan tidak valid' });

    const message =
      String(body.testMessage || '') ||
      `🧪 TEST MESSAGE\n\nKalau Anda menerima pesan ini, berarti config WhatsApp untuk outlet ${outletId} sudah berjalan.\n\nDikirim: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\nProvider: ${config.provider}\nNomor pengirim: ${config.nomor_pengirim}\n\n— ACEH GADAI SYARIAH (otomatis sistem)`;

    // Insert outgoing PENDING (untuk audit)
    const { data: outgoing } = await db
      .from('tb_wa_outgoing')
      .insert({
        outlet_id: outletId,
        ref_table: 'manual_test',
        ref_id: 'TEST-' + Date.now(),
        no_faktur: null,
        nama_nasabah: 'TEST',
        nomor_tujuan: toNumber,
        template_code: '_MANUAL_TEST_',
        message_body: message,
        status: 'PENDING',
        provider: config.provider,
      })
      .select('id')
      .single();

    // Call adapter
    let adapterResult: AdapterResult;
    if (config.provider === 'MOCK') {
      adapterResult = await mockSend({ config, toNumber, message });
    } else if (config.provider === 'WABLAS') {
      adapterResult = await wablasSend({ config, toNumber, message });
    } else if (config.provider === 'FONNTE') {
      adapterResult = await fonnteSend({ config, toNumber, message });
    } else {
      adapterResult = { ok: false, error: `Provider ${config.provider} tidak disupport` };
    }

    // Update outgoing
    if (outgoing) {
      await db
        .from('tb_wa_outgoing')
        .update({
          status: adapterResult.ok ? 'SENT' : 'FAILED',
          provider_msg_id: adapterResult.providerMsgId ?? null,
          error_msg: adapterResult.error ?? null,
          sent_at: adapterResult.ok ? new Date().toISOString() : null,
        })
        .eq('id', outgoing.id);
    }

    // Update config last_test_*
    await db
      .from('tb_wa_config')
      .update({
        last_test_at: new Date().toISOString(),
        last_test_ok: adapterResult.ok,
      })
      .eq('id', config.id);

    return NextResponse.json({
      ok: adapterResult.ok,
      msg: adapterResult.ok
        ? `Test terkirim ke ${toNumber}. Cek WhatsApp Anda.`
        : `Test gagal: ${adapterResult.error}`,
      provider: config.provider,
      providerMsgId: adapterResult.providerMsgId,
      error: adapterResult.error,
    });
  } catch (e) {
    console.error('[wa/config/test POST]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + (e as Error).message }, { status: 500 });
  }
}
