'use client';

// ============================================================
// ACEH GADAI SYARIAH - Diskon Approval Modal (Fase 3)
// File: components/ui/DiskonApprovalModal.tsx
//
// Modal yang muncul saat kasir submit tebus/buyback dengan diskon
// ≥ Rp 10.000. Kasir harus menunggu Owner approve/reject via Telegram.
//
// - Subscribe ke Supabase realtime untuk row tb_diskon yang lagi
//   di-proses.
// - Polling fallback tiap 5 detik kalau realtime belum aktif.
// - Bunyi "ting" saat status berubah APPROVED.
// - 3 tombol tergantung state:
//   • PENDING   → "Batal Tunggu" (cancel, tidak rollback row DB)
//   • APPROVED  → "Lanjutkan Submit" (parent akan finalize transaksi)
//   • REJECTED  → "Tutup" / "Ajukan Ulang" (parent reset form tapi set id_parent)
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type DiskonStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface DiskonApprovalModalProps {
  idDiskon: string;
  /** Dipanggil saat kasir tekan "Lanjutkan Submit" setelah APPROVED */
  onApproved: () => void;
  /** Dipanggil saat kasir tekan "Ajukan Ulang" setelah REJECTED. alasan = alasan_reject dari Owner */
  onRejected: (alasan: string) => void;
  /** Dipanggil saat kasir tekan "Batal Tunggu" atau "Tutup" */
  onCancel: () => void;
}

export default function DiskonApprovalModal({
  idDiskon, onApproved, onRejected, onCancel,
}: DiskonApprovalModalProps) {
  const [status, setStatus] = useState<DiskonStatus>('PENDING');
  const [alasanReject, setAlasanReject] = useState<string>('');
  const [elapsed, setElapsed] = useState(0);
  const pingedRef = useRef(false);

  // Timer detik berjalan
  useEffect(() => {
    const t = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Polling via API (service client, bypass RLS) + realtime bonus
  useEffect(() => {
    if (!idDiskon) return;
    const sb = createClient();
    let mounted = true;

    async function fetchState() {
      try {
        const res = await fetch(`/api/diskon/status?id=${encodeURIComponent(idDiskon)}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (!mounted || !json?.ok) return;
        const st = json.status as string;
        if (st === 'PENDING' || st === 'APPROVED' || st === 'REJECTED') {
          setStatus(st);
          if (st === 'APPROVED' && !pingedRef.current) {
            playTing(); pingedRef.current = true;
          }
        }
        if (json.alasanReject) setAlasanReject(String(json.alasanReject));
      } catch { /* silent */ }
    }

    // Realtime (bonus — kalau RLS membolehkan, lebih cepat dari polling)
    const channel = sb
      .channel(`diskon-${idDiskon}`)
      .on('postgres_changes' as any, {
        event: 'UPDATE',
        schema: 'public',
        table: 'tb_diskon',
        filter: `id_diskon=eq.${idDiskon}`,
      }, (payload: any) => {
        const row = payload?.new;
        if (!row) return;
        if (row.status === 'PENDING' || row.status === 'APPROVED' || row.status === 'REJECTED') {
          setStatus(row.status);
          if (row.status === 'APPROVED' && !pingedRef.current) {
            playTing(); pingedRef.current = true;
          }
        }
        if (row.alasan_reject) setAlasanReject(String(row.alasan_reject));
      })
      .subscribe();

    // Initial fetch + polling tiap 3 detik (utama)
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

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full overflow-hidden">
        {status === 'PENDING' && (
          <>
            <div className="bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-center text-white">
              <div className="text-6xl mb-2 animate-pulse">⏳</div>
              <h3 className="text-xl font-bold">Menunggu Approval Owner</h3>
              <p className="text-sm opacity-90 mt-1">
                ID: <span className="font-mono">{idDiskon}</span>
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-700 text-center">
                Notifikasi sudah dikirim ke grup Telegram.<br />
                Mohon tunggu Owner menekan APPROVE / REJECT.
              </p>
              <div className="text-center text-3xl font-mono text-gray-800 tracking-wider">
                {mm}:{ss}
              </div>
              <button
                onClick={onCancel}
                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium"
              >
                Batal Tunggu
              </button>
              <p className="text-[11px] text-gray-400 text-center">
                Membatalkan tunggu TIDAK menghapus request — Owner masih bisa approve/reject nanti.
              </p>
            </div>
          </>
        )}

        {status === 'APPROVED' && (
          <>
            <div className="bg-gradient-to-br from-emerald-400 to-green-600 p-6 text-center text-white">
              <div className="text-6xl mb-2">✅</div>
              <h3 className="text-xl font-bold">DISKON DI-APPROVE</h3>
              <p className="text-sm opacity-90 mt-1">
                ID: <span className="font-mono">{idDiskon}</span>
              </p>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-700 text-center">
                Owner telah menyetujui. Silakan lanjutkan submit transaksi.
              </p>
              <button
                onClick={onApproved}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-semibold text-lg"
              >
                LANJUTKAN SUBMIT
              </button>
              <button
                onClick={onCancel}
                className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 text-sm"
              >
                Batal
              </button>
            </div>
          </>
        )}

        {status === 'REJECTED' && (
          <>
            <div className="bg-gradient-to-br from-rose-500 to-red-600 p-6 text-center text-white">
              <div className="text-6xl mb-2">❌</div>
              <h3 className="text-xl font-bold">DISKON DI-REJECT</h3>
              <p className="text-sm opacity-90 mt-1">
                ID: <span className="font-mono">{idDiskon}</span>
              </p>
            </div>
            <div className="p-6 space-y-4">
              {alasanReject ? (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3">
                  <div className="text-xs text-rose-600 font-medium mb-1">Alasan dari Owner:</div>
                  <div className="text-gray-800 text-sm whitespace-pre-wrap">{alasanReject}</div>
                </div>
              ) : (
                <p className="text-center text-gray-500 text-sm italic">
                  Menunggu alasan dari Owner...
                </p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 py-2 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium"
                >
                  Tutup
                </button>
                <button
                  onClick={() => onRejected(alasanReject)}
                  className="flex-1 py-2 px-4 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium"
                >
                  Ajukan Ulang
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
