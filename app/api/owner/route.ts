// ============================================================
// ACEH GADAI SYARIAH - Owner API Routes
// File: app/api/owner/route.ts
// OWNER only — multi-action via ?action=xxx
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') ?? 'summary';

    if (action === 'summary') {
      // Aggregate stats per outlet
      const { data: outlets } = await db.from('outlets').select('id, nama').order('id');
      const summary: any[] = [];
      for (const o of (outlets ?? [])) {
        const outletName = (o as any).nama;
        const { count: gadaiAktif } = await db.from('tb_gadai').select('*', { count: 'exact', head: true }).eq('outlet', outletName).eq('status', 'AKTIF');
        const { count: gadaiTotal } = await db.from('tb_gadai').select('*', { count: 'exact', head: true }).eq('outlet', outletName);
        const { count: sjbAktif } = await db.from('tb_sjb').select('*', { count: 'exact', head: true }).eq('outlet', outletName).in('status', ['AKTIF', 'BERJALAN']);
        const { count: tebusTotal } = await db.from('tb_tebus').select('*', { count: 'exact', head: true }).eq('outlet', outletName);
        summary.push({
          outletId: (o as any).id, outlet: outletName,
          gadaiAktif: gadaiAktif ?? 0, gadaiTotal: gadaiTotal ?? 0,
          sjbAktif: sjbAktif ?? 0, tebusTotal: tebusTotal ?? 0,
        });
      }
      return NextResponse.json({ ok: true, summary, outlets });
    }

    if (action === 'karyawan') {
      const { data: rows } = await db.from('karyawan').select('*').order('outlet_id').order('nama');
      return NextResponse.json({ ok: true, rows: rows ?? [] });
    }

    if (action === 'rak') {
      const outletId = searchParams.get('outletId');
      let q = db.from('tb_rak').select('*').order('outlet_id').order('kategori').order('kode');
      if (outletId && outletId !== '0') q = q.eq('outlet_id', parseInt(outletId));
      const { data: rows } = await q;
      return NextResponse.json({ ok: true, rows: rows ?? [] });
    }

    if (action === 'backup-status') {
      const { data: logs } = await db.from('audit_log')
        .select('tgl, nilai_baru, outlet')
        .eq('aksi', 'BACKUP')
        .order('tgl', { ascending: false })
        .limit(10);
      return NextResponse.json({ ok: true, logs: logs ?? [] });
    }

    return NextResponse.json({ ok: false, msg: 'Unknown action' });
  } catch (err) {
    console.error('[owner GET]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const action = body.action;

    // All POST actions require OWNER PIN
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: 0,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    if (String(pinResult.role).toUpperCase() !== 'OWNER') {
      return NextResponse.json({ ok: false, msg: 'Hanya OWNER.' });
    }
    const kasir = pinResult.nama as string;

    // ── Karyawan: add/edit/toggle ──────────────────────────
    if (action === 'karyawan-save') {
      const { id, nama, username, pin: kPin, role, outlet_id, status } = body;
      if (!nama) return NextResponse.json({ ok: false, msg: 'Nama wajib.' });

      if (id) {
        // Edit existing
        await db.from('karyawan').update({
          nama, username: username || null, pin: kPin || null,
          role: role || 'KASIR', outlet_id: parseInt(outlet_id) || 1,
          status: status || 'AKTIF',
        }).eq('id', id);
      } else {
        // Add new
        const { data: newId } = await db.rpc('get_next_id', { p_tipe: 'USR', p_outlet_id: 0 });
        await db.from('karyawan').insert({
          id: newId as string, nama, username: username || null,
          pin: kPin || null, role: role || 'KASIR',
          outlet_id: parseInt(outlet_id) || 1, status: 'AKTIF',
        });
      }
      await db.from('audit_log').insert({
        user_nama: kasir, tabel: 'karyawan', record_id: id || 'NEW',
        aksi: id ? 'EDIT' : 'INSERT', field: 'ALL',
        nilai_baru: JSON.stringify({ nama, role, outlet_id }),
      });
      return NextResponse.json({ ok: true });
    }

    // ── Rak: add/edit/delete ──────────────────────────────
    if (action === 'rak-save') {
      const { id, kode, nama, kategori, keterangan, outlet_id } = body;
      if (!kode || !nama) return NextResponse.json({ ok: false, msg: 'Kode dan nama wajib.' });

      const { data: outlet } = await db.from('outlets').select('nama').eq('id', parseInt(outlet_id) || 1).single();
      const outletName = outlet ? String((outlet as any).nama) : '';

      if (id) {
        await db.from('tb_rak').update({
          kode, nama, kategori: kategori || null, keterangan: keterangan || null,
          outlet_id: parseInt(outlet_id) || 1, outlet: outletName,
        }).eq('id', id);
      } else {
        const { data: rakId } = await db.rpc('get_next_id', { p_tipe: 'RAK', p_outlet_id: parseInt(outlet_id) || 1 });
        await db.from('tb_rak').insert({
          id: rakId as string, kode, nama, kategori: kategori || null,
          keterangan: keterangan || null,
          outlet_id: parseInt(outlet_id) || 1, outlet: outletName,
        });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'rak-delete') {
      if (!body.id) return NextResponse.json({ ok: false, msg: 'ID wajib.' });
      await db.from('tb_rak').delete().eq('id', body.id);
      return NextResponse.json({ ok: true });
    }

    // ── Outlet: add new ──────────────────────────────────
    if (action === 'outlet-add') {
      const { nama, alamat, kota, telpon, waktu_operasional, nama_perusahaan } = body;
      if (!nama) return NextResponse.json({ ok: false, msg: 'Nama outlet wajib.' });

      const { error } = await db.from('outlets').insert({
        nama: nama.toUpperCase(), alamat: alamat || '', kota: kota || '',
        telpon: telpon || '', waktu_operasional: waktu_operasional || '',
        nama_perusahaan: nama_perusahaan || 'PT. ACEH GADAI SYARIAH',
        biaya_admin: 10000,
      });
      if (error) return NextResponse.json({ ok: false, msg: error.message });

      await db.from('audit_log').insert({
        user_nama: kasir, tabel: 'outlets', record_id: nama,
        aksi: 'INSERT', field: 'ALL',
        nilai_baru: JSON.stringify({ nama, alamat, kota }),
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ ok: false, msg: 'Unknown action' });
  } catch (err) {
    console.error('[owner POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}
