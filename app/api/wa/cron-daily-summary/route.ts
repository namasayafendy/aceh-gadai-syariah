// ============================================================
// File: app/api/wa/cron-daily-summary/route.ts
//
// CRON 21:00 WIB tiap hari — kirim ringkasan WA per outlet ke
// Telegram admin grup.
//
// Schedule (vercel.json): "0 14 * * *" = 14:00 UTC = 21:00 WIB
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { sendAdminTelegram } from '@/lib/wa/admin-notif';
import { escapeMd } from '@/lib/telegram';

export const maxDuration = 60;

function unauthorized() {
  return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
}

interface OutletStats {
  outlet_id: number;
  outlet_name: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  skipped: number;
  reply_total: number;
  reply_new: number;
  reply_handled: number;
  reply_rescheduled: number;
  reply_stale: number; // NEW state, > 4 jam
}

async function runJob() {
  const db = await createServiceClient();
  const now = new Date();

  // Range hari ini (00:00 WIB - now)
  const todayWib = new Date(now.getTime() + 7 * 3600 * 1000)
    .toISOString().slice(0, 10);
  const dayStart = todayWib + 'T00:00:00+07:00';
  const dayEnd = todayWib + 'T23:59:59+07:00';

  const { data: outlets } = await db
    .from('outlets')
    .select('id, nama')
    .order('id');

  const allStats: OutletStats[] = [];

  for (const o of outlets ?? []) {
    const outletId = (o as any).id as number;
    const outletName = (o as any).nama as string;

    const stat: OutletStats = {
      outlet_id: outletId,
      outlet_name: outletName,
      sent: 0, delivered: 0, read: 0, failed: 0, skipped: 0,
      reply_total: 0, reply_new: 0, reply_handled: 0, reply_rescheduled: 0, reply_stale: 0,
    };

    // Outgoing today
    const { data: out } = await db
      .from('tb_wa_outgoing')
      .select('status')
      .eq('outlet_id', outletId)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd);
    for (const r of out ?? []) {
      const s = String((r as any).status);
      if (s === 'SENT') stat.sent++;
      else if (s === 'DELIVERED') stat.delivered++;
      else if (s === 'READ') stat.read++;
      else if (s === 'FAILED') stat.failed++;
      else if (s === 'SKIPPED') stat.skipped++;
    }

    // Incoming today
    const { data: inc } = await db
      .from('tb_wa_incoming')
      .select('state, received_at, reschedule_to')
      .eq('outlet_id', outletId)
      .gte('received_at', dayStart)
      .lte('received_at', dayEnd);

    for (const r of inc ?? []) {
      const row = r as any;
      stat.reply_total++;
      if (row.state === 'NEW') {
        stat.reply_new++;
        // stale check (simple: > 4 jam wallclock)
        const elapsed = (now.getTime() - new Date(row.received_at).getTime()) / 3600000;
        if (elapsed >= 4) stat.reply_stale++;
      } else if (row.state === 'HANDLED') {
        if (row.reschedule_to) stat.reply_rescheduled++;
        else stat.reply_handled++;
      }
    }

    // Hanya include outlet yang ada aktivitas hari ini
    if (stat.sent + stat.delivered + stat.read + stat.failed + stat.skipped + stat.reply_total > 0) {
      allStats.push(stat);
    }
  }

  // ── Compose pesan ──
  if (allStats.length === 0) {
    return { ok: true, outlets_with_activity: 0, sent: false };
  }

  let body = `📊 *Ringkasan WA Hari Ini* \\(${escapeMd(todayWib)}\\)\n\n`;
  let grandSent = 0, grandFailed = 0, grandReplied = 0, grandStale = 0;

  for (const s of allStats) {
    const totalSent = s.sent + s.delivered + s.read;
    grandSent += totalSent;
    grandFailed += s.failed;
    grandReplied += s.reply_total;
    grandStale += s.reply_stale;

    body += `*${escapeMd(s.outlet_name)}*\n`;
    body += `└ Kirim: ${totalSent} \\| Gagal: ${s.failed} \\| Skip: ${s.skipped}\n`;
    if (s.reply_total > 0) {
      body += `└ Balasan: ${s.reply_total} \\(handled: ${s.reply_handled}, reschedule: ${s.reply_rescheduled}`;
      if (s.reply_stale > 0) body += `, ⚠️ stale: ${s.reply_stale}`;
      body += `\\)\n`;
    }
    body += `\n`;
  }

  body += `*TOTAL:* ${grandSent} kirim \\| ${grandFailed} gagal \\| ${grandReplied} balasan`;
  if (grandStale > 0) body += ` \\| ⚠️ *${grandStale} stale*`;

  const tgResult = await sendAdminTelegram(db, body, 'MarkdownV2');

  return {
    ok: true,
    outlets_with_activity: allStats.length,
    grand_total_sent: grandSent,
    grand_total_failed: grandFailed,
    grand_total_replied: grandReplied,
    grand_total_stale: grandStale,
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
    console.error('[wa/cron-daily-summary POST]', e);
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
    console.error('[wa/cron-daily-summary GET]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}
