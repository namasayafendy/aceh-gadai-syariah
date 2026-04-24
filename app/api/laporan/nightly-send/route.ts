// ============================================================
// ACEH GADAI SYARIAH - Cron: Kirim Laporan Malam ke Telegram
// File: app/api/laporan/nightly-send/route.ts
//
// Jadwal: setiap hari jam 01:00 WIB (Vercel Cron 0 18 * * * UTC)
// Tugas:
//   1. Ambil semua outlet aktif
//   2. Untuk setiap outlet: ambil laporan malam KEMARIN (Asia/Jakarta)
//   3. Generate PDF (pdfkit) dgn nama "Laporan Malam_{OUTLET}_{TGL}.pdf"
//   4. Kirim ke 1 grup Telegram global (chat_id dari app_settings)
//   5. Audit log per outlet
//
// Auth: Bearer CRON_SECRET (sama dgn cron lain)
// TIDAK menyentuh /api/laporan/malam, runBackup, alur kas, dst.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { getLaporanMalam, computeLaporanExtras } from '@/lib/laporan/getLaporanMalam';
import { buildLaporanMalamPdf } from '@/lib/laporan/buildLaporanPdf';
import { sendTelegramDocument } from '@/lib/telegram';

// Pastikan cron dapat waktu cukup — pdfkit + upload ke Telegram per outlet bisa > 10s (default Hobby)
export const maxDuration = 300;

// Hitung tanggal kemarin di timezone Asia/Jakarta
function yesterdayJakarta(): string {
  // Kemarin = sekarang - 24 jam, tapi kita render di TZ Jakarta
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return yesterday.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

function safeOutletSlug(s: string): string {
  return s.toString().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
}

async function runJob(db: any) {
  const tgl = yesterdayJakarta();

  // Ambil chat_id grup laporan dari app_settings
  const { data: setting } = await db.from('app_settings')
    .select('value').eq('key', 'laporan_malam_chat_id').maybeSingle();
  const chatIdRaw = setting?.value;
  if (!chatIdRaw) {
    return NextResponse.json({
      ok: false,
      msg: 'Grup Telegram laporan malam belum di-setup. Buka /settings/telegram → Grup Laporan Malam.',
      tgl,
    });
  }
  const chatId = Number(chatIdRaw);
  if (!Number.isFinite(chatId)) {
    return NextResponse.json({ ok: false, msg: 'chat_id laporan malam invalid.', tgl });
  }

  // Loop semua outlet aktif
  const { data: outlets } = await db.from('outlets').select('id, nama').order('id');
  if (!outlets || outlets.length === 0) {
    return NextResponse.json({ ok: false, msg: 'Tidak ada outlet.', tgl });
  }

  const results: Record<string, { ok: boolean; messageId?: number; error?: string }> = {};

  for (const o of outlets) {
    const outletId = Number((o as any).id);
    const outletNama = String((o as any).nama);
    try {
      const data = await getLaporanMalam(db, outletId, tgl);
      if (!data.ok) {
        results[outletNama] = { ok: false, error: data.msg ?? 'Gagal ambil data.' };
        continue;
      }
      const extras = computeLaporanExtras(data);
      const pdfBuf = await buildLaporanMalamPdf(data, extras);

      const filename = `Laporan_Malam_${safeOutletSlug(outletNama)}_${tgl}.pdf`;
      const caption =
        `📊 *Laporan Malam ${outletNama}*\n` +
        `Tanggal: ${tgl}\n` +
        `Total Keluar: Rp ${(data.rekap.totalKeluar || 0).toLocaleString('id-ID')}\n` +
        `Total Masuk: Rp ${(extras.totalMasukAll || 0).toLocaleString('id-ID')}\n` +
        `Total Laba: Rp ${(extras.labaTotal || 0).toLocaleString('id-ID')}`;

      const sendRes = await sendTelegramDocument(chatId, pdfBuf, filename, {
        caption,
        parseMode: 'Markdown',
        contentType: 'application/pdf',
      });

      results[outletNama] = sendRes.ok
        ? { ok: true, messageId: sendRes.messageId }
        : { ok: false, error: sendRes.error };

      // Log per outlet (best effort)
      db.from('telegram_log').insert({
        arah: 'OUT', chat_id: chatId,
        event: 'laporan_malam_pdf',
        payload: {
          outlet: outletNama, outletId, tgl, filename,
          totalKeluar: data.rekap.totalKeluar,
          totalMasuk: extras.totalMasukAll,
          totalLaba: extras.labaTotal,
          messageId: sendRes.messageId,
        },
        error: sendRes.ok ? null : sendRes.error,
      }).then(() => {}, () => {});
    } catch (err) {
      const errMsg = err instanceof Error ? `${err.message}\n${err.stack}` : String(err);
      console.error(`[laporan/nightly-send] outlet=${outletNama} ERROR:`, errMsg);
      results[outletNama] = { ok: false, error: errMsg };
      // Log error ke telegram_log supaya bisa di-query dari DB untuk debug
      db.from('telegram_log').insert({
        arah: 'OUT', chat_id: chatId,
        event: 'laporan_malam_pdf',
        payload: { outlet: outletNama, outletId, tgl, stage: 'preflight' },
        error: errMsg.substring(0, 2000),
      }).then(() => {}, () => {});
    }
  }

  // Audit log
  await db.from('audit_log').insert({
    user_nama: 'SYSTEM',
    tabel: 'laporan_malam_telegram',
    record_id: tgl,
    aksi: 'CRON_SEND',
    field: 'ALL',
    nilai_baru: JSON.stringify({
      tgl, chatId,
      outlets: Object.fromEntries(
        Object.entries(results).map(([k, v]) => [k, v.ok ? 'OK' : 'ERR']),
      ),
    }),
    outlet: 'ALL',
  }).then(() => {}, () => {});

  const sukses = Object.values(results).filter(r => r.ok).length;
  return NextResponse.json({
    ok: true,
    tgl,
    chatId,
    sukses,
    total: outlets.length,
    results,
  });
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = await createServiceClient();
    return await runJob(db);
  } catch (err) {
    console.error('[laporan/nightly-send POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}

// GET = manual trigger / dry-run by Owner (auth Bearer juga)
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
  }
  try {
    const db = await createServiceClient();
    return await runJob(db);
  } catch (err) {
    console.error('[laporan/nightly-send GET]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}
