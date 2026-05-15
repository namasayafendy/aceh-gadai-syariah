// ============================================================
// File: lib/wa/admin-notif.ts
//
// Helper untuk kirim notif Telegram ke grup admin.
// Resolve chat_id dari app_settings, fallback ke laporan_malam_chat_id.
// ============================================================

import { sendTelegram } from '@/lib/telegram';

export async function resolveAdminChatId(
  db: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>,
): Promise<string | null> {
  const { data: wa } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'wa_admin_chat_id')
    .maybeSingle();
  const waId = (wa as any)?.value;
  if (waId) return String(waId);

  const { data: fallback } = await db
    .from('app_settings')
    .select('value')
    .eq('key', 'laporan_malam_chat_id')
    .maybeSingle();
  return (fallback as any)?.value ? String((fallback as any).value) : null;
}

export async function sendAdminTelegram(
  db: Awaited<ReturnType<typeof import('@/lib/supabase/server').createServiceClient>>,
  text: string,
  parseMode: 'MarkdownV2' | 'HTML' | null = 'MarkdownV2',
): Promise<{ ok: boolean; error?: string }> {
  const chatId = await resolveAdminChatId(db);
  if (!chatId) {
    return { ok: false, error: 'admin chat_id belum di-set (wa_admin_chat_id / laporan_malam_chat_id)' };
  }
  try {
    const res = await sendTelegram(chatId, text, { parseMode });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
