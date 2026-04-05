// ============================================================
// ACEH GADAI SYARIAH - Validate PIN API Route
// File: app/api/auth/validate-pin/route.ts
//
// Dipanggil dari client saat kasir mau konfirmasi transaksi
// Mirip validatePin() di GAS — tidak expose PIN ke client
// WAJIB sudah login (session valid) baru bisa panggil endpoint ini
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    // ── 1. Pastikan user sudah login ──────────────────────────
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { ok: false, msg: 'Sesi tidak valid. Silakan login kembali.' },
        { status: 401 }
      );
    }

    // ── 2. Ambil outlet_id dari profile user yang login ───────
    const { data: profile } = await supabase
      .from('profiles')
      .select('outlet_id, status')
      .eq('id', user.id)
      .single();

    const p = profile as { outlet_id: number; status: string } | null;

    if (!p || p.status !== 'AKTIF') {
      return NextResponse.json(
        { ok: false, msg: 'Akun tidak aktif.' },
        { status: 403 }
      );
    }

    // ── 3. Parse body ─────────────────────────────────────────
    const body = await request.json();
    const pin: string = String(body.pin ?? '').trim();

    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return NextResponse.json({ ok: false, msg: 'PIN harus 4 digit angka.' });
    }

    // ── 4. Panggil validate_pin SQL function ──────────────────
    // outlet_id diambil dari session (bukan dari client) — lebih aman
    const serviceClient = await createServiceClient();
    const { data: result, error: rpcError } = await (serviceClient as any)
      .rpc('validate_pin', {
        p_pin:       pin,
        p_outlet_id: p.outlet_id,
      });

    if (rpcError) {
      console.error('[validate-pin] RPC error:', rpcError.message);
      return NextResponse.json(
        { ok: false, msg: 'Server error. Coba lagi.' },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error('[validate-pin] Unexpected error:', err);
    return NextResponse.json(
      { ok: false, msg: 'Server error.' },
      { status: 500 }
    );
  }
}
