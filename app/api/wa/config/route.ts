// ============================================================
// File: app/api/wa/config/route.ts
// Owner-only: kelola tb_wa_config (Wablas/Fonnte credentials per outlet)
//
// GET  /api/wa/config             → list config semua outlet
// POST /api/wa/config             → upsert config (insert atau update)
// POST /api/wa/config?action=del  → soft-delete (set enabled=false)
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

async function requireOwner(db: Awaited<ReturnType<typeof createServiceClient>>, pin: string, outletId: number) {
  const { data } = await db.rpc('validate_pin', {
    p_pin: pin.trim(),
    p_outlet_id: outletId,
  });
  if (!data?.ok) return { ok: false, msg: data?.msg ?? 'PIN tidak valid' };
  const role = String(data.role || '').toUpperCase();
  if (role !== 'OWNER') return { ok: false, msg: 'Hanya OWNER yang boleh akses fitur ini' };
  return { ok: true, kasir: data.nama as string };
}

// ─────────────────────────────────────────────────────────────
// GET — list config semua outlet (join dengan outlet info)
// ─────────────────────────────────────────────────────────────
export async function GET(_request: NextRequest) {
  try {
    const db = await createServiceClient();

    // List semua outlets
    const { data: outlets } = await db
      .from('outlets')
      .select('id, nama')
      .order('id');

    // List semua config (termasuk yg disabled)
    const { data: configs } = await db
      .from('tb_wa_config')
      .select('*')
      .order('outlet_id');

    // Stats kirim per outlet (24 jam terakhir)
    const since24h = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const stats: Record<number, { sent: number; failed: number; skipped: number }> = {};

    const { data: outgoing24h } = await db
      .from('tb_wa_outgoing')
      .select('outlet_id, status')
      .gte('created_at', since24h);

    for (const o of outgoing24h ?? []) {
      const oid = (o as any).outlet_id as number;
      if (!stats[oid]) stats[oid] = { sent: 0, failed: 0, skipped: 0 };
      const st = String((o as any).status || '');
      if (st === 'SENT' || st === 'DELIVERED' || st === 'READ') stats[oid].sent++;
      else if (st === 'FAILED') stats[oid].failed++;
      else if (st === 'SKIPPED') stats[oid].skipped++;
    }

    // Compose response: 1 row per outlet, dengan config (nullable) + stats
    const result = (outlets ?? []).map((o: any) => {
      const cfgs = (configs ?? []).filter((c: any) => c.outlet_id === o.id);
      const active = cfgs.find((c: any) => c.status === 'ACTIVE' && c.enabled) ?? null;
      return {
        outlet_id: o.id,
        outlet_name: o.nama,
        active_config: active
          ? {
              id: active.id,
              provider: active.provider,
              api_key_masked: maskKey(active.api_key),
              nomor_pengirim: active.nomor_pengirim,
              nomor_backup: active.nomor_backup,
              api_base_url: active.api_base_url,
              enabled: active.enabled,
              status: active.status,
              daily_quota: active.daily_quota,
              last_test_at: active.last_test_at,
              last_test_ok: active.last_test_ok,
            }
          : null,
        all_configs_count: cfgs.length,
        stats_24h: stats[o.id] ?? { sent: 0, failed: 0, skipped: 0 },
      };
    });

    return NextResponse.json({ ok: true, outlets: result });
  } catch (e) {
    console.error('[wa/config GET]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + (e as Error).message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// POST — upsert (insert atau update) config per outlet
//
// Body: {
//   pin: string;              // OWNER PIN
//   outletId: number;
//   provider?: 'WABLAS' | 'FONNTE';
//   apiKey: string;
//   apiBaseUrl?: string;
//   nomorPengirim: string;
//   nomorBackup?: string;
//   dailyQuota?: number;
// }
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') ?? 'upsert';

    // Owner PIN check — pakai outlet_id=0 (OWNER cross-outlet) atau outlet target
    const targetOutletId = Number(body.outletId);
    if (!targetOutletId) {
      return NextResponse.json({ ok: false, msg: 'outletId wajib' });
    }
    const auth = await requireOwner(db, String(body.pin || ''), targetOutletId);
    if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg });

    if (action === 'del') {
      // Soft delete: set enabled=false untuk semua config aktif outlet ini
      await db
        .from('tb_wa_config')
        .update({ enabled: false, status: 'PAUSED' })
        .eq('outlet_id', targetOutletId)
        .eq('status', 'ACTIVE');
      return NextResponse.json({ ok: true, msg: 'Config di-nonaktifkan' });
    }

    // Validate input
    const provider = String(body.provider || 'WABLAS').toUpperCase();
    if (!['WABLAS', 'FONNTE', 'WHACENTER', 'MOCK'].includes(provider)) {
      return NextResponse.json({ ok: false, msg: 'Provider tidak dikenali' });
    }
    if (!body.apiKey || !body.nomorPengirim) {
      return NextResponse.json({ ok: false, msg: 'API key & nomor pengirim wajib diisi' });
    }

    // Nonaktifkan semua config lama outlet ini dulu (sebelum insert baru)
    // Supaya tidak conflict dengan unique partial index "max 1 active per outlet"
    await db
      .from('tb_wa_config')
      .update({ status: 'PAUSED', enabled: false })
      .eq('outlet_id', targetOutletId)
      .eq('status', 'ACTIVE');

    // Insert config baru sebagai ACTIVE
    const { data: inserted, error: insErr } = await db
      .from('tb_wa_config')
      .insert({
        outlet_id: targetOutletId,
        provider: provider as any,
        api_key: String(body.apiKey),
        api_base_url: body.apiBaseUrl ? String(body.apiBaseUrl) : null,
        nomor_pengirim: String(body.nomorPengirim),
        nomor_backup: body.nomorBackup ? String(body.nomorBackup) : null,
        daily_quota: Number(body.dailyQuota) || 1000,
        enabled: true,
        status: 'ACTIVE',
      })
      .select('id')
      .single();

    if (insErr) {
      return NextResponse.json({ ok: false, msg: 'Gagal simpan config: ' + insErr.message });
    }

    // Audit log
    await db.from('audit_log').insert({
      user_nama: auth.kasir,
      tabel: 'tb_wa_config',
      record_id: String(inserted?.id),
      aksi: 'UPSERT',
      field: 'ALL',
      nilai_baru: JSON.stringify({ outletId: targetOutletId, provider, nomor: body.nomorPengirim }),
      outlet: '',
    });

    return NextResponse.json({ ok: true, id: inserted?.id, msg: 'Config tersimpan' });
  } catch (e) {
    console.error('[wa/config POST]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + (e as Error).message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '****';
  return key.slice(0, 4) + '****' + key.slice(-4);
}
