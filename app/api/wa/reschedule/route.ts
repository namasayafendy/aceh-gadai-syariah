// ============================================================
// File: app/api/wa/reschedule/route.ts
//
// POST endpoint untuk kasir/owner dari dashboard /wa-inbox.
// Pakai PIN auth (kasir bisa handle balasan di outlet sendiri,
// owner bisa di mana saja).
//
// Body: {
//   pin: string;
//   outletId: number;
//   incomingId: number;
//   action: 'tunda' | 'contacted' | 'eskalasi' | 'reopen';
//   days?: number;       // untuk action='tunda' (default 7)
//   customDate?: string; // YYYY-MM-DD optional, override days
//   reason?: string;     // catatan optional
// }
//
// Action behavior:
//   tunda     -> set reminder_next_at = now + days, kontrak state RESCHEDULED,
//                incoming.state = HANDLED
//   contacted -> kontrak state MANUAL_CONTACTED (kasir telpon manual),
//                incoming.state = HANDLED. Reminder berikutnya tetap jalan
//                untuk slot lain (mis. H-1 sudah handle, H-0 tetap kirim).
//   eskalasi  -> incoming.state = HANDLED dengan note "escalated", kontrak
//                state AUTO (lanjutkan reminder normal). Owner harus follow-up.
//   reopen    -> incoming.state = NEW (kalau salah klik handled tadinya),
//                kontrak state HUMAN_HANDLING.
// ============================================================

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  try {
    const db = await createServiceClient();
    const body = await request.json();

    const outletId = Number(body.outletId);
    const incomingId = Number(body.incomingId);
    const action = String(body.action || '');
    if (!outletId || !incomingId || !action) {
      return NextResponse.json({ ok: false, msg: 'outletId, incomingId, action wajib' });
    }

    // ── PIN check (kasir / admin / owner) ──
    const { data: pinResult } = await db.rpc('validate_pin', {
      p_pin: String(body.pin || '').trim(),
      p_outlet_id: outletId,
    });
    if (!pinResult?.ok) return NextResponse.json({ ok: false, msg: pinResult?.msg ?? 'PIN tidak valid' });
    const role = String(pinResult.role || '').toUpperCase();
    if (!['KASIR', 'ADMIN', 'OWNER'].includes(role)) {
      return NextResponse.json({ ok: false, msg: 'Role tidak punya akses' });
    }
    const handlerName = String(pinResult.nama || 'unknown');

    // ── Fetch incoming row ──
    const { data: incoming } = await db
      .from('tb_wa_incoming')
      .select('*')
      .eq('id', incomingId)
      .maybeSingle();
    if (!incoming) {
      return NextResponse.json({ ok: false, msg: 'Balasan WA tidak ditemukan' });
    }
    const inc = incoming as any;

    // Kasir cuma boleh handle outlet sendiri (kecuali OWNER/ADMIN)
    if (role === 'KASIR' && Number(inc.outlet_id) !== outletId) {
      return NextResponse.json({ ok: false, msg: 'Kasir cuma boleh handle outlet sendiri' });
    }

    const now = new Date();

    // ── Eksekusi action ──
    if (action === 'tunda') {
      let nextAt: Date;
      if (body.customDate) {
        nextAt = new Date(String(body.customDate) + 'T09:00:00+07:00');
      } else {
        const days = Math.max(1, Math.min(60, Number(body.days) || 7));
        nextAt = new Date(now.getTime() + days * 86400000);
      }

      // Update incoming
      await db
        .from('tb_wa_incoming')
        .update({
          state: 'HANDLED',
          handled_by: handlerName,
          handled_at: now.toISOString(),
          reschedule_to: nextAt.toISOString(),
          reschedule_reason: String(body.reason || '').slice(0, 500) || null,
        })
        .eq('id', incomingId);

      // Update kontrak: state RESCHEDULED + reminder_next_at
      if (inc.ref_table === 'tb_gadai' && inc.ref_id) {
        await db
          .from('tb_gadai')
          .update({ reminder_state: 'RESCHEDULED', reminder_next_at: nextAt.toISOString() })
          .eq('id', inc.ref_id);
      } else if (inc.ref_table === 'tb_sjb' && inc.ref_id) {
        await db
          .from('tb_sjb')
          .update({ reminder_state: 'RESCHEDULED', reminder_next_at: nextAt.toISOString() })
          .eq('id', inc.ref_id);
      }

      return NextResponse.json({
        ok: true,
        msg: `Reminder di-set ke ${nextAt.toLocaleDateString('id-ID')}`,
        rescheduleTo: nextAt.toISOString(),
      });
    }

    if (action === 'contacted') {
      await db
        .from('tb_wa_incoming')
        .update({
          state: 'HANDLED',
          handled_by: handlerName,
          handled_at: now.toISOString(),
          reschedule_reason: String(body.reason || 'Dihubungi manual via telepon').slice(0, 500),
        })
        .eq('id', incomingId);

      // Kontrak: state MANUAL_CONTACTED (auto-reminder tetap jalan untuk slot lain)
      if (inc.ref_table === 'tb_gadai' && inc.ref_id) {
        await db.from('tb_gadai').update({ reminder_state: 'MANUAL_CONTACTED' }).eq('id', inc.ref_id);
      } else if (inc.ref_table === 'tb_sjb' && inc.ref_id) {
        await db.from('tb_sjb').update({ reminder_state: 'MANUAL_CONTACTED' }).eq('id', inc.ref_id);
      }

      return NextResponse.json({ ok: true, msg: 'Ditandai sudah dihubungi manual' });
    }

    if (action === 'eskalasi') {
      await db
        .from('tb_wa_incoming')
        .update({
          state: 'HANDLED',
          handled_by: handlerName,
          handled_at: now.toISOString(),
          reschedule_reason: `ESKALASI: ${String(body.reason || '').slice(0, 480)}`,
        })
        .eq('id', incomingId);

      // Kontrak: kembali ke AUTO (auto-reminder berikutnya tetap kirim sebagai tekanan)
      if (inc.ref_table === 'tb_gadai' && inc.ref_id) {
        await db.from('tb_gadai').update({ reminder_state: 'AUTO', reminder_next_at: null }).eq('id', inc.ref_id);
      } else if (inc.ref_table === 'tb_sjb' && inc.ref_id) {
        await db.from('tb_sjb').update({ reminder_state: 'AUTO', reminder_next_at: null }).eq('id', inc.ref_id);
      }

      return NextResponse.json({ ok: true, msg: 'Dieskalasi — auto-reminder lanjut, owner perlu follow-up' });
    }

    if (action === 'reopen') {
      await db
        .from('tb_wa_incoming')
        .update({ state: 'NEW', handled_by: null, handled_at: null })
        .eq('id', incomingId);

      if (inc.ref_table === 'tb_gadai' && inc.ref_id) {
        await db.from('tb_gadai').update({ reminder_state: 'HUMAN_HANDLING' }).eq('id', inc.ref_id);
      } else if (inc.ref_table === 'tb_sjb' && inc.ref_id) {
        await db.from('tb_sjb').update({ reminder_state: 'HUMAN_HANDLING' }).eq('id', inc.ref_id);
      }

      return NextResponse.json({ ok: true, msg: 'Reopen — kembali ke NEW state' });
    }

    return NextResponse.json({ ok: false, msg: `Action '${action}' tidak dikenali` });
  } catch (e) {
    console.error('[wa/reschedule]', e);
    return NextResponse.json({ ok: false, msg: 'Server error: ' + String(e) }, { status: 500 });
  }
}
