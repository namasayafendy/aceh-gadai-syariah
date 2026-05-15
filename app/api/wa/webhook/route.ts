// ============================================================
// File: app/api/wa/webhook/route.ts
//
// PUBLIC endpoint (no auth) — di-POST oleh provider WhatsApp
// (Wablas/Fonnte) saat ada balasan masuk dari konsumen.
//
// Konfigurasi di provider:
//   Wablas:  Dashboard > Setting > Webhook URL = https://app.acehgadaisyariah.com/api/wa/webhook
//   Fonnte:  Dashboard > Device > Webhook = https://app.acehgadaisyariah.com/api/wa/webhook
//
// Payload format berbeda per provider — kita parse flexibly.
//
// Flow:
//   1. Parse body → ambil nomor pengirim + isi pesan
//   2. Match nomor ke tb_gadai/tb_sjb (telp1 atau telp2)
//   3. Insert ke tb_wa_incoming (state=NEW)
//   4. Update reminder_state kontrak ke HUMAN_HANDLING (pause auto-reminder)
//   5. Kirim notif Telegram ke admin (kalau app_settings.wa_admin_chat_id ada)
//   6. Selalu return 200 OK — kalau gagal, log error tapi jangan biarkan
//      provider keep retrying (bisa flood).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { normalizePhoneID } from '@/lib/wa/normalize';
import { sendTelegram, escapeMd } from '@/lib/telegram';

interface ParsedIncoming {
  fromNumber: string;
  message: string;
  providerMsgId?: string;
}

/**
 * Parse berbagai payload format dari Wablas/Fonnte/lainnya.
 * Return null kalau tidak ada nomor + message yang valid.
 */
function parseIncoming(body: any): ParsedIncoming | null {
  if (!body || typeof body !== 'object') return null;

  // Wablas format A: { messages: [{ id, phone, message, ... }] }
  if (Array.isArray(body.messages) && body.messages.length > 0) {
    const m = body.messages[0];
    const from = String(m.from ?? m.phone ?? m.sender ?? '');
    const msg = String(m.message ?? m.body ?? m.text ?? '');
    if (from && msg) return { fromNumber: from, message: msg, providerMsgId: m.id };
  }

  // Wablas format B: { id, phone, message } flat
  // Fonnte format:   { device, sender, message }
  const from = String(body.from ?? body.phone ?? body.sender ?? '');
  const msg = String(body.message ?? body.body ?? body.text ?? '');
  if (from && msg) {
    return { fromNumber: from, message: msg, providerMsgId: body.id ?? body.message_id };
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseIncoming(body);

    if (!parsed) {
      console.warn('[wa/webhook] payload tidak dikenali:', JSON.stringify(body).slice(0, 300));
      return NextResponse.json({ ok: true, note: 'no actionable payload' }, { status: 200 });
    }

    const fromNorm = normalizePhoneID(parsed.fromNumber);
    if (!fromNorm) {
      console.warn('[wa/webhook] nomor invalid:', parsed.fromNumber);
      return NextResponse.json({ ok: true, note: 'invalid phone' }, { status: 200 });
    }

    const messageBody = parsed.message.trim();
    if (!messageBody) {
      return NextResponse.json({ ok: true, note: 'empty message' }, { status: 200 });
    }

    const db = await createServiceClient();

    // ── 1. Cari kontrak aktif yang nomor-nya match ──
    // Prioritas: gadai AKTIF dulu, kalau tidak ada coba SJB AKTIF
    let refTable = '';
    let refId = '';
    let noFaktur = '';
    let nasabahNama = '';
    let outletId: number | null = null;
    let updateGadai = false;
    let updateSjb = false;

    const { data: gadaiMatch } = await db
      .from('tb_gadai')
      .select('id, no_faktur, nama, outlet_id')
      .eq('status', 'AKTIF')
      .or(`telp1.eq.${fromNorm},telp2.eq.${fromNorm}`)
      .order('tgl_gadai', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gadaiMatch) {
      refTable = 'tb_gadai';
      refId = (gadaiMatch as any).id;
      noFaktur = (gadaiMatch as any).no_faktur;
      nasabahNama = (gadaiMatch as any).nama;
      outletId = Number((gadaiMatch as any).outlet_id);
      updateGadai = true;
    } else {
      const { data: sjbMatch } = await db
        .from('tb_sjb')
        .select('id, no_faktur, nama, outlet_id')
        .eq('status', 'AKTIF')
        .or(`telp1.eq.${fromNorm},telp2.eq.${fromNorm}`)
        .order('tgl_gadai', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sjbMatch) {
        refTable = 'tb_sjb';
        refId = (sjbMatch as any).id;
        noFaktur = (sjbMatch as any).no_faktur;
        nasabahNama = (sjbMatch as any).nama;
        outletId = Number((sjbMatch as any).outlet_id);
        updateSjb = true;
      }
    }

    // Kalau tidak ketemu match, tetap log incoming (untuk audit) dengan outlet_id=null
    if (!outletId) {
      const { data: anyOutlet } = await db.from('outlets').select('id').limit(1).maybeSingle();
      outletId = anyOutlet ? Number((anyOutlet as any).id) : 1;
    }

    // ── 2. Insert tb_wa_incoming ──
    const { data: incoming } = await db
      .from('tb_wa_incoming')
      .insert({
        outlet_id: outletId,
        nomor_pengirim: fromNorm,
        nama_nasabah: nasabahNama || null,
        ref_table: refTable || null,
        ref_id: refId || null,
        no_faktur: noFaktur || null,
        message_body: messageBody,
        provider_msg_id: parsed.providerMsgId ?? null,
        state: 'NEW',
      })
      .select('id, received_at')
      .single();

    // ── 3. Update kontrak reminder_state = HUMAN_HANDLING (pause reminder) ──
    if (updateGadai) {
      await db
        .from('tb_gadai')
        .update({ reminder_state: 'HUMAN_HANDLING' })
        .eq('id', refId);
    } else if (updateSjb) {
      await db
        .from('tb_sjb')
        .update({ reminder_state: 'HUMAN_HANDLING' })
        .eq('id', refId);
    }

    // ── 4. Notif Telegram ke admin ──
    try {
      const { data: chatSetting } = await db
        .from('app_settings')
        .select('value')
        .eq('key', 'wa_admin_chat_id')
        .maybeSingle();
      // Fallback: kalau wa_admin_chat_id belum di-set, pakai laporan_malam_chat_id
      let chatId = (chatSetting as any)?.value;
      if (!chatId) {
        const { data: fallback } = await db
          .from('app_settings')
          .select('value')
          .eq('key', 'laporan_malam_chat_id')
          .maybeSingle();
        chatId = (fallback as any)?.value;
      }

      if (chatId) {
        // Resolve nama outlet
        let outletName = '';
        if (outletId) {
          const { data: o } = await db.from('outlets').select('nama').eq('id', outletId).maybeSingle();
          outletName = (o as any)?.nama ?? '';
        }
        const preview = messageBody.length > 200 ? messageBody.slice(0, 200) + '...' : messageBody;
        const headerEmoji = refTable ? '💬' : '⚠️';
        const kontrakInfo = refTable
          ? `*${escapeMd(noFaktur)}* \\(${escapeMd(nasabahNama)}\\)`
          : '_Tidak match kontrak aktif_';

        const text =
          `${headerEmoji} *Balasan WA dari konsumen*\n\n` +
          `Outlet: *${escapeMd(outletName || '?')}*\n` +
          `Dari: \`${escapeMd(fromNorm)}\`\n` +
          `Kontrak: ${kontrakInfo}\n\n` +
          `Pesan:\n_${escapeMd(preview)}_\n\n` +
          `Buka dashboard WA Inbox untuk respond/reschedule\\.`;

        await sendTelegram(chatId, text, { parseMode: 'MarkdownV2' });
      }
    } catch (e) {
      console.error('[wa/webhook] telegram notif error (ignored):', e);
    }

    return NextResponse.json({
      ok: true,
      incomingId: incoming?.id,
      matched: !!refTable,
      noFaktur,
    });
  } catch (e) {
    console.error('[wa/webhook]', e);
    // SELALU return 200 supaya provider tidak retry-loop. Error di-log saja.
    return NextResponse.json({ ok: false, error: String(e) }, { status: 200 });
  }
}

// Provider biasanya cek GET juga untuk verify webhook URL alive
export async function GET() {
  return NextResponse.json({ ok: true, service: 'wa-webhook', method: 'POST' });
}
