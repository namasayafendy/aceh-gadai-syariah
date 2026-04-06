'use client';

// ============================================================
// ACEH GADAI SYARIAH - usePinValidation Hook
// File: hooks/usePinValidation.ts
//
// Reusable hook untuk validasi PIN di semua form transaksi.
// Menggantikan google.script.run.withSuccessHandler().validatePin()
// di GAS. Panggil ke /api/auth/validate-pin (server-side).
// ============================================================

import { useState, useCallback } from 'react';
import type { PinValidationResult } from '@/types/auth';

interface UsePinValidationOptions {
  onSuccess?: (result: PinValidationResult) => void;
  onError?: (msg: string) => void;
}

interface UsePinValidationReturn {
  loading: boolean;
  error: string;
  result: PinValidationResult | null;
  validate: (pin: string) => Promise<PinValidationResult>;
  reset: () => void;
}

export function usePinValidation(
  options: UsePinValidationOptions = {}
): UsePinValidationReturn {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<PinValidationResult | null>(null);

  const validate = useCallback(
    async (pin: string): Promise<PinValidationResult> => {
      setLoading(true);
      setError('');
      setResult(null);

      try {
        const res = await fetch('/api/auth/validate-pin', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ pin }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          const msg = errData.msg ?? 'Server error. Coba lagi.';
          setError(msg);
          options.onError?.(msg);
          return { ok: false, msg };
        }

        const data: PinValidationResult = await res.json();
        setResult(data);

        if (data.ok) {
          options.onSuccess?.(data);
        } else {
          const msg = data.msg ?? 'PIN tidak valid.';
          setError(msg);
          options.onError?.(msg);
        }

        return data;
      } catch (err) {
        const msg = 'Koneksi gagal. Cek internet Anda.';
        setError(msg);
        options.onError?.(msg);
        return { ok: false, msg };
      } finally {
        setLoading(false);
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError('');
    setResult(null);
  }, []);

  return { loading, error, result, validate, reset };
}

// ── PinInput component ────────────────────────────────────────
// Komponen input PIN 4-digit yang bisa dipakai di mana saja
// (dipisah dari hook agar bisa diimport terpisah)

import React, { useRef } from 'react';

interface PinInputProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit?: (pin: string) => void;
  error?: string;
  loading?: boolean;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function PinInput({
  value,
  onChange,
  onSubmit,
  error,
  loading,
  label     = 'Konfirmasi PIN',
  placeholder = '••••',
  disabled,
}: PinInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
    onChange(v);
    // Auto-submit saat 4 digit terisi
    if (v.length === 4 && onSubmit) {
      onSubmit(v);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && value.length === 4 && onSubmit) {
      onSubmit(value);
    }
  }

  return (
    <div>
      {label && (
        <label className="block text-xs font-medium text-gray-400 mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={inputRef}
        type="password"
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || loading}
        autoComplete="off"
        className="w-full px-3.5 py-2.5 rounded-lg bg-white/5 border
                   text-white placeholder-gray-500 text-sm text-center
                   tracking-[0.5em] font-mono
                   focus:outline-none transition-colors
                   disabled:opacity-50"
        style={{
          borderColor: error
            ? 'rgba(239,68,68,0.5)'
            : 'rgba(255,255,255,0.1)',
        }}
      />
      {error && (
        <p className="mt-1.5 text-xs text-red-400">{error}</p>
      )}
      {loading && (
        <p className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
          <span className="inline-block w-3 h-3 border border-gray-400 border-t-white rounded-full animate-spin" />
          Memverifikasi...
        </p>
      )}
    </div>
  );
}
