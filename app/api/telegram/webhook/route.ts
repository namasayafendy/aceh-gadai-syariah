// ============================================================
// ACEH GADAI SYARIAH - Telegram Bot Webhook
// File: app/api/telegram/webhook/route.ts
//
// Endpoint yang dipanggil Telegram saat ada event baru di bot/grup.
// Divalidasi via header X-Telegram-Bot-Api-Secret-Token.
//
// Fase 1: handle /register, /whoami, /ping, /start
// Fase 2+: callback_query Approve/Reject, reply dengan foto bukti
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendTelegram, escapeMd, answerCallback } from '@/lib/telegram';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

export async function POST(request: NextRequest) {
  // ── 1. Validasi secret token ──
  const secret = request.headers.get(SECRET_HEADER);
  if (!process.env.TELEGRAM_WEBHOOK_SECRET || secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    console.warn('[telegram/webhook] invalid secret token');
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any;
  try {
    update = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 });
  }

  try {
    const db = await createServiceClient();

    // Log incoming event (best-effort, non-blocking)
    const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id ?? null;
    const fromUsername = update.message?.from?.username ?? update.callback_query?.from?.username ?? null;
    const fromUserId   = update.message?.from?.id       ?? update.callback_query?.from?.id       ?? null;
    let eventType = 'unknown';
    if (update.message)         eventType = update.message.text ? 'message' : (update.message.photo ? 'photo' : 'message_other');
    else if (update.callback_query)  eventType = 'callback';
    else if (update.my_chat_member)  eventType = 'chat_member';

    await db.from('telegram_log').insert({
      arah: 'IN',
      chat_id: chatId,
      from_username: fromUsername,
      from_user_id: fromUserId,
      event: eventType,
      payload: update,
    }).then(() => {}, () => {}); // fire & forget

    // ── Dispatch ──
    if (update.message) {
      await handleMessage(db, update.message);
    } else if (update.callback_query) {
      await handleCallback(db, update.callback_query);
    } else if (update.my_chat_member) {
      // Bot diundang/dikeluarkan dari grup — log saja
      console.log('[telegram] chat_member:', update.my_chat_member.new_chat_member?.status);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[telegram/webhook]', err);
    // Return 200 supaya Telegram tidak retry terus-menerus
    return NextResponse.json({ ok: false, msg: String(err) }, { status: 200 });
  }
}

// ── Message dispatcher ──
async function handleMessage(db: any, msg: any) {
  const chatId = msg.chat?.id;
  const text = String(msg.text || '').trim();
  const fromUsername = msg.from?.username;
  const fromUserId = msg.from?.id;

  // Auto-fill telegram_user_id ke approver saat username cocok
  if (fromUsername && fromUserId) {
    await db.from('telegram_approvers')
      .update({ telegram_user_id: fromUserId })
      .ilike('username', fromUsername)
      .is('telegram_user_id', null)
      .then(() => {}, () => {});
  }

  // ── Commands ──
  const cmd = text.split(/\s+/)[0].toLowerCase().split('@')[0]; // handle /cmd@botname
  const arg = text.substring(text.split(/\s+/)[0].length).trim();

  if (cmd === '/register') {
    return handleRegister(db, chatId, arg.toUpperCase(), msg);
  }
  if (cmd === '/whoami') {
    return sendTelegram(
      chatId,
      `*Info Anda*\n` +
      `• username: ${escapeMd(fromUsername ? '@' + fromUsername : '(tidak ada)')}\n` +
      `• user_id: \`${escapeMd(fromUserId ?? '-')}\`\n` +
      `• chat_id: \`${escapeMd(chatId)}\``,
      { parseMode: 'MarkdownV2' }
    );
  }
  if (cmd === '/ping') {
    return sendTelegram(chatId, 'pong', { parseMode: null });
  }
  if (cmd === '/start') {
    return sendTelegram(
      chatId,
      'Bot *Aceh Gadai Syariah* aktif\\.\n\n' +
      'Untuk daftarkan grup ini ke outlet:\n' +
      '`/register KODE-DARI-DASHBOARD`\n\n' +
      'Cek identitas Anda: `/whoami`',
      { parseMode: 'MarkdownV2' }
    );
  }

  // ── Photo reply (bukti transfer) — scaffold Fase 2 ──
  if (msg.photo && Array.isArray(msg.photo) && msg.reply_to_message) {
    // TODO Fase 2: cocokkan reply_to_message ke tb_transfer_request
    // berdasarkan telegram_message_id → download foto → upload Storage → update status
    console.log('[telegram] photo reply (Fase 2):',
      msg.reply_to_message.message_id,
      'photos:', msg.photo.length);
  }

  // Pesan lain di grup di-ignore
}

// ── /register KODE ──
async function handleRegister(db: any, chatId: number, kode: string, msg: any) {
  if (!kode) {
    return sendTelegram(
      chatId,
      escapeMd('Format: /register KODE-DARI-DASHBOARD'),
      { parseMode: 'MarkdownV2' }
    );
  }

  const { data: row } = await db.from('telegram_register_codes')
    .select('*').eq('kode', kode).maybeSingle();

  if (!row) {
    return sendTelegram(chatId,
      escapeMd('❌ Kode tidak ditemukan. Periksa kembali dari dashboard Owner.'),
      { parseMode: 'MarkdownV2' });
  }
  if (row.used_at) {
    return sendTelegram(chatId,
      escapeMd('❌ Kode sudah pernah dipakai. Generate kode baru di dashboard.'),
      { parseMode: 'MarkdownV2' });
  }
  if (new Date(row.expires_at) < new Date()) {
    return sendTelegram(chatId,
      escapeMd('❌ Kode sudah kedaluwarsa (lebih dari 15 menit). Generate kode baru.'),
      { parseMode: 'MarkdownV2' });
  }

  const groupTitle = msg.chat?.title ?? '(tanpa nama)';
  const username = msg.from?.username ?? '';

  // Simpan chat_id ke outlet
  const { error: upErr } = await db.from('outlets').update({
    telegram_chat_id: chatId,
    telegram_registered_at: new Date().toISOString(),
    telegram_group_title: groupTitle,
  }).eq('id', row.outlet_id);

  if (upErr) {
    return sendTelegram(chatId,
      escapeMd(`❌ Gagal simpan: ${upErr.message}`),
      { parseMode: 'MarkdownV2' });
  }

  // Tandai kode sudah dipakai
  await db.from('telegram_register_codes').update({
    used_at: new Date().toISOString(),
    used_by_chat_id: chatId,
    used_by_user: username,
  }).eq('kode', kode);

  // Ambil nama outlet untuk konfirmasi
  const { data: outlet } = await db.from('outlets').select('nama').eq('id', row.outlet_id).single();
  const outletName = (outlet as any)?.nama ?? `Outlet #${row.outlet_id}`;

  return sendTelegram(chatId,
    `✅ *Grup berhasil terdaftar*\n\n` +
    `Outlet: *${escapeMd(outletName)}*\n` +
    `Grup: ${escapeMd(groupTitle)}\n\n` +
    `Bot akan mengirim notifikasi *transfer* dan *diskon* ke grup ini\\.`,
    { parseMode: 'MarkdownV2' });
}

// ── Callback query handler (tap tombol inline) ──
async function handleCallback(db: any, cb: any) {
  // Scaffold untuk Fase 2 & 3 — untuk sekarang acknowledge saja
  await answerCallback(cb.id, 'Fitur ini akan aktif di update berikutnya', false);
}

// Telegram kadang kirim GET saat test endpoint
export async function GET() {
  return NextResponse.json({
    ok: true,
    msg: 'Telegram webhook endpoint (POST only)',
  });
}
