// ============================================================
// File: lib/wa/types.ts
// Tipe data untuk modul WhatsApp automation
// ============================================================

export type WaProvider = 'WABLAS' | 'FONNTE' | 'WHACENTER' | 'MOCK';

export type WaStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'READ'
  | 'FAILED'
  | 'SKIPPED';

export type WaTemplateCategory = 'TRANSAKSI' | 'REMINDER' | 'COMPLIANCE';

export interface WaConfig {
  id: number;
  outlet_id: number;
  provider: WaProvider;
  api_key: string;
  api_secret?: string | null;
  api_base_url?: string | null;
  nomor_pengirim: string;
  nomor_backup?: string | null;
  enabled: boolean;
  status: 'ACTIVE' | 'BANNED' | 'PAUSED';
  daily_quota: number;
}

export interface WaTemplate {
  code: string;
  category: WaTemplateCategory;
  description: string | null;
  body: string;
  is_active: boolean;
}

/**
 * Input untuk sendWA() — universal, provider-agnostic.
 */
export interface SendWaInput {
  /** Outlet ID — untuk pilih config Wablas mana yang dipakai */
  outletId: number;

  /** Template code di tb_wa_template (mis. 'GADAI_NEW', 'DISKON_CONFIRM') */
  templateCode: string;

  /** Variables untuk render placeholder {{var}} dalam body template */
  vars: Record<string, string | number | null | undefined>;

  /** Nomor tujuan utama (telp1) — required */
  toNumber: string;

  /** Nomor tujuan kedua (telp2) — optional, kalau ada akan kirim 2x */
  toNumber2?: string;

  /** Reference ke transaksi (untuk audit + dedupe) */
  refTable?: string; // 'tb_gadai' | 'tb_sjb' | ...
  refId?: string;
  noFaktur?: string;
  namaNasabah?: string;

  /**
   * Dedupe window dalam jam.
   * Kalau ada outgoing dengan template_code + ref_id yang sama
   * dalam window ini → SKIP kirim ulang.
   * Default: 12 jam.
   */
  dedupeHours?: number;
}

export interface SendWaResult {
  ok: boolean;
  status: WaStatus;
  outgoingIds: number[]; // ID row di tb_wa_outgoing (bisa 1 atau 2 kalau telp2 juga)
  skipReason?: string;
  error?: string;
}

/**
 * Hasil call adapter ke provider eksternal.
 * Adapter wajib return shape ini (tidak throw).
 */
export interface AdapterResult {
  ok: boolean;
  providerMsgId?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface AdapterSendArgs {
  config: WaConfig;
  toNumber: string;
  message: string;
}
