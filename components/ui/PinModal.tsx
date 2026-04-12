'use client';

// ============================================================
// ACEH GADAI SYARIAH - PIN Modal
// File: components/ui/PinModal.tsx
// Modal numpad 4-digit PIN — mirip GAS Index.html #pin-modal
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import { useOutletId } from '@/components/auth/AuthProvider';

interface PinModalProps {
  open: boolean;
  action: string;               // e.g. "SUBMIT GADAI", "TEBUS KONTRAK"
  onSuccess: (pin: string, kasirName: string) => void;
  onCancel: () => void;
}

export default function PinModal({ open, action, onSuccess, onCancel }: PinModalProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const outletId = useOutletId();

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setPin('');
      setError('');
      setLoading(false);
    }
  }, [open]);

  // Keyboard support
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9' && pin.length < 4) {
        setPin(p => p + e.key);
        setError('');
      } else if (e.key === 'Backspace') {
        setPin(p => p.slice(0, -1));
        setError('');
      } else if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, pin, onCancel]);

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (pin.length === 4) {
      validatePin(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const validatePin = useCallback(async (pinVal: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/validate-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinVal, outletId }),
      });
      const json = await res.json();
      if (json.ok) {
        onSuccess(pinVal, json.nama ?? 'Kasir');
      } else {
        setError(json.msg ?? 'PIN salah');
        setPin('');
      }
    } catch {
      setError('Gagal validasi PIN');
      setPin('');
    }
    setLoading(false);
  }, [outletId, onSuccess]);

  const pressKey = (key: string) => {
    if (loading) return;
    if (key === 'DEL') {
      setPin(p => p.slice(0, -1));
      setError('');
    } else if (pin.length < 4) {
      setPin(p => p + key);
      setError('');
    }
  };

  if (!open) return null;

  return (
    <div className="pin-overlay" onClick={onCancel}>
      <div className="pin-modal" onClick={e => e.stopPropagation()}>
        <h3>🔐 Konfirmasi PIN</h3>
        <div className="sub">Masukkan PIN kasir untuk melanjutkan</div>
        <div className="pin-action">{action}</div>

        {/* Dots */}
        <div className="pin-dots">
          {[0,1,2,3].map(i => (
            <div key={i} className={`pin-dot ${i < pin.length ? 'filled' : ''}`} />
          ))}
        </div>

        {/* Error */}
        <div className="pin-error">{error}</div>

        {/* Numpad */}
        <div className="pin-numpad">
          {['1','2','3','4','5','6','7','8','9','','0','DEL'].map((key, i) => {
            if (key === '') return <div key={i} />;
            return (
              <div
                key={i}
                className={`pin-key ${key === 'DEL' ? 'del' : ''}`}
                onClick={() => pressKey(key)}
              >
                {key === 'DEL' ? '⌫' : key}
              </div>
            );
          })}
        </div>

        {/* Cancel */}
        <button className="pin-cancel" onClick={onCancel} disabled={loading}>
          Batal
        </button>
      </div>
    </div>
  );
}
