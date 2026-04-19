# PATCH: kas.ts — TAMBAH SPLIT (point 4 only)

**File:** `lib/db/kas.ts`
**Function:** `generateKas()` → `case 'TAMBAH'` → branch `SPLIT`
**Scope:** HANYA mengubah baris terakhir di SPLIT branch (point 4 = "Tambah Cash"). Tidak menyentuh CASH, BANK, atau point 1/2/3 di SPLIT.

---

## Perubahan

**SEBELUM (baris saat ini):**

```ts
} else { // SPLIT
  add(`TAMBAH ${noFaktur}`, 'KELUAR', 'CASH', gb);
  add(`Tambah Pinjaman ${noFaktur}`, 'MASUK', 'CASH', gb - jb);
  if (bank > 0) add(`TF TAMBAH ${noFaktur}`, 'MASUK', 'CASH', bank);
  if (cash > 0) add(`Tambah Cash ${noFaktur}`, 'MASUK', 'CASH', cash);
}
```

**SESUDAH:**

```ts
} else { // SPLIT
  add(`TAMBAH ${noFaktur}`, 'KELUAR', 'CASH', gb);
  add(`Tambah Pinjaman ${noFaktur}`, 'MASUK', 'CASH', gb - jb);
  if (bank > 0) add(`TF TAMBAH ${noFaktur}`, 'MASUK', 'CASH', bank);
  // ── point 4: cash dipotong 10.000 sebelum masuk kas
  if (cash > 10000) add(`Tambah Cash ${noFaktur}`, 'MASUK', 'CASH', cash - 10000);
}
```

---

## Verifikasi perilaku

| Input `cash` | Sebelum (entry kas) | Sesudah (entry kas) |
|--------------|---------------------|---------------------|
| 0            | tidak ada           | tidak ada           |
| 10.000       | MASUK 10.000        | **tidak ada**       |
| 50.000       | MASUK 50.000        | **MASUK 40.000**    |
| 100.000      | MASUK 100.000       | **MASUK 90.000**    |
| < 10.000 (mis. 5.000) | MASUK 5.000 | **tidak ada** (safety: hindari negatif) |

Catatan: untuk `cash <= 10000` tidak ada entry kas yang dibuat — ini melindungi dari nilai negatif yang bisa muncul kalau langsung pakai `cash - 10000` tanpa guard.

---

## Yang TIDAK diubah (jangan utak-atik)

- TAMBAH `CASH` → tetap 2 entry (KELUAR `gb`, MASUK `gb - jb`)
- TAMBAH `BANK` → tetap 3 entry
- TAMBAH `SPLIT` point 1, 2, 3 → identik dengan sebelumnya
- Semua transaksi lain (TEBUS, PERPANJANG, KURANG, GADAI, SJB, BUYBACK, SITA, JUAL) → tidak disentuh
- Pembulatan `ceil1000()` → tetap berlaku (akan otomatis dipakai di `add()`)
- Multi-outlet → tidak terpengaruh (logika ini agnostik terhadap outlet)
