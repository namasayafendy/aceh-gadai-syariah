// ============================================================
// ACEH GADAI SYARIAH - Format Helpers
// File: lib/format.ts
// ============================================================

/**
 * Format angka ke Rupiah: 1500000 → "Rp 1.500.000"
 */
export function formatRp(val: number | string | null | undefined): string {
  const num = typeof val === 'string' ? parseFloat(val) || 0 : (val ?? 0);
  return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

/**
 * Format angka tanpa prefix Rp: 1500000 → "1.500.000"
 */
export function formatNum(val: number | string | null | undefined): string {
  const num = typeof val === 'string' ? parseFloat(val) || 0 : (val ?? 0);
  return Math.round(num).toLocaleString('id-ID');
}

/**
 * Parse money input string ke number: "1.500.000" → 1500000
 */
export function parseMoney(str: string): number {
  return parseInt(str.replace(/[^0-9-]/g, '') || '0', 10);
}

/**
 * Format money input — dipakai di oninput handler
 * Menghapus non-digit, lalu format ribuan
 */
export function formatMoneyInput(value: string): string {
  const raw = value.replace(/[^0-9]/g, '');
  const num = parseInt(raw || '0', 10);
  return num > 0 ? num.toLocaleString('id-ID') : '';
}

/**
 * Format money input yang bisa minus (untuk split payment cash bisa minus)
 */
export function formatMoneyInputSigned(value: string): string {
  const neg = value.startsWith('-');
  const raw = value.replace(/[^0-9]/g, '');
  const num = parseInt(raw || '0', 10);
  if (num === 0) return neg ? '-' : '';
  return (neg ? '-' : '') + num.toLocaleString('id-ID');
}

/**
 * Format tanggal ke DD/MM/YYYY
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/**
 * Format tanggal + jam
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Tanggal hari ini format YYYY-MM-DD (untuk input date & query API)
 */
export function todayISO(): string {
  const d = new Date();
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}
