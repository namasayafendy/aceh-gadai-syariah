// ============================================================
// ACEH GADAI SYARIAH - Outlet Settings API
// File: app/api/outlet/route.ts
// GET:    list all outlets
// PUT:    update outlet settings (OWNER only)
// DELETE: hapus outlet + SEMUA data terkait (OWNER only, BERBAHAYA)
// DB column: 'telepon' (bukan 'telpon')
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { runNightlyBackup } from '@/lib/backup/runBackup';

export async function GET() {
  try {
    const db = await createServiceClient();
    const { data: rows, error } = await db.from('outlets').select('*').order('id');
    if (error) return NextResponse.json({ ok: false, msg: error.message });
    return NextResponse.json({ ok: true, rows: rows ?? [] });
  } catch (err) {
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const outletId = parseInt(request.headers.get('x-outlet-id') ?? '0', 10);

    // PIN validation (OWNER only)
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    if (String(pinResult.role).toUpperCase() !== 'OWNER') {
      return NextResponse.json({ ok: false, msg: 'Hanya OWNER yang bisa edit outlet.' });
    }

    const id = body.id;
    if (!id) return NextResponse.json({ ok: false, msg: 'ID outlet wajib.' });

    // Build update — only include non-null fields
    // DB column is 'telepon' not 'telpon'
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.nama != null) updates.nama = body.nama;
    if (body.alamat != null) updates.alamat = body.alamat;
    if (body.kota != null) updates.kota = body.kota;
    if (body.telpon != null) updates.telepon = body.telpon;       // frontend sends 'telpon', DB column is 'telepon'
    if (body.telepon != null) updates.telepon = body.telepon;     // also accept 'telepon' directly
    if (body.waktu_operasional != null) updates.waktu_operasional = body.waktu_operasional;
    if (body.nama_perusahaan != null) updates.nama_perusahaan = body.nama_perusahaan;
    if (body.biaya_admin !== undefined) updates.biaya_admin = Number(body.biaya_admin);
    if (body.web_url != null) updates.web_url = body.web_url;

    const { error } = await db.from('outlets').update(updates).eq('id', id);
    if (error) return NextResponse.json({ ok: false, msg: error.message });

    await db.from('audit_log').insert({
      user_nama: pinResult.nama, tabel: 'outlets', record_id: String(id),
      aksi: 'EDIT', field: 'settings',
      nilai_baru: JSON.stringify(body),
      outlet: body.nama || '',
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[outlet PUT]', err);
    return NextResponse.json({ ok: false, msg: 'Server error.' }, { status: 500 });
  }
}

// ══════════════════════════════════════════════════════════════
// DELETE: Hapus outlet + SEMUA data terkait (OWNER only)
// OPERASI BERBAHAYA — TIDAK BISA DI-UNDO
// Safety: PIN Owner + konfirmasi nama outlet + backup otomatis dulu
// ══════════════════════════════════════════════════════════════
export async function DELETE(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();
    const callerOutletId = parseInt(request.headers.get('x-outlet-id') ?? '0', 10);

    // ── 1. OWNER-only PIN validation ──────────────────────────
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin ?? '').trim(), p_outlet_id: callerOutletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid.' });
    if (String(pinResult.role).toUpperCase() !== 'OWNER') {
      return NextResponse.json({ ok: false, msg: 'Hanya OWNER yang bisa hapus outlet.' });
    }

    const targetId = parseInt(body.outletId, 10);
    const confirmNama = String(body.confirmNama ?? '').trim().toUpperCase();
    if (!targetId) return NextResponse.json({ ok: false, msg: 'ID outlet wajib.' });

    // ── 2. Get outlet data ────────────────────────────────────
    const { data: outletRow } = await db.from('outlets').select('*').eq('id', targetId).single();
    if (!outletRow) return NextResponse.json({ ok: false, msg: 'Outlet tidak ditemukan.' });
    const outletName = String((outletRow as any).nama);

    // ── 3. Konfirmasi nama harus cocok ────────────────────────
    if (confirmNama !== outletName.toUpperCase()) {
      return NextResponse.json({ ok: false, msg: `Nama outlet tidak cocok. Ketik "${outletName}" untuk konfirmasi.` });
    }

    // ── 4. Jangan hapus outlet terakhir ───────────────────────
    const { data: allOutlets } = await db.from('outlets').select('id');
    if (!allOutlets || allOutlets.length <= 1) {
      return NextResponse.json({ ok: false, msg: 'Tidak bisa hapus outlet terakhir. Minimal harus ada 1 outlet.' });
    }

    // ── 5. Backup dulu sebelum hapus ──────────────────────────
    try {
      await runNightlyBackup(db);
    } catch (backupErr) {
      console.error('[outlet DELETE] backup before delete failed:', backupErr);
      // Lanjut hapus walaupun backup gagal — user sudah confirm
    }

    // ── 6. Hapus semua data terkait (urutan penting!) ─────────
    // Tabel yang pakai outlet_id (integer)
    const byOutletId = ['tb_gadai', 'tb_sjb', 'tb_rak'];
    // Tabel yang pakai outlet (string nama)
    const byOutletName = [
      'tb_jual_bon_detail', 'tb_jual_bon', 'tb_gudang_aset',
      'tb_serah_terima', 'tb_gudang_sita',
      'tb_diskon', 'tb_buyback', 'tb_tebus', 'tb_kas',
    ];

    const deleted: Record<string, number> = {};

    // Delete by outlet_id
    for (const tabel of byOutletId) {
      const { count } = await db.from(tabel).delete({ count: 'exact' }).eq('outlet_id', targetId);
      deleted[tabel] = count ?? 0;
    }

    // Delete by outlet name (string)
    for (const tabel of byOutletName) {
      const { count } = await db.from(tabel).delete({ count: 'exact' }).eq('outlet', outletName);
      deleted[tabel] = count ?? 0;
    }

    // Delete karyawan for this outlet (but keep shared/outlet_id=0)
    const { count: karyawanCount } = await db.from('karyawan').delete({ count: 'exact' }).eq('outlet_id', targetId);
    deleted['karyawan'] = karyawanCount ?? 0;

    // Delete counter entries
    const { count: counterCount } = await db.from('counter').delete({ count: 'exact' }).eq('outlet_id', targetId);
    deleted['counter'] = counterCount ?? 0;

    // Delete audit_log for this outlet (optional — bisa dipertahankan untuk histori)
    const { count: auditCount } = await db.from('audit_log').delete({ count: 'exact' }).eq('outlet', outletName);
    deleted['audit_log'] = auditCount ?? 0;

    // ── 7. Hapus outlet itu sendiri ───────────────────────────
    const { error: deleteErr } = await db.from('outlets').delete().eq('id', targetId);
    if (deleteErr) {
      return NextResponse.json({ ok: false, msg: 'Gagal hapus outlet: ' + deleteErr.message, deleted });
    }

    // ── 8. Audit log (di outlet lain, supaya tercatat) ────────
    await db.from('audit_log').insert({
      user_nama: pinResult.nama,
      tabel: 'outlets',
      record_id: String(targetId),
      aksi: 'DELETE_OUTLET',
      field: outletName,
      nilai_lama: JSON.stringify(outletRow),
      nilai_baru: JSON.stringify(deleted),
      outlet: 'SYSTEM',
      catatan: `Outlet ${outletName} (ID=${targetId}) dihapus beserta semua data.`,
    });

    const totalDeleted = Object.values(deleted).reduce((s, n) => s + n, 0);
    return NextResponse.json({
      ok: true,
      msg: `Outlet "${outletName}" dan ${totalDeleted} record berhasil dihapus.`,
      deleted,
    });
  } catch (err) {
    console.error('[outlet DELETE]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}
