// ============================================================
// File: lib/wa/normalize.ts
// Helper untuk normalisasi nomor HP & render template
// ============================================================

/**
 * Normalisasi nomor HP Indonesia ke format 62xxx (tanpa + atau 0 di depan).
 * Contoh:
 *   "08123456789"   -> "628123456789"
 *   "8123456789"    -> "628123456789"
 *   "628123456789"  -> "628123456789"
 *   "+628123456789" -> "628123456789"
 *   "(0812) 3456789" -> "628123456789"
 *
 * Return null kalau input tidak valid (kurang dari 9 digit, atau bukan nomor seluler).
 */
export function normalizePhoneID(raw: string | null | undefined): string | null {
  if (!raw) return null;
  // Buang semua non-digit
  let s = String(raw).replace(/[^0-9]/g, '');
  if (!s) return null;

  // Kalau diawali "0", ganti dengan "62"
  if (s.startsWith('0')) {
    s = '62' + s.slice(1);
  }
  // Kalau diawali "8" (langsung tanpa 0/62), tambah 62 di depan
  else if (s.startsWith('8')) {
    s = '62' + s;
  }
  // Kalau sudah 62, biarkan
  else if (s.startsWith('62')) {
    // ok
  } else {
    // Format tidak dikenali untuk Indonesia
    return null;
  }

  // Min 11 digit (62 + 9), max 15 digit
  if (s.length < 11 || s.length > 15) return null;

  // Pastikan diawali 628 (Indonesia mobile)
  if (!s.startsWith('628')) return null;

  return s;
}

/**
 * Render template body dengan substitusi {{var}}.
 * Kalau var tidak ada di vars, biarkan placeholder (untuk debugging),
 * dan log warning di console.
 *
 * Special handling:
 *   - Angka di-format ke ID locale: 1500000 -> "1.500.000"
 *   - Tanggal Date object -> dd/mm/yyyy
 *   - null/undefined -> "—"
 */
export function renderTemplate(
  body: string,
  vars: Record<string, string | number | null | undefined>,
): { rendered: string; missing: string[] } {
  const missing: string[] = [];
  const rendered = body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in vars)) {
      missing.push(key);
      return match; // biarkan {{xxx}} untuk debug
    }
    const v = vars[key];
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'number') return formatNumber(v);
    return String(v);
  });
  return { rendered, missing };
}

/** Format angka ke ID locale (ribuan pakai titik). */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return new Intl.NumberFormat('id-ID').format(Math.round(n));
}

/** Format tanggal ISO/Date ke dd/mm/yyyy (Asia/Jakarta). */
export function formatDateID(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Jakarta',
  });
}
