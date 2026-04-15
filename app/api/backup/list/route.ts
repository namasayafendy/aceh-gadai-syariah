// ============================================================
// ACEH GADAI SYARIAH - Backup List API
// File: app/api/backup/list/route.ts
// GET: list backup files from Supabase Storage + status from audit_log
// POST: trigger manual backup (ADMIN/OWNER + PIN)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { runNightlyBackup } from '@/lib/backup/runBackup';

const BUCKET = 'backups';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const outletId = parseInt(searchParams.get('outletId') ?? '0', 10);
    const folder = searchParams.get('folder') ?? ''; // e.g. "LHOKSEUMAWE/2026-04"

    // 1. Get backup status from audit_log
    const { data: logs } = await db.from('audit_log')
      .select('tgl, nilai_baru, outlet, catatan')
      .eq('aksi', 'BACKUP')
      .order('tgl', { ascending: false })
      .limit(20);

    // 2. Get cron status (last successful backup)
    const lastBackup = logs && logs.length > 0 ? logs[0] : null;

    // 3. List files from storage (if folder specified)
    let files: any[] = [];
    if (folder) {
      const { data: fileList, error: listErr } = await db.storage
        .from(BUCKET)
        .list(folder, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      if (!listErr && fileList) {
        files = fileList
          .filter((f: any) => f.name && !f.name.startsWith('.'))
          .map((f: any) => ({
            name: f.name,
            size: f.metadata?.size ?? 0,
            created: f.created_at,
            path: `${folder}/${f.name}`,
          }));
      }
    }

    // 4. List outlet folders (top-level)
    let outlets: string[] = [];
    const { data: topFolders } = await db.storage.from(BUCKET).list('', { limit: 50 });
    if (topFolders) {
      outlets = topFolders
        .filter((f: any) => f.id === null) // folders have null id
        .map((f: any) => f.name);
    }

    // 5. List month folders for an outlet
    let months: string[] = [];
    const outletFolder = searchParams.get('outletFolder');
    if (outletFolder) {
      const { data: monthFolders } = await db.storage.from(BUCKET).list(outletFolder, { limit: 50 });
      if (monthFolders) {
        months = monthFolders
          .filter((f: any) => f.id === null)
          .map((f: any) => f.name)
          .sort()
          .reverse();
      }
    }

    return NextResponse.json({
      ok: true,
      lastBackup: lastBackup ? {
        tgl: (lastBackup as any).tgl,
        detail: (lastBackup as any).nilai_baru,
        outlet: (lastBackup as any).outlet,
      } : null,
      logs: (logs ?? []).map((l: any) => ({
        tgl: l.tgl, outlet: l.outlet, detail: l.nilai_baru,
      })),
      files,
      outlets,
      months,
    });
  } catch (err) {
    console.error('[backup/list]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

// Manual backup trigger — panggil runNightlyBackup() langsung (tanpa self-fetch)
export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '0', 10);

    // Validate PIN (ADMIN/OWNER)
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    const role = String(pinResult.role ?? '').toUpperCase();
    if (!['ADMIN', 'OWNER'].includes(role)) {
      return NextResponse.json({ ok: false, msg: 'Hanya Admin/Owner.' });
    }

    // Jalankan backup langsung (tidak pakai self-fetch)
    const result = await runNightlyBackup(db);
    return NextResponse.json(result);
  } catch (err) {
    console.error('[backup/list POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}
