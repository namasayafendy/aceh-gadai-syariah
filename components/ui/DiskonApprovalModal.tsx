'use client';

// ============================================================
// ACEH GADAI SYARIAH - Diskon Approval Modal (Fase 3)
// File: components/ui/DiskonApprovalModal.tsx
//
// Modal yang muncul saat kasir submit tebus/buyback dengan diskon
// >= Rp 10.000. Kasir harus menunggu Owner approve/reject via Telegram.
//
// - Polling via /api/diskon/status tiap 3 detik (server-side, bypass RLS).
// - Supabase realtime sebagai bonus (kalau RLS membolehkan, lebih cepat).
// - Bunyi "ting" saat status berubah APPROVED.
// - 3 tombol tergantung state:
//   - PENDING   -> "Batal Tunggu" (cancel, tidak rollback row DB)
//   - APPROVED  -> "Lanjutkan Submit" (parent akan finalize transaksi)
//   - REJECTED  -> "Tutup" / "Ajukan Ulang"
//
// IMPORTANT: Pakai inline styles (CSS vars dari globals.css) - project
// tidak punya Tailwind aktif.
// ============================================================

import { useEffect, useRef, useState, CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/client';

export type DiskonStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DiskonApprovalModalProps {
  idDiskon: string;
  onApproved: () => void;
  onRejected: (alasan: string) => void;
  onCancel: () => void;
}

export default function DiskonApprovalModal({
  idDiskon, onApproved, onRejected, onCancel,
}: DiskonApprovalModalProps) {
  const [status, setStatus] = useState<DiskonStatus>('PENDING');
  const [alasanReject, setAlasanReject] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const pingedRef = useRef(false);

  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!idDiskon) return;
    const sb = createClient();
    let mounted = true;

    async function fetchState() {
      try {
        const res = await fetch(`/api/diskon/status?id=${encodeURIComponent(idDiskon)}`, { cache: 'no-store' });
        const json = await res.json();
        if (!mounted || !json?.ok) return;
        const st = json.status as string;
        if (st === 'PENDING' || st === 'APPROVED' || st === 'REJECTED') {
          setStatus(st);
          if (st === 'APPROVED' && !pingedRef.current) { playTing(); pingedRef.current = true; }
        }
        if (json.alasanReject) setAlasanReject(String(json.alasanReject));
      } catch { /* silent */ }
    }

    const channel = sb
      .channel(`diskon-${idDiskon}`)
      .on('postgres_changes' as any, {
        event: 'UPDATE', schema: 'public', table: 'tb_diskon',
        filter: `id_diskon=eq.${idDiskon}`,
      }, (payload: any) => {
        const row = payload?.new;
        if (!row) return;
        if (row.status === 'PENDING' || row.status === 'APPROVED' || row.status === 'REJECTED') {
          setStatus(row.status);
          if (row.status === 'APPROVED' && !pingedRef.current) { playTing(); pingedRef.current = true; }
        }
        if (row.alasan_reject) setAlasanReject(String(row.alasan_reject));
      })
      .subscribe();

    fetchState();
    const poll = setInterval(fetchState, 3000);

    return () => {
      mounted = false;
      try { channel.unsubscribe(); } catch {}
      clearInterval(poll);
    };
  }, [idDiskon]);

  function playTing() {
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(1200, ctx.currentTime);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + 0.5);
    } catch { /* silent */ }
  }

  const mm = Math.floor(elapsed / 60).toString().padStart(2, '0');
  const ss = (elapsed % 60).toString().padStart(2, '0');

  const overlay: CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,.7)',
    zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center',
    backdropFilter: 'blur(4px)', padding: 16,
  };
  const modal: CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 16, width: 440, maxWidth: '100%',
    boxShadow: '0 25px 50px rgba(0,0,0,.5)', overflow: 'hidden',
  };
  const header: CSSProperties = { padding: '24px 20px', textAlign: 'center', color: '#fff' };
  const body: CSSProperties = { padding: 20, display: 'flex', flexDirection: 'column', gap: 14 };
  const bigEmoji: CSSProperties = { fontSize: 48, lineHeight: 1, marginBottom: 8 };
  const title: CSSProperties = { fontSize: 18, fontWeight: 700 };
  const sub: CSSProperties = { fontSize: 12, opacity: .9, marginTop: 4, fontFamily: 'var(--mono)' };
  const textS: CSSProperties = { color: 'var(--text)', fontSize: 13, textAlign: 'center', lineHeight: 1.5 };
  const btnBase: CSSProperties = {
    padding: '12px 16px', borderRadius: 8, border: 'none', cursor: 'pointer',
    fontSize: 14, fontWeight: 600, width: '100%',
  };
  const btnPrimary: CSSProperties = { ...btnBase, background: 'var(--green)', color: '#fff', fontSize: 15, padding: '14px 16px' };
  const btnSec: CSSProperties = { ...btnBase, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text2)' };
  const btnBlue: CSSProperties = { ...btnBase, background: 'var(--accent)', color: '#fff' };
  const timer: CSSProperties = { textAlign: 'center', fontSize: 30, fontFamily: 'var(--mono)', color: 'var(--text)', letterSpacing: 2 };
  const rejectBox: CSSProperties = { background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 8, padding: 12 };

  return (
    <div style={overlay} onClick={(e) => e.stopPropagation()}>
      <div style={modal} onClick={(e) => e.stopPropagation()}>
        {status === 'PENDING' && (
          <>
            <div style={{ ...header, background: 'linear-gradient(135deg, #f59e0b, #ea580c)' }}>
              <div style={bigEmoji}>⏳</div>
              <div style={title}>Menunggu Approval Owner</div>
              <div style={sub}>ID: {idDiskon}</div>
            </div>
            <div style={body}>
              <div style={textS}>Notifikasi sudah dikirim ke grup Telegram. Mohon tunggu Owner menekan APPROVE / REJECT.</div>
              <div style={timer}>{mm}:{ss}</div>
              <button style={btnSec} onClick={onCancel}>Batal Tunggu</button>
              <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                Membatalkan tunggu TIDAK menghapus request - Owner masih bisa approve/reject nanti.
              </div>
            </div>
          </>
        )}

        {status === 'APPROVED' && (
          <>
            <div style={{ ...header, background: 'linear-gradient(135deg, #10b981, #059669)' }}>
              <div style={bigEmoji}>✅</div>
              <div style={title}>DISKON DI-APPROVE</div>
              <div style={sub}>ID: {idDiskon}</div>
            </div>
            <div style={body}>
              <div style={textS}>Owner telah menyetujui. Silakan lanjutkan submit transaksi.</div>
              <button style={btnPrimary} onClick={onApproved}>LANJUTKAN SUBMIT</button>
              <button style={btnSec} onClick={onCancel}>Batal</button>
            </div>
          </>
        )}

        {status === 'REJECTED' && (
          <>
            <div style={{ ...header, background: 'linear-gradient(135deg, #f43f5e, #dc2626)' }}>
              <div style={bigEmoji}>❌</div>
              <div style={title}>DISKON DI-REJECT</div>
              <div style={sub}>ID: {idDiskon}</div>
            </div>
            <div style={body}>
              {alasanReject ? (
                <div style={rejectBox}>
                  <div style={{ fontSize: 11, color: 'var(--red)', fontWeight: 600, marginBottom: 4 }}>Alasan dari Owner:</div>
                  <div style={{ color: 'var(--text)', fontSize: 13, whiteSpace: 'pre-wrap' }}>{alasanReject}</div>
                </div>
              ) : (
                <div style={{ ...textS, color: 'var(--text3)', fontStyle: 'italic' }}>Menunggu alasan dari Owner...</div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={{ ...btnSec, flex: 1 }} onClick={onCancel}>Tutup</button>
                <button style={{ ...btnBlue, flex: 1 }} onClick={() => onRejected(alasanReject)}>Ajukan Ulang</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
