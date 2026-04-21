// ============================================================
// ACEH GADAI SYARIAH - Diskon Approval Request (Fase 3)
// File: app/api/diskon/request/route.ts
//
// POST: kasir submit request approval diskon SEBELUM transaksi
//       tebus/buyback disimpan. Kirim notif + inline buttons ke
//       grup Telegram outlet.
//
// CATATAN PENTING:
// - Alur kas TIDAK disentuh. Endpoint ini hanya insert tb_diskon
//   dengan status='PENDING'. Insert tb_tebus / tb_kas tetap di
//   /api/tebus/submit (dan /api/sjb/buyback) yang dipanggil
//   SETELAH kasir tekan "Lanjutkan" pasca-approved.
// - Threshold ≥ Rp 10.000 (selaras dengan /api/tebus/submit baris
//   `selisih > 9000`).
// - Pesan legacy `approved` text default 'N' di tb_diskon TIDAK
//   disentuh — Fase 3 pakai kolom `status` yang terpisah.
// - Multi-outlet via header x-outlet-id, sama seperti endpoint
//   /api/transfer/request.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { safeGetNextId } from '@/lib/db/counter';
import { sendTelegram, inlineButtons, escapeMd, formatRpMd } from '@/lib/telegram';

type StatusTebus = 'TEBUS' | 'PERPANJANG' | 'TAMBAH' | 'KURANG' | 'BUYBACK' | 'PERPANJANG_SJB' | 'SITA';

interface Body {
  pin: string;
  tipe: 'TEBUS' | 'SJB';               // TEBUS = dari form tebus gadai, SJB = dari buyback SJB
  statusTebus: StatusTebus;            // isi kolom tb_diskon.status_tebus
  refNoFaktur: string;                 // SBR-... atau SJB-...
  idRef?: string;                      // idGadai / idSjb (untuk log)
  namaNasabah: string;
  barang?: string;                     // display di notif
  jumlahPinjaman: number;
  ujrahBerjalan: number;
  lamaTitip: number;                   // hari aktual / lama gadai
  totalSeharusnya: number;
  jumlahBayar: number;
  alasan: string;
  idParent?: string;                   // jika resubmit setelah reject
}

const THRESHOLD = 10000;

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();

    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '0', 10);
    if (!outletId) {
      return NextResponse.json({ ok: false, msg: 'Outlet ID wajib (header x-outlet-id).' });
    }

    const body: Body = await request.json().catch(() => ({}) as Body);
    if (!body.pin) return NextResponse.json({ ok: false, msg: 'PIN wajib.' });
    if (!body.tipe || !['TEBUS', 'SJB'].includes(body.tipe)) {
      return NextResponse.json({ ok: false, msg: 'Tipe tidak valid.' });
    }
    if (!body.statusTebus) return NextResponse.json({ ok: false, msg: 'Status transaksi wajib.' });
    if (!body.refNoFaktur) return NextResponse.json({ ok: false, msg: 'No faktur wajib.' });
    if (!body.namaNasabah) return NextResponse.json({ ok: false, msg: 'Nama nasabah wajib.' });
    if (!body.alasan || body.alasan.trim().replace(/\s+/g, '').length < 2) {
      return NextResponse.json({ ok: false, msg: 'Alasan diskon wajib diisi (min 2 karakter).' });
    }

    const totalSistem = Number(body.totalSeharusnya || 0);
    const bayar = Number(body.jumlahBayar || 0);
    const selisih = totalSistem - bayar;

    if (selisih < THRESHOLD) {
      // Tidak perlu approval — kasir boleh langsung submit transaksi.
      return NextResponse.json({
        ok: true,
        needApproval: false,
        msg: `Diskon Rp ${selisih.toLocaleString('id-ID')} < threshold Rp ${THRESHOLD.toLocaleString('id-ID')} — tidak perlu approval.`,
      });
    }

    // ── Validate PIN ─────────────────────────────────────────
    const { data: pinRes } = await db.rpc('validate_pin', {
      p_pin: body.pin.trim(), p_outlet_id: outletId,
    });
    if (!pinRes?.ok) {
      return NextResponse.json({ ok: false, msg: pinRes?.msg ?? 'PIN salah.' });
    }
    const kasirNama: string = pinRes.nama ?? 'Kasir';

    // ── Ambil info outlet (nama + telegram chat_id) ──────────
    const { data: outlet } = await db.from('outlets')
      .select('id, nama, telegram_chat_id')
      .eq('id', outletId)
      .single();
    if (!outlet) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName: string = (outlet as any).nama;
    const chatId: number | null = (outlet as any).telegram_chat_id ?? null;

    // ── Generate ID Diskon (pakai counter existing 'DISKON') ─
    const idDiskon = await safeGetNextId(db, 'DISKON', outletId);

    const now = new Date();

    // ── Insert tb_diskon row status='PENDING' ────────────────
    // Catatan: kolom lama tetap diisi (no_faktur, nama_nasabah, dst)
    // supaya kompatibel dengan laporan lama. id_tebus diisi null —
    // baru diisi saat /api/tebus/submit finalisasi (status='DONE').
    const { error: insErr } = await db.from('tb_diskon').insert({
      id_diskon:            idDiskon,
      tgl:                  now.toISOString(),
      no_faktur:            body.refNoFaktur,
      id_tebus:             null,
      nama_nasabah:         body.namaNasabah,
      jumlah_pinjaman:      Number(body.jumlahPinjaman || 0),
      ujrah_berjalan:       Number(body.ujrahBerjalan || 0),
      lama_titip:           Number(body.lamaTitip || 0),
      total_seharusnya:     totalSistem,
      besaran_potongan:     selisih,
      total_setelah_diskon: bayar,
      alasan:               body.alasan.trim(),
      status_tebus:         body.statusTebus,
      kasir:                kasirNama,
      outlet:               outletName,
      // ── Kolom approval Fase 3 ──
      status:               'PENDING',
      id_parent:            body.idParent ?? null,
      outlet_id:            outletId,
      lama_gadai_hari:      Number(body.lamaTitip || 0),
      requested_by_nama:    kasirNama,
      requested_at:         now.toISOString(),
      telegram_chat_id:     chatId,
    });

    if (insErr) {
      return NextResponse.json({ ok: false, msg: insErr.message ?? 'Gagal simpan tb_diskon.' });
    }

    // Kalau outlet belum register grup Telegram → tetap tersimpan, tapi
    // approval harus manual (mirror behavior /api/transfer/request).
    if (!chatId) {
      return NextResponse.json({
        ok: true,
        needApproval: true,
        idDiskon,
        notifSent: false,
        msg: `Request diskon ${idDiskon} tersimpan, tapi grup Telegram outlet ${outletName} belum terdaftar. Approval harus manual.`,
      });
    }

    // ── Build Telegram message ───────────────────────────────
    const tipeLabel = body.tipe === 'SJB' ? 'Buyback SJB' : 'Tebus';
    const statusLabel = body.statusTebus === 'PERPANJANG_SJB'
      ? 'Perpanjang SJB'
      : body.statusTebus;
    const pctStr = totalSistem > 0
      ? ((selisih / totalSistem) * 100).toFixed(1).replace('.', ',')
      : '0';

    const lines: string[] = [
      `*💸 PERMINTAAN DISKON*`,
      ``,
      `*Outlet:* ${escapeMd(outletName)}`,
      `*Transaksi:* ${escapeMd(tipeLabel)} \\(${escapeMd(statusLabel)}\\)`,
      `*No Faktur:* ${escapeMd(body.refNoFaktur)}`,
    ];
    if (body.idParent) {
      lines.push(`*Resubmit dari:* ${escapeMd(body.idParent)}`);
    }
    lines.push(`*Nasabah:* ${escapeMd(body.namaNasabah)}`);
    if (body.barang) lines.push(`*Barang:* ${escapeMd(body.barang)}`);
    lines.push(``);
    lines.push(`*Pinjaman:* Rp ${formatRpMd(Number(body.jumlahPinjaman || 0))}`);
    lines.push(`*Ujrah berjalan:* Rp ${formatRpMd(Number(body.ujrahBerjalan || 0))}`);
    lines.push(`*Lama gadai:* ${escapeMd(String(Number(body.lamaTitip || 0)))} hari`);
    lines.push(``);
    lines.push(`*Total sistem:* Rp ${formatRpMd(totalSistem)}`);
    lines.push(`*Bayar nasabah:* Rp ${formatRpMd(bayar)}`);
    lines.push(`*Diskon:* Rp ${formatRpMd(selisih)} \\(${escapeMd(pctStr)}%\\)`);
    lines.push(``);
    lines.push(`*Alasan:* ${escapeMd(body.alasan.trim())}`);
    lines.push(``);
    lines.push(`_Diminta oleh:_ ${escapeMd(kasirNama)}`);
    lines.push(`_ID:_ \`${escapeMd(idDiskon)}\``);

    const keyboard = inlineButtons([[
      { text: '✅ APPROVE', callback_data: `approve:DSK:${idDiskon}` },
      { text: '❌ REJECT',  callback_data: `reject:DSK:${idDiskon}` },
    ]]);

    const sendRes = await sendTelegram(chatId, lines.join('\n'), {
      parseMode: 'MarkdownV2', replyMarkup: keyboard,
    });

    // Log outgoing (best effort)
    db.from('telegram_log').insert({
      arah: 'OUT', chat_id: chatId,
      event: 'send_diskon_request',
      payload: { idDiskon, tipe: body.tipe, statusTebus: body.statusTebus, refNoFaktur: body.refNoFaktur, selisih, messageId: sendRes.messageId },
      error: sendRes.ok ? null : sendRes.error,
    }).then(() => {}, () => {});

    if (!sendRes.ok) {
      // Row tetap tersimpan PENDING, tapi notif gagal — kasir harus retry manual
      return NextResponse.json({
        ok: true, needApproval: true, idDiskon, notifSent: false,
        msg: `Request tersimpan tapi notif Telegram gagal: ${sendRes.error ?? 'unknown'}`,
      });
    }

    // Simpan message_id
    if (sendRes.messageId) {
      await db.from('tb_diskon').update({
        telegram_message_id: sendRes.messageId,
      }).eq('id_diskon', idDiskon);
    }

    return NextResponse.json({
      ok: true, needApproval: true, idDiskon,
      notifSent: true, messageId: sendRes.messageId,
    });
  } catch (err) {
    console.error('[diskon/request]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) });
  }
}
