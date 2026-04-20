// ============================================================
// ACEH GADAI SYARIAH - Transfer Request (Fase 2)
// File: app/api/transfer/request/route.ts
//
// POST: kasir submit transfer request setelah gadai/tambah/sjb
//       tersimpan. Kirim notif + inline buttons ke grup Telegram
//       outlet. Tidak mempengaruhi alur kas.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendTelegram, inlineButtons, escapeMd, formatRpMd } from '@/lib/telegram';

interface Body {
  pin: string;
  tipe: 'GADAI' | 'TAMBAH' | 'SJB';
  refTable: string;               // 'tb_gadai' | 'tb_tebus' | 'tb_sjb'
  refNoFaktur: string;
  refId?: number | null;
  nominal: number;
  namaPenerima: string;
  noRek: string;
  bank: string;
  catatan?: string;
  // Context tambahan untuk notif (opsional, untuk display di Telegram)
  namaNasabah?: string;
  barang?: string;
}

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();

    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '0', 10);
    if (!outletId) return NextResponse.json({ ok: false, msg: 'Outlet ID wajib (header x-outlet-id).' });

    const body: Body = await request.json().catch(() => ({}) as Body);
    if (!body.pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });
    if (!body.tipe || !['GADAI', 'TAMBAH', 'SJB'].includes(body.tipe)) {
      return NextResponse.json({ ok: false, msg: 'Tipe tidak valid.' });
    }
    if (!body.refNoFaktur) return NextResponse.json({ ok: false, msg: 'No faktur wajib.' });
    if (!body.nominal || body.nominal <= 0) return NextResponse.json({ ok: false, msg: 'Nominal tidak valid.' });
    if (!body.namaPenerima?.trim()) return NextResponse.json({ ok: false, msg: 'Nama penerima wajib.' });
    if (!body.noRek?.trim()) return NextResponse.json({ ok: false, msg: 'No rekening wajib.' });
    if (!body.bank?.trim()) return NextResponse.json({ ok: false, msg: 'Bank wajib.' });

    // Validate PIN
    const { data: pinRes } = await db.rpc('validate_pin', {
      p_pin: body.pin.trim(), p_outlet_id: outletId,
    });
    if (!pinRes?.ok) {
      return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
    }
    const kasirNama: string = pinRes.nama ?? 'Kasir';

    // Ambil info outlet (nama + telegram chat_id)
    const { data: outlet } = await db.from('outlets')
      .select('id, nama, telegram_chat_id')
      .eq('id', outletId)
      .single();
    if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName: string = (outlet as any).nama;
    const chatId: number | null = (outlet as any).telegram_chat_id ?? null;

    // Insert record PENDING
    const { data: inserted, error: insErr } = await db.from('tb_transfer_request').insert({
      outlet_id: outletId,
      tipe: body.tipe,
      ref_table: body.refTable,
      ref_no_faktur: body.refNoFaktur,
      ref_id: body.refId ?? null,
      nominal: body.nominal,
      nama_penerima: body.namaPenerima.trim(),
      no_rek: body.noRek.trim(),
      bank: body.bank.trim(),
      catatan: body.catatan?.trim() || null,
      status: 'PENDING',
      requested_by_nama: kasirNama,
      telegram_chat_id: chatId,
    }).select('id').single();

    if (insErr || !inserted) {
      return NextResponse.json({ ok: false, msg: insErr?.message ?? 'Gagal simpan.' });
    }
    const requestId: number = (inserted as any).id;

    // Kalau outlet belum register grup Telegram, return sukses tapi warning
    if (!chatId) {
      return NextResponse.json({
        ok: true,
        id: requestId,
        notifSent: false,
        msg: `Transfer request #${requestId} tersimpan, tapi grup Telegram outlet ${outletName} belum terdaftar. Approval harus manual.`,
      });
    }

    // Build Telegram message
    const tipeLabel = { GADAI: 'Gadai Baru', TAMBAH: 'Tambah Pinjaman', SJB: 'SJB' }[body.tipe];
    const lines = [
      `*🏦 PERMINTAAN TRANSFER*`,
      ``,
      `*Outlet:* ${escapeMd(outletName)}`,
      `*Transaksi:* ${escapeMd(tipeLabel)} \\(${escapeMd(body.refNoFaktur)}\\)`,
    ];
    if (body.namaNasabah) lines.push(`*Nasabah:* ${escapeMd(body.namaNasabah)}`);
    if (body.barang) lines.push(`*Barang:* ${escapeMd(body.barang)}`);
    lines.push(``);
    lines.push(`*Nominal:* Rp ${formatRpMd(body.nominal)}`);
    lines.push(`*Penerima:* ${escapeMd(body.namaPenerima)}`);
    lines.push(`*No Rek:* \`${escapeMd(body.noRek)}\``);
    lines.push(`*Bank:* ${escapeMd(body.bank)}`);
    if (body.catatan) lines.push(`*Catatan:* ${escapeMd(body.catatan)}`);
    lines.push(``);
    lines.push(`_Diminta oleh:_ ${escapeMd(kasirNama)}`);
    lines.push(`_ID:_ \`TRF-${requestId}\``);

    const keyboard = inlineButtons([[
      { text: '✅ APPROVE', callback_data: `approve:TRF:${requestId}` },
      { text: '❌ REJECT', callback_data: `reject:TRF:${requestId}` },
    ]]);

    const sendRes = await sendTelegram(chatId, lines.join('\n'), {
      parseMode: 'MarkdownV2', replyMarkup: keyboard,
    });

    // Log outgoing
    db.from('telegram_log').insert({
      arah: 'OUT', chat_id: chatId,
      event: 'send_transfer_request',
      payload: { requestId, tipe: body.tipe, refNoFaktur: body.refNoFaktur, messageId: sendRes.messageId },
      error: sendRes.ok ? null : sendRes.error,
    }).then(() => {}, () => {});

    if (!sendRes.ok) {
      // Record tetap tersimpan, tapi notif gagal — kasir harus retry manual
      return NextResponse.json({
        ok: true, id: requestId, notifSent: false,
        msg: `Request tersimpan tapi notif Telegram gagal: ${sendRes.error ?? 'unknown'}`,
      });
    }

    // Update message_id
    if (sendRes.messageId) {
      await db.from('tb_transfer_request').update({
        telegram_message_id: sendRes.messageId,
      }).eq('id', requestId);
    }

    return NextResponse.json({
      ok: true, id: requestId, notifSent: true,
      messageId: sendRes.messageId,
    });
  } catch (err) {
    console.error('[transfer/request]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) });
  }
}
