// ============================================================
// File: app/api/wa/cron-stale-alert/route.ts
//
// CRON tiap jam (atau 30 menit) — cek incoming WA yang stale:
//   state=NEW + alerted_telegram=FALSE + business hours elapsed > 4 jam
//
// Untuk yang stale, kirim notif Telegram ke admin sekali (set
// alerted_telegram=TRUE supaya tidak double).
//
// Schedule (vercel.json): "0 * * * *" = tiap jam (top of hour)
// Dilindungi CRON_SECRET (header Authorization: Bearer <secret>)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendAdminTelegram } from '@/lib/wa/admin-notif';
import { escapeMd } from '@/lib/telegram';

export const maxDuration = 60;

const STALE_HOURS = 4;
const WORK_START = 10; // 10:00 WIB
const WORK_END = 21;   // 21:00 WIB

function unauthorized() {
  return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
}

/**
 * Hitung jam kerja yang berlalu sejak receivedAt sampai sekarang.
 * Hanya hitung 10:00-21:00 WIB.
 */
function businessHoursElapsed(receivedAt: Date, now: Date): number {
  const tzOffset = 7;
  const receivedWib = new Date(receivedAt.getTime() + tzOffset * 3600 * 1000);
  const nowWib = new Date(now.getTime() + tzOffset * 3600 * 1000);

  let total = 0;
  const cursor = new Date(receivedWib);
  while (cursor < nowWib) {
    const dayStart = new Date(cursor);
    dayStart.setUTCHours(WORK_START, 0, 0, 0);
    const dayEnd = new Date(cursor);
    dayEnd.setUTCHours(WORK_END, 0, 0, 0);

    const intervalStart = cursor > dayStart ? cursor : dayStart;
    const intervalEnd = nowWib < dayEnd ? nowWib : dayEnd;

    if (intervalEnd > intervalStart) {
      total += (intervalEnd.getTime() - intervalStart.getTime()) / 3600000;
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    cursor.setUTCHours(0, 0, 0, 0);
  }
  return total;
}

async function runJob() {
  const db = await createServiceClient();
  const now = new Date();

  // Ambil incoming NEW yang belum di-alert dari 48 jam terakhir
  const since48h = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const { data: candidates } = await db
    .from('tb_wa_incoming')
    .select('id, outlet_id, nomor_pengirim, nama_nasabah, no_faktur, message_body, received_at')
    .eq('state', 'NEW')
    .eq('alerted_telegram', false)
    .gte('received_at', since48h);

  const stale: any[] = [];
  for (const r of (candidates ?? []) as any[]) {
    const elapsed = businessHoursElapsed(new Date(r.received_at), now);
    if (elapsed >= STALE_HOURS) {
      stale.push({ ...r, elapsedHours: elapsed });
    }
  }

  if (stale.length === 0) {
    return { ok: true, scanned: candidates?.length ?? 0, alerted: 0 };
  }

  // Resolve outlet name map
  const outletIds = Array.from(new Set(stale.map((s) => Number(s.outlet_id)).filter(Boolean)));
  const { data: outlets } = await db
    .from('outlets')
    .select('id, nama')
    .in('id', outletIds.length > 0 ? outletIds : [0]);
  const outletNameMap: Record<number, string> = {};
  for (const o of outlets ?? []) outletNameMap[(o as any).id] = (o as any).nama;

  // Compose 1 message dengan semua stale (efisien, tidak spam)
  let body = `⚠️ *${stale.length} balasan WA belum di\\-respond kasir*\n\n`;
  for (const s of stale.slice(0, 20)) { // cap 20 supaya pesan tidak terlalu panjang
    const outletName = outletNameMap[Number(s.outlet_id)] ?? '?';
    const elapsed = Math.round(s.elapsedHours * 10) / 10;
    const preview =
      String(s.message_body || '').length > 80
        ? String(s.message_body).slice(0, 80) + '...'
        : String(s.message_body || '');
    body +=
      `• *${escapeMd(outletName)}* — ${escapeMd(s.nama_nasabah ?? s.nomor_pengirim)}\n` +
      `  Kontrak: ${escapeMd(s.no_faktur ?? '—')}\n` +
      `  Pesan: _${escapeMd(preview)}_\n` +
      `  Sudah ${escapeMd(String(elapsed))} jam belum direspond\n\n`;
  }
  if (stale.length > 20) {
    body += `_dan ${stale.length - 20} balasan lain\\.\\.\\._\n`;
  }
  body += `\nBuka /wa\\-inbox di app untuk follow\\-up\\.`;

  const tgResult = await sendAdminTelegram(db, body, 'MarkdownV2');

  // Mark alerted (mark even kalau telegram gagal — supaya tidak retry loop)
  const ids = stale.map((s) => s.id);
  await db
    .from('tb_wa_incoming')
    .update({ alerted_telegram: true })
    .in('id', ids);

  return {
    ok: true,
    scanned: candidates?.length ?? 0,
    alerted: stale.length,
    telegram: tgResult,
  };
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized();
  try {
    const r = await runJob();
    return NextResponse.json(r);
  } catch (e) {
    console.error('[wa/cron-stale-alert POST]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized();
  try {
    const r = await runJob();
    return NextResponse.json(r);
  } catch (e) {
    console.error('[wa/cron-stale-alert GET]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}
