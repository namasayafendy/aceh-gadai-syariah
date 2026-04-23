// ============================================================
// ACEH GADAI SYARIAH - Nightly Backup Cron Route
// File: app/api/backup/nightly/route.ts
//
// Dipanggil setiap malam jam 23:00 WIB (cron 0 16 * * * UTC) oleh
// Vercel Cron. Vercel Cron selalu pakai HTTP GET, jadi GET handler
// WAJIB jalankan backup. POST juga didukung utk manual trigger.
//
// Dilindungi CRON_SECRET (header Authorization: Bearer <secret>).
// Logic backup ada di lib/backup/runBackup.ts (shared).
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { runNightlyBackup } from '@/lib/backup/runBackup';

// Pastikan cron dapat waktu eksekusi cukup (backup beberapa menit)
export const maxDuration = 300;

async function runJob() {
  const db = await createServiceClient();
  const result = await runNightlyBackup(db);
  return NextResponse.json(result);
}

function unauthorized() {
  return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized();
  try {
    return await runJob();
  } catch (err) {
    console.error('[backup/nightly POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}

// GET = dipakai Vercel Cron (default method). Juga dipakai manual trigger.
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) return unauthorized();
  try {
    return await runJob();
  } catch (err) {
    console.error('[backup/nightly GET]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}
