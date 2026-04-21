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
import {
  sendTelegram, escapeMd, answerCallback,
  editMessage, editMessageKeyboard, downloadTelegramFile, formatRpMd,
} from '@/lib/telegram';

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

  // ── Photo reply (bukti transfer) ──
  if (msg.photo && Array.isArray(msg.photo) && msg.reply_to_message) {
    return handlePhotoBukti(db, msg);
  }

  // Pesan lain di grup di-ignore
}

// ── Photo reply handler: bukti transfer ──
async function handlePhotoBukti(db: any, msg: any) {
  const chatId = msg.chat?.id;
  const replyToId = msg.reply_to_message?.message_id;
  const fromUsername = msg.from?.username ?? null;
  const fromUserId = msg.from?.id ?? null;

  if (!chatId || !replyToId) return;

  // Cari transfer request yang di-reply
  const { data: reqRow } = await db.from('tb_transfer_request')
    .select('*')
    .eq('telegram_chat_id', chatId)
    .eq('telegram_message_id', replyToId)
    .maybeSingle();

  if (!reqRow) return; // bukan reply ke pesan transfer request

  const req = reqRow as any;

  if (req.status === 'DONE') {
    return sendTelegram(chatId,
      escapeMd(`ℹ️ Bukti untuk TRF-${req.id} sudah pernah diupload.`),
      { parseMode: 'MarkdownV2', replyTo: msg.message_id });
  }
  if (req.status === 'REJECTED') {
    return sendTelegram(chatId,
      escapeMd(`⚠️ TRF-${req.id} sudah di-REJECT. Tidak bisa upload bukti.`),
      { parseMode: 'MarkdownV2', replyTo: msg.message_id });
  }
  if (req.status !== 'APPROVED') {
    return sendTelegram(chatId,
      escapeMd(`⚠️ TRF-${req.id} belum di-APPROVE. Tekan tombol APPROVE dulu sebelum upload bukti.`),
      { parseMode: 'MarkdownV2', replyTo: msg.message_id });
  }

  // Ambil photo ukuran terbesar (Telegram kirim beberapa size)
  const biggest = msg.photo.reduce((a: any, b: any) =>
    (a.file_size ?? 0) > (b.file_size ?? 0) ? a : b);
  const fileId: string = biggest?.file_id;
  if (!fileId) return;

  // Download dari Telegram
  const dl = await downloadTelegramFile(fileId);
  if (!dl) {
    return sendTelegram(chatId,
      escapeMd(`❌ Gagal download foto dari Telegram. Coba upload ulang.`),
      { parseMode: 'MarkdownV2', replyTo: msg.message_id });
  }

  // Upload ke Supabase Storage — reuse bucket 'backups'
  // Path: {outletName}/bukti-transfer/{yyyy-MM}/TRF-{id}_{stamp}.jpg
  const { data: outlet } = await db.from('outlets')
    .select('nama').eq('id', req.outlet_id).single();
  const outletName = ((outlet as any)?.nama ?? `outlet-${req.outlet_id}`)
    .toString().replace(/[^A-Za-z0-9_-]/g, '_').toUpperCase();
  const ym = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).substring(0, 7);
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jakarta' })
    .replace(/[: ]/g, '').replace(/-/g, '').substring(0, 13);
  // Derive MIME dari filePath Telegram (reliable) — bukan dari header content-type
  // (Telegram file server kadang return application/octet-stream yg ditolak Supabase storage).
  // msg.photo dari Telegram selalu image (JPEG default); fallback jpg.
  const tgPath = String(dl.filePath ?? '').toLowerCase();
  const ext = tgPath.endsWith('.png')  ? 'png'
            : tgPath.endsWith('.webp') ? 'webp'
            : 'jpg';
  const mimeByExt: Record<string, string> = {
    png:  'image/png',
    webp: 'image/webp',
    jpg:  'image/jpeg',
  };
  const safeContentType = mimeByExt[ext];
  const path = `${outletName}/bukti-transfer/${ym}/TRF-${req.id}_${stamp}.${ext}`;

  const { error: upErr } = await db.storage.from('backups')
    .upload(path, Buffer.from(dl.buffer), { contentType: safeContentType, upsert: true });
  if (upErr) {
    return sendTelegram(chatId,
      escapeMd(`❌ Gagal simpan bukti: ${upErr.message}`),
      { parseMode: 'MarkdownV2', replyTo: msg.message_id });
  }

  // Update record → DONE
  await db.from('tb_transfer_request').update({
    status: 'DONE',
    bukti_file_id: fileId,
    bukti_storage_path: path,
    bukti_uploaded_at: new Date().toISOString(),
    bukti_uploaded_by_username: fromUsername,
  }).eq('id', req.id);

  // Edit pesan utama → status DONE
  try {
    const doneMsg =
      `*✅ TRANSFER SELESAI*\n` +
      `\n` +
      `*TRF\\-${req.id}* \\| ${escapeMd(req.tipe)} ${escapeMd(req.ref_no_faktur ?? '')}\n` +
      `Nominal: Rp ${formatRpMd(Number(req.nominal))}\n` +
      `Ke: ${escapeMd(req.nama_penerima)} \\(${escapeMd(req.bank)} ${escapeMd(req.no_rek)}\\)\n` +
      `\n` +
      `_Bukti diupload oleh:_ ${escapeMd(fromUsername ? '@' + fromUsername : '(anon)')}\n` +
      `_Waktu:_ ${escapeMd(new Date().toLocaleString('id-ID'))}`;
    await editMessage(chatId, replyToId, doneMsg, { parseMode: 'MarkdownV2' });
    await editMessageKeyboard(chatId, replyToId, { inline_keyboard: [] });
  } catch (e) {
    console.error('[telegram] editMessage DONE failed:', e);
  }

  // Reply konfirmasi
  return sendTelegram(chatId,
    `✅ *Bukti tersimpan* untuk TRF\\-${req.id}`,
    { parseMode: 'MarkdownV2', replyTo: msg.message_id });
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
  const data: string = cb.data ?? '';
  const parts = data.split(':');
  const action = parts[0]; // 'approve' | 'reject'
  const kind = parts[1];   // 'TRF' | (future: 'DSC')
  const idNum = Number(parts[2] ?? 0);

  const fromUsername: string | null = cb.from?.username ?? null;
  const fromUserId: number | null = cb.from?.id ?? null;

  // Auto-fill telegram_user_id di approvers (case-insensitive match by username)
  if (fromUsername && fromUserId) {
    await db.from('telegram_approvers')
      .update({ telegram_user_id: fromUserId })
      .ilike('username', fromUsername)
      .is('telegram_user_id', null)
      .then(() => {}, () => {});
  }

  // Validate approver: username (case-insensitive) atau user_id cocok, active=true
  let isApprover = false;
  if (fromUserId) {
    const { data: byId } = await db.from('telegram_approvers')
      .select('id, nama, active').eq('telegram_user_id', fromUserId).maybeSingle();
    if (byId && (byId as any).active) isApprover = true;
  }
  if (!isApprover && fromUsername) {
    const { data: byName } = await db.from('telegram_approvers')
      .select('id, nama, active').ilike('username', fromUsername).maybeSingle();
    if (byName && (byName as any).active) isApprover = true;
  }
  if (!isApprover) {
    return answerCallback(cb.id, '❌ Anda bukan approver. Hubungi Owner.', true);
  }

  // ── Transfer request approve/reject ──
  if (kind === 'TRF' && idNum > 0 && (action === 'approve' || action === 'reject')) {
    return handleTransferDecision(db, cb, idNum, action, fromUsername, fromUserId);
  }

  return answerCallback(cb.id, 'Fitur belum tersedia', false);
}

async function handleTransferDecision(
  db: any, cb: any, requestId: number,
  action: 'approve' | 'reject',
  fromUsername: string | null,
  fromUserId: number | null,
) {
  const chatId = cb.message?.chat?.id;
  const messageId = cb.message?.message_id;

  const { data: reqRow } = await db.from('tb_transfer_request')
    .select('*').eq('id', requestId).maybeSingle();
  if (!reqRow) {
    return answerCallback(cb.id, `❌ Request TRF-${requestId} tidak ditemukan.`, true);
  }
  const req = reqRow as any;

  if (req.status !== 'PENDING') {
    return answerCallback(cb.id,
      `ℹ️ Request sudah diproses (${req.status}).`, true);
  }

  const nowIso = new Date().toISOString();
  const approverTag = fromUsername ? `@${fromUsername}` : `(user ${fromUserId})`;

  if (action === 'approve') {
    await db.from('tb_transfer_request').update({
      status: 'APPROVED',
      approved_by_username: fromUsername,
      approved_by_user_id: fromUserId,
      approved_at: nowIso,
    }).eq('id', requestId);

    // Update last_action_at di approver
    if (fromUserId) {
      await db.from('telegram_approvers').update({ last_action_at: nowIso })
        .eq('telegram_user_id', fromUserId).then(() => {}, () => {});
    }

    const body =
      `*✅ TRANSFER DI\\-APPROVE*\n\n` +
      `*TRF\\-${req.id}* \\| ${escapeMd(req.tipe)} ${escapeMd(req.ref_no_faktur ?? '')}\n` +
      `Nominal: Rp ${formatRpMd(Number(req.nominal))}\n` +
      `Ke: ${escapeMd(req.nama_penerima)} \\(${escapeMd(req.bank)} ${escapeMd(req.no_rek)}\\)\n\n` +
      `_Disetujui oleh:_ ${escapeMd(approverTag)}\n` +
      `_Waktu:_ ${escapeMd(new Date().toLocaleString('id-ID'))}\n\n` +
      `📸 *Upload foto bukti dengan REPLY ke pesan ini\\.*`;

    try {
      if (chatId && messageId) {
        await editMessage(chatId, messageId, body, { parseMode: 'MarkdownV2' });
        await editMessageKeyboard(chatId, messageId, { inline_keyboard: [] });
      }
    } catch (e) {
      console.error('[telegram] editMessage APPROVED failed:', e);
    }

    return answerCallback(cb.id, '✅ Transfer di-approve. Silakan transfer lalu reply foto bukti.', false);
  }

  // REJECT
  await db.from('tb_transfer_request').update({
    status: 'REJECTED',
    rejected_by_username: fromUsername,
    rejected_by_user_id: fromUserId,
    rejected_at: nowIso,
  }).eq('id', requestId);

  if (fromUserId) {
    await db.from('telegram_approvers').update({ last_action_at: nowIso })
      .eq('telegram_user_id', fromUserId).then(() => {}, () => {});
  }

  const body =
    `*❌ TRANSFER DI\\-REJECT*\n\n` +
    `*TRF\\-${req.id}* \\| ${escapeMd(req.tipe)} ${escapeMd(req.ref_no_faktur ?? '')}\n` +
    `Nominal: Rp ${formatRpMd(Number(req.nominal))}\n` +
    `Ke: ${escapeMd(req.nama_penerima)} \\(${escapeMd(req.bank)} ${escapeMd(req.no_rek)}\\)\n\n` +
    `_Ditolak oleh:_ ${escapeMd(approverTag)}\n` +
    `_Waktu:_ ${escapeMd(new Date().toLocaleString('id-ID'))}`;

  try {
    if (chatId && messageId) {
      await editMessage(chatId, messageId, body, { parseMode: 'MarkdownV2' });
      await editMessageKeyboard(chatId, messageId, { inline_keyboard: [] });
    }
  } catch (e) {
    console.error('[telegram] editMessage REJECTED failed:', e);
  }

  return answerCallback(cb.id, '❌ Transfer di-reject.', false);
}

// Telegram kadang kirim GET saat test endpoint
export async function GET() {
  return NextResponse.json({
    ok: true,
    msg: 'Telegram webhook endpoint (POST only)',
  });
}
