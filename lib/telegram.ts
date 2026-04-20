// ============================================================
// ACEH GADAI SYARIAH - Telegram Bot Helper
// File: lib/telegram.ts
//
// Server-side helpers untuk kirim pesan, edit pesan, handle callback,
// dan download foto via Telegram Bot API.
//
// Token dibaca dari env TELEGRAM_BOT_TOKEN — JANGAN commit token!
// ============================================================

const API_BASE = 'https://api.telegram.org/bot';

function getToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error('TELEGRAM_BOT_TOKEN env var belum di-set');
  return t;
}

async function tgCall(method: string, payload: Record<string, unknown>): Promise<any> {
  const token = getToken();
  try {
    const res = await fetch(`${API_BASE}${token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!json.ok) {
      console.error(`[telegram] ${method} failed:`, json.description);
    }
    return json;
  } catch (err) {
    console.error(`[telegram] ${method} network error:`, err);
    return { ok: false, description: String(err) };
  }
}

// ── Escape text untuk MarkdownV2 (mode parse paling strict di Telegram) ──
// chars yang perlu di-escape: _ * [ ] ( ) ~ ` > # + - = | { } . !
export function escapeMd(s: string | number | null | undefined): string {
  if (s === null || s === undefined) return '';
  return String(s).replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

// ── Format Rupiah untuk pesan Telegram (tanpa prefix 'Rp') ──
export function formatRpMd(n: number | null | undefined): string {
  const num = Number(n || 0);
  return escapeMd(num.toLocaleString('id-ID'));
}

export interface SendMessageOptions {
  parseMode?: 'MarkdownV2' | 'HTML' | 'Markdown' | null;
  replyMarkup?: unknown;
  replyTo?: number;
  disableNotification?: boolean;
}

export interface SendMessageResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

export async function sendTelegram(
  chatId: number | string,
  text: string,
  options: SendMessageOptions = {}
): Promise<SendMessageResult> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    text,
    disable_notification: options.disableNotification ?? false,
  };
  if (options.parseMode) payload.parse_mode = options.parseMode;
  else if (options.parseMode !== null) payload.parse_mode = 'MarkdownV2';
  if (options.replyMarkup) payload.reply_markup = options.replyMarkup;
  if (options.replyTo) payload.reply_to_message_id = options.replyTo;

  const res = await tgCall('sendMessage', payload);
  if (!res.ok) return { ok: false, error: res.description };
  return { ok: true, messageId: res.result?.message_id };
}

export async function editMessage(
  chatId: number | string,
  messageId: number,
  text: string,
  options: Pick<SendMessageOptions, 'parseMode' | 'replyMarkup'> = {}
): Promise<any> {
  const payload: Record<string, unknown> = {
    chat_id: chatId,
    message_id: messageId,
    text,
  };
  if (options.parseMode !== null) payload.parse_mode = options.parseMode ?? 'MarkdownV2';
  if (options.replyMarkup) payload.reply_markup = options.replyMarkup;
  return tgCall('editMessageText', payload);
}

export async function editMessageKeyboard(
  chatId: number | string,
  messageId: number,
  replyMarkup: unknown
): Promise<any> {
  return tgCall('editMessageReplyMarkup', {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup,
  });
}

export async function answerCallback(
  callbackQueryId: string,
  text?: string,
  showAlert = false
): Promise<any> {
  return tgCall('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    text,
    show_alert: showAlert,
  });
}

// ── File download (untuk bukti transfer foto) ──
export async function getFileUrl(fileId: string): Promise<string | null> {
  const res = await tgCall('getFile', { file_id: fileId });
  if (!res.ok) return null;
  const path = res.result?.file_path;
  if (!path) return null;
  return `https://api.telegram.org/file/bot${getToken()}/${path}`;
}

export async function downloadTelegramFile(fileId: string): Promise<
  { buffer: ArrayBuffer; contentType: string; filePath: string } | null
> {
  const res = await tgCall('getFile', { file_id: fileId });
  if (!res.ok) return null;
  const filePath = res.result?.file_path;
  if (!filePath) return null;

  const url = `https://api.telegram.org/file/bot${getToken()}/${filePath}`;
  const fileRes = await fetch(url);
  if (!fileRes.ok) return null;

  const buffer = await fileRes.arrayBuffer();
  const contentType = fileRes.headers.get('content-type') || 'image/jpeg';
  return { buffer, contentType, filePath };
}

// ── Inline keyboard builder ──
export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export function inlineButtons(rows: InlineButton[][]) {
  return { inline_keyboard: rows };
}

// ── Webhook management (dipanggil saat setup awal) ──
export async function setWebhook(url: string, secretToken?: string): Promise<any> {
  return tgCall('setWebhook', {
    url,
    secret_token: secretToken,
    allowed_updates: ['message', 'callback_query', 'my_chat_member'],
    drop_pending_updates: true,
  });
}

export async function deleteWebhook(): Promise<any> {
  return tgCall('deleteWebhook', { drop_pending_updates: true });
}

export async function getWebhookInfo(): Promise<any> {
  return tgCall('getWebhookInfo', {});
}

export async function getMe(): Promise<any> {
  return tgCall('getMe', {});
}
