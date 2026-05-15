// ============================================================
// File: lib/wa/adapters/mock.ts
// Mock adapter untuk testing — TIDAK call API eksternal.
//
// Dipakai:
// - Saat config provider='MOCK'
// - Saat unit/integration test
// - Saat ENV WA_MOCK_MODE=1 (override semua provider jadi mock)
//
// Behavior:
// - Selalu return ok: true
// - Provider msg ID: "MOCK-<timestamp>-<random>"
// - Tidak ada side-effect ke jaringan
// ============================================================

import type { AdapterResult, AdapterSendArgs } from '../types';

export async function mockSend(_args: AdapterSendArgs): Promise<AdapterResult> {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return {
    ok: true,
    providerMsgId: `MOCK-${ts}-${rand}`,
    rawResponse: { mocked: true, ts },
  };
}
