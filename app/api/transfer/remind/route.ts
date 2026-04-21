// ============================================================
// ACEH GADAI SYARIAH - Transfer Reminder Cron (Fase 2+)
// File: app/api/transfer/remind/route.ts
//
// Dipanggil Vercel Cron tiap menit. Scan semua PENDING transfer
// request yang sudah punya telegram_chat_id + telegram_message_id,
// lalu kirim reminder ke grup supaya tidak terlewat.
//
// Guardrails:
// - Dilindungi CRON_SECRET (Authorization: Bearer <secret>).
// - Reminder di-reply ke pesan asli supaya thread tetap rapi.
// - Reminder berhenti otomatis kalau status sudah APPROVED/REJECTED
//   (karena query memang hanya scan status='PENDING').
// - Burst (kirim ulang dalam 1 invocation) bisa diatur via env
//   REMINDER_BURST_PER_MINUTE (default 1, max 10).
// - TIDAK mengubah alur kas.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendTelegram, inlineButtons, escapeMd, formatRpMd } from '@/lib/telegram';

// Vercel Hobby plan serverless timeout default 10s; minta 60s karena burst loop.
export const maxDuration = 60;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

type PendingRow = {
  id: number;
  outlet_id: number;
  tipe: 'GADAI' | 'TAMBAH' | 'SJB';
  ref_no_faktur: string | null;
  nominal: number;
  nama_penerima: string;
  no_rek: string;
  bank: string;
  catatan: string | null;
  requested_by_nama: string;
  requested_at: string;
  telegram_chat_id: number | null;
  telegram_message_id: number | null;
  reminder_count: number | null;
};

const TIPE_LABEL: Record<string, string> = {
  GADAI: 'Gadai',
  TAMBAH: 'Tambah Pinjaman',
  SJB: 'SJB',
};

async function sendReminderSweep(db: ReturnType<typeof createServiceClient> extends Promise<infer T> ? T : never) {
  // Urut: yang paling lama belum di-remind / belum pernah di-remind duluan.
  const { data: rows, error } = await db
    .from('tb_transfer_request')
    .select('id, outlet_id, tipe, ref_no_faktur, nominal, nama_penerima, no_rek, bank, catatan, requested_by_nama, requested_at, telegram_chat_id, telegram_message_id, reminder_count')
    .eq('status', 'PENDING')
    .not('telegram_chat_id', 'is', null)
    .order('last_reminder_at', { ascending: true, nullsFirst: true })
    .order('requested_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[transfer/remind] query error', error);
    return { sent: 0, pending: 0, error: error.message };
  }
  if (!rows?.length) return { sent: 0, pending: 0 };

  const pendingRows = rows as PendingRow[];

  // Cache nama outlet agar tidak query berulang
  const outletCache: Record<number, string> = {};
  async function getOutletName(id: number): Promise<string> {
    if (outletCache[id]) return outletCache[id];
    const { data } = await db.from('outlets').select('nama').eq('id', id).single();
    const nm = ((data as any)?.nama as string) || `Outlet-${id}`;
    outletCache[id] = nm;
    return nm;
  }

  let sent = 0;
  for (const req of pendingRows) {
    if (!req.telegram_chat_id) continue;

    const outletName = await getOutletName(req.outlet_id);
    const tipeLabel = TIPE_LABEL[req.tipe] ?? req.tipe;
    const ageMs = Date.now() - new Date(req.requested_at).getTime();
    const ageMin = Math.max(0, Math.round(ageMs / 60000));

    const lines = [
      `*⏰ REMINDER: Transfer Pending*`,
      ``,
      `*Outlet:* ${escapeMd(outletName)}`,
      `*${escapeMd(tipeLabel)}:* ${escapeMd(req.ref_no_faktur ?? '-')}`,
      `*Nominal:* Rp ${formatRpMd(req.nominal)}`,
      `*Penerima:* ${escapeMd(req.nama_penerima)} \\(${escapeMd(req.bank)}\\)`,
      `*No Rek:* \`${escapeMd(req.no_rek)}\``,
    ];
    if (req.catatan) lines.push(`*Catatan:* ${escapeMd(req.catatan)}`);
    lines.push(``);
    lines.push(`_Menunggu approval ${escapeMd(String(ageMin))} menit\\._`);
    lines.push(`_Reminder ke\\-${escapeMd(String((req.reminder_count ?? 0) + 1))} \\| ID:_ \`TRF\\-${req.id}\``);

    const keyboard = inlineButtons([[
      { text: '✅ APPROVE', callback_data: `approve:TRF:${req.id}` },
      { text: '❌ REJECT', callback_data: `reject:TRF:${req.id}` },
    ]]);

    const sendRes = await sendTelegram(req.telegram_chat_id, lines.join('\n'), {
      parseMode: 'MarkdownV2',
      replyMarkup: keyboard,
      replyTo: req.telegram_message_id ?? undefined,
    });

    if (sendRes.ok) {
      sent++;
      await db.from('tb_transfer_request').update({
        last_reminder_at: new Date().toISOString(),
        reminder_count: (req.reminder_count ?? 0) + 1,
      }).eq('id', req.id);

      // Log ke telegram_log (best effort)
      db.from('telegram_log').insert({
        arah: 'OUT',
        chat_id: req.telegram_chat_id,
        event: 'send_transfer_reminder',
        payload: { requestId: req.id, tipe: req.tipe, refNoFaktur: req.ref_no_faktur, messageId: sendRes.messageId, reminderCount: (req.reminder_count ?? 0) + 1 },
        error: null,
      }).then(() => {}, () => {});
    } else {
      db.from('telegram_log').insert({
        arah: 'OUT',
        chat_id: req.telegram_chat_id,
        event: 'send_transfer_reminder',
        payload: { requestId: req.id, tipe: req.tipe, refNoFaktur: req.ref_no_faktur },
        error: sendRes.error ?? 'unknown',
      }).then(() => {}, () => {});
    }

    // Jeda kecil antar outlet supaya tidak kena rate-limit Telegram
    await sleep(200);
  }

  return { sent, pending: pendingRows.length };
}

async function handle(request: NextRequest) {
  const auth = request.headers.get('authorization');
  // Vercel Cron mengirim Authorization: Bearer <CRON_SECRET>
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await createServiceClient();

    // Berapa kali burst dalam 1 invocation (default 1, max 10).
    // Kalau mau 10x/menit: set env REMINDER_BURST_PER_MINUTE=10 di Vercel.
    const rawBurst = parseInt(process.env.REMINDER_BURST_PER_MINUTE ?? '1', 10);
    const burst = Math.min(10, Math.max(1, isNaN(rawBurst) ? 1 : rawBurst));
    // Total 55 detik supaya aman dari maxDuration=60
    const gap = burst > 1 ? Math.floor(55000 / burst) : 0;

    let totalSent = 0;
    let lastPending = 0;
    for (let i = 0; i < burst; i++) {
      const r = await sendReminderSweep(db);
      totalSent += r.sent;
      lastPending = r.pending;
      if (r.pending === 0) break;           // tidak ada PENDING, stop
      if (i < burst - 1) await sleep(gap);  // tunggu sampai sweep berikutnya
    }

    return NextResponse.json({ ok: true, totalSent, pending: lastPending, burst });
  } catch (err) {
    console.error('[transfer/remind]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }
