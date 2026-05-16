// ============================================================
// File: app/api/audit-log/route.ts
//
// OWNER-only endpoint untuk akses tabel audit_log.
// Method:
//   GET  ?dateFrom=&dateTo=&outlet=&user=&tabel=&aksi=&search=&page=&limit=
//        → list dengan filter + pagination
//   GET  ?export=csv&[filter sama]
//        → download CSV semua row matched (no pagination)
//
// Catatan permission:
//   Tier 1 spec: HANYA OWNER yang bisa akses (admin TIDAK bisa).
//   Validasi via header x-role yang di-set di session, plus
//   double-check ke profiles table by user_id dari session cookie.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient, createClient } from '@/lib/supabase/server';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const CSV_MAX_ROWS = 10000;

async function requireOwner(): Promise<{ ok: boolean; msg?: string }> {
  try {
    const client = await createClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return { ok: false, msg: 'Belum login' };

    const db = await createServiceClient();
    const { data: profile } = await db
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    const role = String((profile as any)?.role || '').toUpperCase();
    if (role !== 'OWNER') {
      return { ok: false, msg: 'Hanya OWNER yang boleh akses audit log' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, msg: 'Auth error: ' + String(e) };
  }
}

function buildQuery(db: any, params: URLSearchParams) {
  let q = db.from('audit_log').select('*', { count: 'exact' });

  // Date range (default: 30 hari terakhir kalau tidak di-set)
  const dateFrom = params.get('dateFrom');
  const dateTo = params.get('dateTo');
  if (dateFrom) {
    q = q.gte('tgl', dateFrom + 'T00:00:00+07:00');
  } else {
    const def = new Date(Date.now() - 30 * 86400000).toISOString();
    q = q.gte('tgl', def);
  }
  if (dateTo) q = q.lte('tgl', dateTo + 'T23:59:59+07:00');

  // Equality filters
  const outlet = params.get('outlet');
  if (outlet) q = q.eq('outlet', outlet);

  const user = params.get('user');
  if (user) q = q.ilike('user_nama', `%${user}%`);

  const tabel = params.get('tabel');
  if (tabel) q = q.eq('tabel', tabel);

  const aksi = params.get('aksi');
  if (aksi) q = q.eq('aksi', aksi);

  // Free text search (record_id, field, catatan, nilai_baru, nilai_lama)
  const search = params.get('search');
  if (search) {
    q = q.or(
      `record_id.ilike.%${search}%,field.ilike.%${search}%,catatan.ilike.%${search}%,nilai_baru.ilike.%${search}%,nilai_lama.ilike.%${search}%`,
    );
  }

  return q.order('tgl', { ascending: false });
}

export async function GET(request: NextRequest) {
  const auth = await requireOwner();
  if (!auth.ok) return NextResponse.json({ ok: false, msg: auth.msg }, { status: 403 });

  try {
    const db = await createServiceClient();
    const url = new URL(request.url);
    const params = url.searchParams;
    const isExport = params.get('export') === 'csv';

    if (isExport) {
      // Export CSV — cap at CSV_MAX_ROWS untuk safety
      const q = buildQuery(db, params).limit(CSV_MAX_ROWS);
      const { data, error } = await q;
      if (error) {
        return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
      }
      const csv = toCSV(data ?? []);
      const filename = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
        },
      });
    }

    // Paginated list
    const page = Math.max(1, Number(params.get('page')) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number(params.get('limit')) || DEFAULT_LIMIT));
    const offset = (page - 1) * limit;

    const q = buildQuery(db, params).range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) {
      return NextResponse.json({ ok: false, msg: error.message }, { status: 500 });
    }

    // List outlet untuk filter dropdown.
    // Tabel & aksi: derive dari distinct values di audit_log via aggregate query.
    const { data: outletList } = await db.from('outlets').select('nama').order('nama');

    // Distinct tabel + aksi via head=true + select with returning unique
    // (Supabase JS tidak support DISTINCT langsung, jadi kita ambil sample 1000 row terbaru)
    const { data: distinctSample } = await db
      .from('audit_log')
      .select('tabel, aksi')
      .order('tgl', { ascending: false })
      .limit(2000);
    const tabelSet = new Set<string>();
    const aksiSet = new Set<string>();
    for (const r of distinctSample ?? []) {
      if ((r as any).tabel) tabelSet.add((r as any).tabel);
      if ((r as any).aksi) aksiSet.add((r as any).aksi);
    }

    return NextResponse.json({
      ok: true,
      rows: data ?? [],
      total: count ?? 0,
      page,
      limit,
      filterOptions: {
        outlets: (outletList ?? []).map((o: any) => o.nama),
        tabels: Array.from(tabelSet).sort(),
        aksi: Array.from(aksiSet).sort(),
      },
    });
  } catch (e) {
    console.error('[audit-log GET]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}

function toCSV(rows: any[]): string {
  if (rows.length === 0) return 'id,tgl,user_nama,tabel,record_id,aksi,field,outlet,catatan\n';
  const cols = ['id', 'tgl', 'user_nama', 'tabel', 'record_id', 'aksi', 'field', 'outlet', 'catatan', 'nilai_lama', 'nilai_baru'];
  const escape = (v: any) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s}"`;
    return s;
  };
  const header = cols.join(',');
  const lines = rows.map((r) => cols.map((c) => escape(r[c])).join(','));
  return [header, ...lines].join('\n') + '\n';
}
