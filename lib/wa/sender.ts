// ============================================================
// File: lib/wa/sender.ts
// Universal WhatsApp sender — provider-agnostic.
//
// FIRE-AND-FORGET PATTERN:
//   - Function ini AMAN dipanggil dari API route mana saja
//   - TIDAK PERNAH throw — selalu return result object
//   - Kalau gagal, hanya log error ke tb_wa_outgoing.status=FAILED
//   - Caller tidak perlu try/catch (tapi tetap recommended)
//
// Alur:
//   1. Resolve config WA outlet (tb_wa_config)
//   2. Resolve template (tb_wa_template) + render placeholder
//   3. Cek opt-out & dedupe (kalau ref_id sama dalam window)
//   4. Insert ke tb_wa_outgoing (status=PENDING)
//   5. Call provider adapter (Wablas / Fonnte / Mock)
//   6. Update outgoing row dengan hasil
// ============================================================

import { createServiceClient } from '@/lib/supabase/server';
import type {
  SendWaInput,
  SendWaResult,
  WaConfig,
  WaTemplate,
  AdapterResult,
  WaStatus,
} from './types';
import { normalizePhoneID, renderTemplate } from './normalize';
import { wablasSend } from './adapters/wablas';
import { fonnteSend } from './adapters/fonnte';
import { mockSend } from './adapters/mock';

const DEFAULT_DEDUPE_HOURS = 12;

/**
 * Entry point untuk semua kirim WA.
 *
 * Contoh pakai:
 *   await sendWA({
 *     outletId: 1,
 *     templateCode: 'GADAI_NEW',
 *     vars: { nama: 'HARUN', no_faktur: 'SBR-1-0001', barang: 'XIAOMI', ... },
 *     toNumber: '081234567890',
 *     toNumber2: '085678901234', // optional
 *     refTable: 'tb_gadai',
 *     refId: 'GADAI-1-20260514-001',
 *     noFaktur: 'SBR-1-0001',
 *     namaNasabah: 'HARUN',
 *   });
 */
export async function sendWA(input: SendWaInput): Promise<SendWaResult> {
  const result: SendWaResult = {
    ok: false,
    status: 'PENDING',
    outgoingIds: [],
  };

  try {
    const db = await createServiceClient();

    // ── 1. Resolve config outlet ──────────────────────────────
    const { data: configRow, error: configErr } = await db
      .from('tb_wa_config')
      .select('*')
      .eq('outlet_id', input.outletId)
      .eq('status', 'ACTIVE')
      .eq('enabled', true)
      .maybeSingle();

    if (configErr) {
      console.error('[wa/sender] config query error:', configErr.message);
      result.error = 'Config query error: ' + configErr.message;
      result.status = 'SKIPPED';
      result.skipReason = 'config_error';
      return result;
    }

    if (!configRow) {
      // Outlet belum setup WA → SKIP gracefully (jangan fail transaksi)
      result.status = 'SKIPPED';
      result.skipReason = 'no_active_config';
      // log skip ke tb_wa_outgoing supaya kelihatan di dashboard kalau ada miss
      await logSkip(db, input, 'no_active_config');
      return result;
    }
    const config: WaConfig = configRow as WaConfig;

    // ── 2. Resolve template ──────────────────────────────────
    const { data: tplRow, error: tplErr } = await db
      .from('tb_wa_template')
      .select('*')
      .eq('code', input.templateCode)
      .eq('is_active', true)
      .maybeSingle();

    if (tplErr || !tplRow) {
      result.status = 'FAILED';
      result.error = `Template ${input.templateCode} tidak ditemukan / inactive`;
      await logFail(db, input, config, result.error);
      return result;
    }
    const template: WaTemplate = tplRow as WaTemplate;

    // ── 3. Resolve outlet info untuk auto-fill {{outlet}}, {{wa_outlet}} ──
    const { data: outletRow } = await db
      .from('outlets')
      .select('id, nama, telepon, telpon')
      .eq('id', input.outletId)
      .maybeSingle();

    const enrichedVars = {
      ...input.vars,
      outlet: input.vars.outlet ?? outletRow?.nama ?? '',
      wa_outlet:
        input.vars.wa_outlet ??
        outletRow?.telepon ??
        (outletRow as any)?.telpon ??
        config.nomor_pengirim ??
        '',
    };

    const { rendered, missing } = renderTemplate(template.body, enrichedVars);
    if (missing.length > 0) {
      console.warn(`[wa/sender] template ${input.templateCode} missing vars:`, missing);
    }

    // ── 4. Normalize nomor & dedupe check ───────────────────
    const toNumberNorm = normalizePhoneID(input.toNumber);
    const toNumber2Norm = input.toNumber2 ? normalizePhoneID(input.toNumber2) : null;

    if (!toNumberNorm && !toNumber2Norm) {
      result.status = 'FAILED';
      result.error = 'No valid recipient number';
      await logFail(db, input, config, result.error);
      return result;
    }

    // Dedupe: skip kalau template_code + ref_id sama dalam window
    if (input.refId) {
      const dedupeHours = input.dedupeHours ?? DEFAULT_DEDUPE_HOURS;
      const since = new Date(Date.now() - dedupeHours * 3600 * 1000).toISOString();
      const { count } = await db
        .from('tb_wa_outgoing')
        .select('id', { count: 'exact', head: true })
        .eq('template_code', input.templateCode)
        .eq('ref_id', input.refId)
        .in('status', ['SENT', 'DELIVERED', 'READ'])
        .gte('created_at', since);

      if ((count ?? 0) > 0) {
        result.status = 'SKIPPED';
        result.skipReason = `dedupe: sudah pernah kirim dalam ${dedupeHours}h terakhir`;
        await logSkip(db, input, result.skipReason);
        return result;
      }
    }

    // ── 5. Kirim ke nomor utama ─────────────────────────────
    const sendResults: { ok: boolean; outgoingId: number }[] = [];

    if (toNumberNorm) {
      const sr = await sendOne(db, input, config, template, rendered, toNumberNorm);
      sendResults.push(sr);
      if (sr.outgoingId) result.outgoingIds.push(sr.outgoingId);
    }

    // ── 6. Kirim ke nomor kedua kalau beda dari nomor utama ──
    if (toNumber2Norm && toNumber2Norm !== toNumberNorm) {
      const sr = await sendOne(db, input, config, template, rendered, toNumber2Norm);
      sendResults.push(sr);
      if (sr.outgoingId) result.outgoingIds.push(sr.outgoingId);
    }

    // ── 7. Aggregate result ────────────────────────────────
    const anyOk = sendResults.some((r) => r.ok);
    result.ok = anyOk;
    result.status = anyOk ? 'SENT' : 'FAILED';
    if (!anyOk) {
      result.error = 'Semua nomor gagal kirim';
    }
    return result;
  } catch (e) {
    // Fallback safety — jangan biarkan exception bocor ke caller
    console.error('[wa/sender] unexpected error:', e);
    result.ok = false;
    result.status = 'FAILED';
    result.error = 'Unexpected: ' + (e as Error).message;
    return result;
  }
}

// ─────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────

async function sendOne(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  input: SendWaInput,
  config: WaConfig,
  template: WaTemplate,
  message: string,
  toNumber: string,
): Promise<{ ok: boolean; outgoingId: number }> {
  // 1. Insert outgoing PENDING
  const { data: inserted, error: insErr } = await db
    .from('tb_wa_outgoing')
    .insert({
      outlet_id: input.outletId,
      ref_table: input.refTable ?? null,
      ref_id: input.refId ?? null,
      no_faktur: input.noFaktur ?? null,
      nama_nasabah: input.namaNasabah ?? null,
      nomor_tujuan: toNumber,
      template_code: input.templateCode,
      message_body: message,
      status: 'PENDING',
      provider: config.provider,
    })
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.error('[wa/sender] insert outgoing failed:', insErr?.message);
    return { ok: false, outgoingId: 0 };
  }
  const outgoingId = inserted.id as number;

  // 2. Call adapter
  const mockMode = process.env.WA_MOCK_MODE === '1' || config.provider === 'MOCK';
  let adapterResult: AdapterResult;
  if (mockMode) {
    adapterResult = await mockSend({ config, toNumber, message });
  } else if (config.provider === 'WABLAS') {
    adapterResult = await wablasSend({ config, toNumber, message });
  } else if (config.provider === 'FONNTE') {
    adapterResult = await fonnteSend({ config, toNumber, message });
  } else {
    adapterResult = { ok: false, error: `Provider ${config.provider} belum disupport` };
  }

  // 3. Update outgoing row
  const finalStatus: WaStatus = adapterResult.ok ? 'SENT' : 'FAILED';
  await db
    .from('tb_wa_outgoing')
    .update({
      status: finalStatus,
      provider_msg_id: adapterResult.providerMsgId ?? null,
      error_msg: adapterResult.error ?? null,
      sent_at: adapterResult.ok ? new Date().toISOString() : null,
    })
    .eq('id', outgoingId);

  return { ok: adapterResult.ok, outgoingId };
}

async function logSkip(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  input: SendWaInput,
  reason: string,
): Promise<void> {
  try {
    const norm = normalizePhoneID(input.toNumber) ?? input.toNumber ?? '';
    await db.from('tb_wa_outgoing').insert({
      outlet_id: input.outletId,
      ref_table: input.refTable ?? null,
      ref_id: input.refId ?? null,
      no_faktur: input.noFaktur ?? null,
      nama_nasabah: input.namaNasabah ?? null,
      nomor_tujuan: norm,
      template_code: input.templateCode,
      message_body: `[SKIPPED: ${reason}]`,
      status: 'SKIPPED',
      error_msg: reason,
    });
  } catch (e) {
    // best effort, jangan crash
    console.error('[wa/sender] logSkip error:', e);
  }
}

async function logFail(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  input: SendWaInput,
  config: WaConfig | null,
  errMsg: string,
): Promise<void> {
  try {
    const norm = normalizePhoneID(input.toNumber) ?? input.toNumber ?? '';
    await db.from('tb_wa_outgoing').insert({
      outlet_id: input.outletId,
      ref_table: input.refTable ?? null,
      ref_id: input.refId ?? null,
      no_faktur: input.noFaktur ?? null,
      nama_nasabah: input.namaNasabah ?? null,
      nomor_tujuan: norm,
      template_code: input.templateCode,
      message_body: '[failed before send]',
      status: 'FAILED',
      provider: config?.provider ?? null,
      error_msg: errMsg,
    });
  } catch (e) {
    console.error('[wa/sender] logFail error:', e);
  }
}

/**
 * Helper: panggilan fire-and-forget yang aman.
 * Dipakai di submit endpoints supaya WA gagal tidak ngerusak response transaksi.
 *
 * Pemakaian:
 *   queueWA({ ... });  // tidak perlu await
 */
export function queueWA(input: SendWaInput): void {
  sendWA(input).catch((e) => {
    console.error('[wa/queue] background error:', e);
  });
}
