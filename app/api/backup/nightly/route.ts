// ============================================================
// ACEH GADAI SYARIAH - Nightly Backup Cron Route
// File: app/api/backup/nightly/route.ts
//
// Dipanggil setiap malam jam 23:00 WIB oleh Vercel Cron.
// Dilindungi dengan CRON_SECRET (header Authorization).
// Logic backup ada di lib/backup/runBackup.ts (shared)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { runNightlyBackup } from '@/lib/backup/runBackup';

export async function POST(request: NextRequest) {
  // Auth: hanya Vercel Cron atau internal call yang bisa panggil
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
  }

  try {
    const db = await createServiceClient();
    const result = await runNightlyBackup(db);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[backup/nightly]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}

// GET: cek status backup hari ini
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, msg: 'Unauthorized' }, { status: 401 });
  }

  const db = await createServiceClient();
  const tgl = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

  const { data: logs } = await db
    .from('audit_log')
    .select('*')
    .eq('aksi', 'BACKUP')
    .gte('tgl', tgl + 'T00:00:00Z')
    .order('tgl', { ascending: false })
    .limit(10);

  return NextResponse.json({ ok: true, tgl, logs: logs ?? [] });
}
