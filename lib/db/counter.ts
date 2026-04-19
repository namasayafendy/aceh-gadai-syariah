// ============================================================
// ACEH GADAI SYARIAH - Counter Helper
// File: lib/db/counter.ts
//
// Ensures counter entries exist for any outlet.
// Mirrors GAS getNextID() + Supabase RPC get_next_id() logic:
//
// RPC get_next_id uses a label_map to convert p_tipe to DB label:
//   'SBR'        → 'Gadai SBR'       (per-outlet, outlet_id = N)
//   'SJB'        → 'Jual Titip SJB'  (per-outlet, outlet_id = N)
//   'GADAI'      → 'ID Gadai'        (shared, outlet_id = 0)
//   'TEBUS'      → 'ID Tebus'        (shared, outlet_id = 0)
//   'JUAL'       → 'ID Jual'         (shared, outlet_id = 0)
//   'BUYBACK'    → 'ID Buyback'      (shared, outlet_id = 0)
//   'KAS'        → 'ID Kas'          (shared, outlet_id = 0)
//   'DISKON'     → 'ID Diskon'       (shared, outlet_id = 0)
//   'TTS'        → 'ID TTS'          (shared, outlet_id = 0)
//   'SITA'       → 'Sita ID'         (shared, outlet_id = 0)
//   'KEHILANGAN' → 'ID Kehilangan'   (shared, outlet_id = 0)
//
// RPC get_next_barcode_a uses 'Barcode Konsumen' (per-outlet)
//
// Shared types always use outlet_id=0 (one counter for all outlets).
// Per-outlet types use outlet_id = actual outlet ID.
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Label map matching RPC get_next_id ─────────────────────
const LABEL_MAP: Record<string, string> = {
  SBR:         'Gadai SBR',
  SJB:         'Jual Titip SJB',
  GADAI:       'ID Gadai',
  TEBUS:       'ID Tebus',
  JUAL:        'ID Jual',
  BUYBACK:     'ID Buyback',
  KAS:         'ID Kas',
  DISKON:      'ID Diskon',
  TTS:         'ID TTS',
  SITA:        'Sita ID',
  KEHILANGAN:  'ID Kehilangan',
};

// Shared types use outlet_id = 0 (global counter)
const SHARED_TYPES = ['GADAI', 'TEBUS', 'JUAL', 'BUYBACK', 'KAS', 'TTS', 'DISKON', 'SITA', 'KEHILANGAN'];

// Per-outlet types: SBR, SJB, BARCODE_A (Barcode Konsumen)
// These get their own counter row per outlet

// Default prefixes for auto-creating missing counters
const PREFIX_MAP: Record<string, (outletId: number) => string> = {
  SBR:         (id) => `SBR-${id}-`,
  SJB:         (id) => `SJB-${id}-`,
  GADAI:       ()   => 'IDG-',
  TEBUS:       ()   => 'TBS-',
  JUAL:        ()   => 'JL-',
  BUYBACK:     ()   => 'BB-',
  KAS:         ()   => 'KAS-',
  DISKON:      ()   => 'DSK-',
  TTS:         ()   => 'TTS-',
  SITA:        ()   => 'GDS-',
  KEHILANGAN:  ()   => 'KHL-',
};

/**
 * Ensures a counter row exists for the given tipe + outlet.
 * Uses the correct label and outlet_id based on RPC logic.
 */
async function ensureCounter(db: SupabaseClient, tipe: string, outletId: number): Promise<void> {
  const label = LABEL_MAP[tipe];
  if (!label) return; // unknown type, RPC will handle the error

  // Shared types always use outlet_id = 0
  const counterOutlet = SHARED_TYPES.includes(tipe) ? 0 : outletId;

  // Check if counter exists
  const { data } = await db.from('counter')
    .select('id')
    .eq('label', label)
    .eq('outlet_id', counterOutlet)
    .limit(1);

  if (data && data.length > 0) return; // already exists

  // Create the missing counter
  const prefixFn = PREFIX_MAP[tipe];
  const prefix = prefixFn ? prefixFn(outletId) : '';

  await db.from('counter').insert({
    label,
    prefix,
    last_val: 0,
    outlet_id: counterOutlet,
  });
}

/**
 * Safe wrapper for get_next_id RPC.
 * If the RPC returns null/error, ensures the counter exists and retries once.
 * Throws an error if it still fails after retry.
 */
export async function safeGetNextId(
  db: SupabaseClient,
  tipe: string,
  outletId: number,
): Promise<string> {
  const { data, error } = await db.rpc('get_next_id', { p_tipe: tipe, p_outlet_id: outletId });

  if (data) return data as string;

  // RPC returned null or error — try to create missing counter and retry
  console.warn(`[counter] get_next_id failed for tipe=${tipe}, outlet=${outletId}. Error: ${error?.message}. Auto-creating counter...`);

  await ensureCounter(db, tipe, outletId);

  const retry = await db.rpc('get_next_id', { p_tipe: tipe, p_outlet_id: outletId });
  if (retry.data) return retry.data as string;

  throw new Error(`get_next_id failed for tipe=${tipe}, outlet=${outletId}: ${retry.error?.message || 'returned null'}`);
}

/**
 * Safe wrapper for get_next_barcode_a RPC.
 */
export async function safeGetNextBarcodeA(
  db: SupabaseClient,
  outletId: number,
): Promise<string> {
  const { data, error } = await db.rpc('get_next_barcode_a', { p_outlet_id: outletId });

  if (data) return data as string;

  // Ensure Barcode Konsumen counter exists and retry
  console.warn(`[counter] get_next_barcode_a failed for outlet=${outletId}. Error: ${error?.message}. Auto-creating counter...`);

  // Barcode Konsumen is per-outlet
  const { data: existing } = await db.from('counter')
    .select('id')
    .eq('label', 'Barcode Konsumen')
    .eq('outlet_id', outletId)
    .limit(1);

  if (!existing || existing.length === 0) {
    await db.from('counter').insert({
      label: 'Barcode Konsumen',
      prefix: '',
      last_val: 0,
      outlet_id: outletId,
    });
  }

  const retry = await db.rpc('get_next_barcode_a', { p_outlet_id: outletId });
  if (retry.data) return retry.data as string;

  throw new Error(`get_next_barcode_a failed for outlet=${outletId}: ${retry.error?.message || 'returned null'}`);
}

/**
 * Ensure all per-outlet counters exist for a given outlet.
 * Called when creating a new outlet.
 * Only creates per-outlet types (SBR, SJB, Barcode Konsumen).
 * Shared types (GADAI, TEBUS, KAS, etc.) use outlet_id=0 and already exist.
 */
export async function ensureAllCounters(db: SupabaseClient, outletId: number): Promise<void> {
  // Per-outlet counters
  await ensureCounter(db, 'SBR', outletId);
  await ensureCounter(db, 'SJB', outletId);

  // Barcode Konsumen (per-outlet, not in LABEL_MAP)
  const { data: existing } = await db.from('counter')
    .select('id')
    .eq('label', 'Barcode Konsumen')
    .eq('outlet_id', outletId)
    .limit(1);

  if (!existing || existing.length === 0) {
    await db.from('counter').insert({
      label: 'Barcode Konsumen',
      prefix: '',
      last_val: 0,
      outlet_id: outletId,
    });
  }
}
