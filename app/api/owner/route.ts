// ============================================================
// ACEH GADAI SYARIAH - Owner API Routes
// File: app/api/owner/route.ts
// OWNER only — multi-action via ?action=xxx
// Fixed: rak-save with tipe (GADAI/SJB), proper ID
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { ensureAllCounters } from '@/lib/db/counter';

export async function GET(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') ?? 'summary';

    if (action === 'summary') {
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
      let q = db.from('tb_rak').select('*').order('outlet_id').order('tipe').order('kategori').order('kode');
      if (outletId && outletId !== '0') q = q.eq('outlet_id', parseInt(outletId));
      const { data: rows, error } = await q;
      if (error) return NextResponse.json({ ok: true, rows: [] }); // table might not exist yet
      return NextResponse.json({ ok: true, rows: rows ?? [] });
    }

    // ── Akun Login: list profiles + email dari auth ──────────
    if (action === 'akun-login') {
      const { data: profiles } = await db.from('profiles').select('*').order('outlet_id').order('nama');
      // Get email from auth.users via admin API
      const { data: { users } } = await db.auth.admin.listUsers({ perPage: 200 });
      const emailMap: Record<string, string> = {};
      for (const u of (users ?? [])) { emailMap[u.id] = u.email ?? ''; }
      const rows = (profiles ?? []).map((p: any) => ({
        ...p, email: emailMap[p.id] || '(unknown)',
      }));
      return NextResponse.json({ ok: true, rows });
    }

    if (action === 'backup-status') {
      const { data: logs } = await db.from('audit_log')
        .select('tgl, nilai_baru, outlet')
        .eq('aksi', 'BACKUP')
        .order('tgl', { ascending: false })
        .limit(10);
      return NextResponse.json({ ok: true, logs: logs ?? [] });
    }

    // ── Reprint: cari kontrak gadai/SJB by no_faktur or barcode ──
    if (action === 'reprint') {
      const input = String(searchParams.get('q') ?? '').trim().toUpperCase();
      if (!input) return NextResponse.json({ ok: false, msg: 'Masukkan No Faktur atau barcode.' });

      // Search tb_gadai
      const { data: gadaiRows } = await db
        .from('tb_gadai').select('*')
        .or(`no_faktur.ilike.${input},barcode_a.eq.${input},barcode_b.eq.${input}`)
        .limit(5);

      // Search tb_sjb
      const { data: sjbRows } = await db
        .from('tb_sjb').select('*')
        .or(`no_faktur.ilike.${input},barcode_a.eq.${input}`)
        .limit(5);

      const allRows = [
        ...(gadaiRows ?? []).map((r: any) => ({ ...r, _source: 'GADAI' })),
        ...(sjbRows ?? []).map((r: any) => ({ ...r, _source: 'SJB' })),
      ];

      if (allRows.length === 0) {
        return NextResponse.json({ ok: false, msg: 'Kontrak tidak ditemukan.' });
      }

      const row = allRows[0];
      const source = row._source;

      // Get outlet info
      let outletInfo: any = {};
      if (row.outlet) {
        const { data: outletRow } = await db.from('outlets').select('*').eq('nama', row.outlet).single();
        if (outletRow) {
          outletInfo = {
            outlet: outletRow.nama ?? '',
            alamat: outletRow.alamat ?? '',
            kota: outletRow.kota ?? '',
            telpon: outletRow.telepon ?? '',
            namaPerusahaan: outletRow.nama_perusahaan ?? 'PT. ACEH GADAI SYARIAH',
            waktuOperasional: outletRow.waktu_operasional ?? '',
            biayaAdmin: outletRow.biaya_admin ?? 10000,
          };
        }
      }

      return NextResponse.json({ ok: true, data: row, source, ...outletInfo });
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
      const { id, nama, username, kPin, role, outlet_id, status } = body;
      if (!nama) return NextResponse.json({ ok: false, msg: 'Nama wajib.' });

      // outlet_id: 0 = semua outlet (untuk ADMIN/OWNER), N = outlet spesifik
      const oid = outlet_id !== undefined && outlet_id !== '' ? parseInt(outlet_id) : 1;

      if (id) {
        await db.from('karyawan').update({
          nama, username: username || null, pin: kPin || null,
          role: role || 'KASIR', outlet_id: oid,
          status: status || 'AKTIF',
        }).eq('id', id);
      } else {
        const newId = 'USR' + Date.now().toString().slice(-6);
        await db.from('karyawan').insert({
          id: newId, nama, username: username || null,
          pin: kPin || null, role: role || 'KASIR',
          outlet_id: oid, status: 'AKTIF',
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
      const { id, kode, nama, kategori, tipe, keterangan, outlet_id } = body;
      if (!kode || !nama) return NextResponse.json({ ok: false, msg: 'Kode dan nama wajib.' });

      const oid = parseInt(outlet_id) || 1;
      const { data: outlet } = await db.from('outlets').select('nama').eq('id', oid).single();
      const outletName = outlet ? String((outlet as any).nama) : '';
      const rakTipe = tipe || 'GADAI'; // default GADAI

      if (id) {
        // Update existing
        const { error } = await db.from('tb_rak').update({
          kode, nama, kategori: kategori || null, tipe: rakTipe,
          keterangan: keterangan || null,
          outlet_id: oid, outlet: outletName,
          updated_at: new Date().toISOString(),
        }).eq('id', id);
        if (error) return NextResponse.json({ ok: false, msg: 'Gagal update: ' + error.message });
      } else {
        // Insert new with simple ID
        const newId = 'RAK-' + Date.now().toString();
        const { error } = await db.from('tb_rak').insert({
          id: newId, kode, nama, kategori: kategori || null, tipe: rakTipe,
          keterangan: keterangan || null,
          outlet_id: oid, outlet: outletName,
        });
        if (error) return NextResponse.json({ ok: false, msg: 'Gagal insert: ' + error.message });
      }
      return NextResponse.json({ ok: true });
    }

    if (action === 'rak-delete') {
      if (!body.id) return NextResponse.json({ ok: false, msg: 'ID wajib.' });
      const { error } = await db.from('tb_rak').delete().eq('id', body.id);
      if (error) return NextResponse.json({ ok: false, msg: 'Gagal hapus: ' + error.message });
      return NextResponse.json({ ok: true });
    }

    // ── Outlet: add new ──────────────────────────────────
    if (action === 'outlet-add') {
      const { nama, alamat, kota, telpon, waktu_operasional, nama_perusahaan } = body;
      if (!nama) return NextResponse.json({ ok: false, msg: 'Nama outlet wajib.' });

      // Generate next outlet ID (outlets.id is NOT auto-increment)
      const { data: maxRow } = await db.from('outlets').select('id').order('id', { ascending: false }).limit(1).single();
      const nextId = maxRow ? ((maxRow as any).id + 1) : 1;

      const { error } = await db.from('outlets').insert({
        id: nextId,
        nama: nama.toUpperCase(), alamat: alamat || '', kota: kota || '',
        telepon: telpon || '', waktu_operasional: waktu_operasional || '',
        nama_perusahaan: nama_perusahaan || 'PT. ACEH GADAI SYARIAH',
        biaya_admin: 10000,
      });
      if (error) return NextResponse.json({ ok: false, msg: error.message });

      // ── Buat counter entries untuk outlet baru ────────────
      // Supaya semua fungsi (gadai, tebus, sjb, kas, dll) langsung jalan
      await ensureAllCounters(db, nextId);

      await db.from('audit_log').insert({
        user_nama: kasir, tabel: 'outlets', record_id: String(nextId),
        aksi: 'INSERT', field: 'ALL',
        nilai_baru: JSON.stringify({ id: nextId, nama, alamat, kota }),
      });
      return NextResponse.json({ ok: true, msg: `Outlet "${nama.toUpperCase()}" (ID: ${nextId}) berhasil ditambahkan.` });
    }

    // ── Akun Login: create new email login ──────────────────
    if (action === 'akun-login-create') {
      const { email, password, nama, role: aRole, outlet_id: aOutlet } = body;
      if (!email || !password) return NextResponse.json({ ok: false, msg: 'Email dan password wajib.' });
      if (!nama) return NextResponse.json({ ok: false, msg: 'Nama wajib.' });
      if (password.length < 6) return NextResponse.json({ ok: false, msg: 'Password minimal 6 karakter.' });

      // 1. Create auth user via Supabase Admin API
      const { data: authData, error: authErr } = await db.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true, // auto-confirm email
      });
      if (authErr) return NextResponse.json({ ok: false, msg: 'Gagal buat akun: ' + authErr.message });
      const userId = authData.user.id;

      // 2. Insert profile with matching UUID
      const oid = parseInt(aOutlet) || 0;
      const { error: profErr } = await db.from('profiles').insert({
        id: userId,
        nama: nama.trim(),
        role: aRole || 'KASIR',
        outlet_id: oid,
        status: 'AKTIF',
      });
      if (profErr) {
        // Rollback: hapus auth user jika profile gagal
        await db.auth.admin.deleteUser(userId);
        return NextResponse.json({ ok: false, msg: 'Gagal buat profile: ' + profErr.message });
      }

      await db.from('audit_log').insert({
        user_nama: kasir, tabel: 'profiles', record_id: userId,
        aksi: 'INSERT', field: 'akun-login',
        nilai_baru: JSON.stringify({ email, nama, role: aRole, outlet_id: oid }),
        outlet: 'SYSTEM',
      });
      return NextResponse.json({ ok: true, msg: `Akun ${email} berhasil dibuat.` });
    }

    // ── Akun Login: edit profile (role, outlet, status, nama) ──
    if (action === 'akun-login-edit') {
      const { id: profileId, nama, role: aRole, outlet_id: aOutlet, status: aStatus } = body;
      if (!profileId) return NextResponse.json({ ok: false, msg: 'ID profile wajib.' });

      const updates: Record<string, any> = { updated_at: new Date().toISOString() };
      if (nama != null) updates.nama = nama.trim();
      if (aRole != null) updates.role = aRole;
      if (aOutlet != null) updates.outlet_id = parseInt(aOutlet) || 0;
      if (aStatus != null) updates.status = aStatus;

      const { error } = await db.from('profiles').update(updates).eq('id', profileId);
      if (error) return NextResponse.json({ ok: false, msg: 'Gagal update: ' + error.message });

      await db.from('audit_log').insert({
        user_nama: kasir, tabel: 'profiles', record_id: profileId,
        aksi: 'EDIT', field: 'akun-login',
        nilai_baru: JSON.stringify(updates),
        outlet: 'SYSTEM',
      });
      return NextResponse.json({ ok: true });
    }

    // ── Akun Login: delete account + profile ──────────────────
    if (action === 'akun-login-delete') {
      const { id: profileId } = body;
      if (!profileId) return NextResponse.json({ ok: false, msg: 'ID profile wajib.' });

      // Get current profile info for audit
      const { data: prof } = await db.from('profiles').select('*').eq('id', profileId).single();

      // 1. Delete profile first (FK constraint: profiles → auth.users ON DELETE CASCADE)
      // Actually, delete auth user will cascade to profile. Let's delete auth user.
      const { error: authDelErr } = await db.auth.admin.deleteUser(profileId);
      if (authDelErr) return NextResponse.json({ ok: false, msg: 'Gagal hapus akun: ' + authDelErr.message });

      await db.from('audit_log').insert({
        user_nama: kasir, tabel: 'profiles', record_id: profileId,
        aksi: 'DELETE', field: 'akun-login',
        nilai_lama: prof ? JSON.stringify(prof) : '',
        outlet: 'SYSTEM',
      });
      return NextResponse.json({ ok: true, msg: 'Akun berhasil dihapus.' });
    }

    return NextResponse.json({ ok: false, msg: 'Unknown action' });
  } catch (err) {
    console.error('[owner POST]', err);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(err) }, { status: 500 });
  }
}
