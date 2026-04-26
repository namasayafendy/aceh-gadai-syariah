ini adalah project memindahkan aplikasi gadai lama saya di GAS ke aplikasi baru dengan supabase+ vercel supaya menjaga nantinya kalau data sudah terlalu banyak aplikasi tidak "lag"

jangan ganti fungsi2 yg tidak besangkutan dengan yg disuruh dan hanya lakukan edit seminimal mungkin dan seperlunya tanpa merusak fungsi2 yg lain dan usahakan selalu cek dengan cara kerja aplikasi lama di GAS karena itu sudah 99% benar cara kerjanya

## Catatan Teknis (untuk Claude sesi mendatang)

### Deprecation: middleware.ts → proxy.ts
- Next.js 16.2 sudah deprecate `middleware.ts` file convention. Saat build di Vercel muncul warning:
  > The "middleware" file convention is deprecated. Please use "proxy" instead.
- Status saat ini: **BIARKAN tetap pakai `middleware.ts`** (di root project). Cuma warning, app jalan normal, cron/auth/dll tidak terpengaruh.
- **Kapan perlu migrasi:** saat upgrade ke Next.js 17 atau 18 (estimasi 2026 H2 / 2027). Sebelum itu API `proxy` di Next.js masih dianggap belum stabil.
- **Risiko jika dipaksa migrasi sekarang:** middleware project ini handle auth Supabase + redirect /login + session refresh — kalau salah migrate, login kasir bisa break (= operasional outlet stuck). Tidak sebanding dgn cuma menghilangkan warning.
- **Kalau memang harus migrasi nanti**, urutan: (1) test di branch terpisah, (2) verify login OWNER + KASIR + ADMIN, (3) verify session polling 15 detik tetap jalan, (4) verify redirect /login kalau session expired, (5) baru merge.
