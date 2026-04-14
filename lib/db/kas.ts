// ============================================================
// ACEH GADAI SYARIAH - Kas Generator
// File: lib/db/kas.ts
//
// Replika persis _generateKas() di GAS Code.gs
// Keterangan format: "Gadai SBR-xxx", "Tebus SBR-xxx", dll
// Pembulatan ke atas kelipatan 1000 (ceil1000)
//
// ⚠️ ALUR KAS TIDAK BOLEH DIUBAH — custom sesuai pembukuan
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

export type TipeTransaksi =
  | 'GADAI' | 'SJB'
  | 'TEBUS' | 'BUYBACK' | 'PERPANJANG'
  | 'TAMBAH' | 'KURANG'
  | 'SITA' | 'JUAL';

export type PaymentMethod = 'CASH' | 'BANK' | 'SPLIT';

export interface GenerateKasParams {
  noFaktur:        string;
  noRef?:          string;       // override noRef (e.g. idTebus)
  jenisTransaksi:  TipeTransaksi;
  payment:         PaymentMethod;
  cash:            number;
  bank:            number;
  jumlahGadai:     number;
  jumlahGadaiBaru?: number;     // untuk TAMBAH / KURANG
  ujrahBerjalan?:  number;
  taksiran?:       number;
  taksiranJual?:   number;
  taksiranSita?:   number;
  jumlahBayar?:    number;
  user:            string;
  outlet:          string;
}

// Pembulatan ke atas kelipatan 1000 (positif & negatif)
function ceil1000(v: number): number {
  const n = parseFloat(String(v)) || 0;
  if (n === 0) return 0;
  return n < 0
    ? -Math.ceil(Math.abs(n) / 1000) * 1000
    :  Math.ceil(n / 1000) * 1000;
}

export async function generateKas(
  db: SupabaseClient,
  outletId: number,
  p: GenerateKasParams
): Promise<void> {
  const {
    noFaktur, noRef: noRefOverride, jenisTransaksi, payment, cash, bank,
    jumlahGadai, jumlahGadaiBaru, ujrahBerjalan,
    taksiran, taksiranJual, taksiranSita, jumlahBayar, user, outlet
  } = p;

  const entries: {
    ket: string; tipe: 'MASUK' | 'KELUAR'; tipeKas: 'CASH' | 'BANK'; jml: number;
  }[] = [];

  const kasRef = noRefOverride || noFaktur;

  const add = (ket: string, tipe: 'MASUK' | 'KELUAR', tipeKas: 'CASH' | 'BANK', jml: number) => {
    const rounded = ceil1000(jml);
    if (rounded !== 0) {
      entries.push({ ket, tipe, tipeKas, jml: rounded });
    }
  };

  switch (jenisTransaksi) {
    // ── GADAI: uang keluar ke konsumen ────────────────────
    case 'GADAI':
      if (payment === 'CASH') {
        add(`Gadai ${noFaktur}`, 'KELUAR', 'CASH', jumlahGadai);
      } else if (payment === 'BANK') {
        add(`Gadai ${noFaktur}`, 'KELUAR', 'CASH', jumlahGadai);
        add(`TF GADAI ${noFaktur}`, 'MASUK', 'CASH', bank);
      } else { // SPLIT
        add(`Gadai ${noFaktur}`, 'KELUAR', 'CASH', Math.abs(cash) + bank);
        if (bank > 0) add(`TF GADAI ${noFaktur}`, 'MASUK', 'CASH', bank);
        if (cash < 0) add(`Kembalian GADAI ${noFaktur}`, 'MASUK', 'CASH', Math.abs(cash));
      }
      break;

    // ── SJB: alur sama persis dengan GADAI ────────────────
    case 'SJB':
      if (payment === 'CASH') {
        add(`SJB ${noFaktur}`, 'KELUAR', 'CASH', jumlahGadai);
      } else if (payment === 'BANK') {
        add(`SJB ${noFaktur}`, 'KELUAR', 'CASH', jumlahGadai);
        add(`TF SJB ${noFaktur}`, 'MASUK', 'CASH', bank);
      } else { // SPLIT
        add(`SJB ${noFaktur}`, 'KELUAR', 'CASH', Math.abs(cash) + bank);
        if (bank > 0) add(`TF SJB ${noFaktur}`, 'MASUK', 'CASH', bank);
        if (cash < 0) add(`Kembalian SJB ${noFaktur}`, 'MASUK', 'CASH', Math.abs(cash));
      }
      break;

    // ── TEBUS / BUYBACK / PERPANJANG: uang masuk dari konsumen
    case 'BUYBACK':
    case 'TEBUS':
    case 'PERPANJANG': {
      const ket = jenisTransaksi === 'PERPANJANG' ? 'Perpanjang' : 'Tebus';
      const jb = jumlahBayar ?? 0;
      if (payment === 'CASH') {
        add(`${ket} ${noFaktur}`, 'MASUK', 'CASH', jb);
      } else if (payment === 'BANK') {
        add(`${ket} ${noFaktur}`, 'MASUK', 'BANK', jb);
      } else { // SPLIT
        if (cash !== 0) add(`${ket} Cash ${noFaktur}`, 'MASUK', 'CASH', cash);
        add(`${ket} Bank ${noFaktur}`, 'MASUK', 'BANK', bank);
      }
      break;
    }

    // ── KURANG: nasabah bayar selisih, kita kembalikan gadai baru
    case 'KURANG': {
      const gb = jumlahGadaiBaru ?? 0;
      const ub = ujrahBerjalan ?? 0;
      const jb = jumlahBayar ?? 0;
      if (payment === 'CASH') {
        add(`Kurang Pinjaman ${noFaktur}`, 'MASUK', 'CASH', jumlahGadai + ub);
        add(`KURANG ${noFaktur}`, 'KELUAR', 'CASH', gb);
      } else if (payment === 'BANK') {
        add(`Kurang Pinjaman ${noFaktur}`, 'MASUK', 'BANK', jb);
        add(`KURANG Modal ${noFaktur}`, 'MASUK', 'CASH', gb);
        add(`KURANG ${noFaktur}`, 'KELUAR', 'CASH', gb);
      } else { // SPLIT
        add(`KURANG ${noFaktur}`, 'KELUAR', 'CASH', gb);
        add(`Kurang Pinjaman Bank ${noFaktur}`, 'MASUK', 'BANK', bank);
        add(`Kurang Pinjaman Cash ${noFaktur}`, 'MASUK', 'CASH', gb + cash);
      }
      break;
    }

    // ── TAMBAH: kasihkan gadai baru ke nasabah, nasabah lunasi gadai lama+ujrah
    case 'TAMBAH': {
      const gb = jumlahGadaiBaru ?? 0;
      const jb = jumlahBayar ?? 0;
      if (payment === 'CASH') {
        add(`TAMBAH ${noFaktur}`, 'KELUAR', 'CASH', gb);
        add(`Tambah Pinjaman ${noFaktur}`, 'MASUK', 'CASH', gb - jb);
      } else if (payment === 'BANK') {
        add(`TAMBAH ${noFaktur}`, 'KELUAR', 'CASH', gb);
        add(`Tambah Pinjaman ${noFaktur}`, 'MASUK', 'CASH', gb - jb);
        add(`TF TAMBAH ${noFaktur}`, 'MASUK', 'CASH', jb);
      } else { // SPLIT
        add(`TAMBAH ${noFaktur}`, 'KELUAR', 'CASH', gb);
        add(`Tambah Pinjaman ${noFaktur}`, 'MASUK', 'CASH', gb - jb);
        if (bank > 0) add(`TF TAMBAH ${noFaktur}`, 'MASUK', 'CASH', bank);
        if (cash > 0) add(`Tambah Cash ${noFaktur}`, 'MASUK', 'CASH', cash);
      }
      break;
    }

    // ── SITA: taksiran sita bisa berbeda dari taksiran awal
    case 'SITA': {
      const nilaiSita = taksiranSita || taksiran || 0;
      add(`Modal Sita ${noFaktur}`, 'MASUK', 'CASH', nilaiSita);
      add(`BARANG SITA ${noFaktur}`, 'KELUAR', 'CASH', nilaiSita);
      break;
    }

    // ── JUAL: jual barang gadai/sita
    case 'JUAL': {
      const pokok = ceil1000((jumlahGadai || 0) + (ujrahBerjalan || 0));
      const jual = taksiranJual || taksiran || 0;
      const jb = jumlahBayar ?? 0;
      if (payment === 'CASH') {
        add(`Jual ${noFaktur}`, 'MASUK', 'CASH', pokok);
        add(`JUAL ${noFaktur}`, 'KELUAR', 'CASH', jual);
      } else if (payment === 'BANK') {
        add(`Jual ${noFaktur}`, 'MASUK', 'CASH', pokok);
        add(`JUAL ${noFaktur}`, 'KELUAR', 'CASH', pokok);
      } else { // SPLIT
        add(`Jual ${noFaktur}`, 'MASUK', 'CASH', jb);
        add(`JUAL ${noFaktur}`, 'KELUAR', 'CASH', jb + cash);
      }
      break;
    }
  }

  // Insert all entries to tb_kas
  for (const e of entries) {
    const { data: kasId } = await db.rpc('get_next_id', { p_tipe: 'KAS', p_outlet_id: outletId });
    await db.from('tb_kas').insert({
      id:         kasId as string,
      tgl:        new Date().toISOString(),
      no_ref:     kasRef,
      keterangan: e.ket,
      tipe:       e.tipe,
      tipe_kas:   e.tipeKas,
      jumlah:     e.jml,
      jenis:      jenisTransaksi,
      sumber:     'AUTO',
      kasir:      user,
      outlet:     outlet,
    });
  }
}
