// ============================================================
// ACEH GADAI SYARIAH - Kas Generator (Server-side helper)
// File: lib/db/kas.ts
//
// Cermin _generateKas() di GAS Code.gs.
// ALUR KAS TIDAK BOLEH DIUBAH — sudah custom sesuai pembukuan.
// Dipanggil dari API routes transaksi (gadai, tebus, sjb, dll).
// ============================================================

import type { SupabaseClient } from '@supabase/supabase-js';

// ─── Types ────────────────────────────────────────────────────
export type TipeTransaksi =
  | 'GADAI' | 'SJB'
  | 'TEBUS' | 'PERPANJANG' | 'BUYBACK'
  | 'TAMBAH' | 'KURANG'
  | 'SITA'   | 'JUAL';

export type PaymentMethod = 'CASH' | 'BANK' | 'SPLIT';

export interface KasParams {
  noFaktur:        string;
  noRef?:          string;        // override noRef (untuk tebus, pakai idTebus)
  jenisTransaksi:  TipeTransaksi;
  payment:         PaymentMethod;
  cash:            number;
  bank:            number;
  jumlahGadai?:    number;
  jumlahGadaiBaru?: number;
  ujrahBerjalan?:  number;
  taksiran?:       number;
  taksiranJual?:   number;
  taksiranSita?:   number;
  jumlahBayar?:    number;
  user:            string;
  outlet:          string;
}

interface KasEntry {
  id:       string;
  tgl:      string;           // ISO timestamp
  no_ref:   string;
  keterangan: string;
  tipe:     'MASUK' | 'KELUAR';
  tipe_kas: 'CASH' | 'BANK';
  jumlah:   number;
  jenis:    string;
  sumber:   'AUTO';
  kasir:    string;
  outlet:   string;
}

// ─── Helper: bulatkan ke atas kelipatan 1.000 ────────────────
function ceil1k(v: number): number {
  const n = Number(v) || 0;
  if (n === 0) return 0;
  return n < 0
    ? -Math.ceil(Math.abs(n) / 1000) * 1000
    :  Math.ceil(n / 1000) * 1000;
}

// ─── Generate kas ID via Supabase RPC ────────────────────────
async function nextKasId(db: SupabaseClient, outletId: number): Promise<string> {
  const { data, error } = await db.rpc('get_next_id', {
    p_tipe:      'KAS',
    p_outlet_id: outletId,
  });
  if (error || !data) throw new Error('Gagal generate ID Kas: ' + (error?.message ?? ''));
  return data as string;
}

// ─── MAIN: Generate & insert kas entries ─────────────────────
// Cermin _generateKas() di GAS — logika switch/case identik.
// Jangan ubah alur kas di sini.
export async function generateKas(
  db:       SupabaseClient,
  outletId: number,
  p:        KasParams
): Promise<void> {
  const {
    noFaktur, noRef: noRefOverride, jenisTransaksi,
    payment, cash = 0, bank = 0,
    jumlahGadai = 0, jumlahGadaiBaru = 0, ujrahBerjalan = 0,
    taksiran = 0, taksiranJual, taksiranSita,
    jumlahBayar = 0, user, outlet,
  } = p;

  const kasRef  = noRefOverride ?? noFaktur;
  const pokok   = ceil1k(jumlahGadai + ujrahBerjalan);
  const now     = new Date().toISOString();
  const entries: Omit<KasEntry, 'id'>[] = [];

  const add = (ket: string, tipe: 'MASUK' | 'KELUAR', tipeKas: 'CASH' | 'BANK', jml: number) => {
    entries.push({
      tgl: now, no_ref: kasRef, keterangan: ket,
      tipe, tipe_kas: tipeKas, jumlah: ceil1k(jml),
      jenis: jenisTransaksi, sumber: 'AUTO', kasir: user, outlet,
    });
  };

  // ── Alur kas per jenis transaksi (IDENTIK dengan GAS) ────────
  switch (jenisTransaksi) {

    case 'GADAI':
      if (payment === 'CASH') {
        add(`Gadai ${noFaktur}`, 'KELUAR', 'CASH', jumlahGadai);
      } else if (payment === 'BANK') {
        add(`Gadai ${noFaktur}`,    'KELUAR', 'CASH', jumlahGadai);
        add(`TF GADAI ${noFaktur}`, 'MASUK',  'CASH', bank);
      } else { // SPLIT
        add(`Gadai ${noFaktur}`,           'KELUAR', 'CASH', Math.abs(cash) + bank);
        if (bank > 0) add(`TF GADAI ${noFaktur}`,     'MASUK', 'CASH', bank);
        if (cash < 0) add(`Kembalian GADAI ${noFaktur}`, 'MASUK', 'CASH', Math.abs(cash));
      }
      break;

    case 'SJB':
      if (payment === 'CASH') {
        add(`SJB ${noFaktur}`, 'KELUAR', 'CASH', jumlahGadai);
      } else if (payment === 'BANK') {
        add(`SJB ${noFaktur}`,    'KELUAR', 'CASH', jumlahGadai);
        add(`TF SJB ${noFaktur}`, 'MASUK',  'CASH', bank);
      } else { // SPLIT
        add(`SJB ${noFaktur}`,           'KELUAR', 'CASH', Math.abs(cash) + bank);
        if (bank > 0) add(`TF SJB ${noFaktur}`,     'MASUK', 'CASH', bank);
        if (cash < 0) add(`Kembalian SJB ${noFaktur}`, 'MASUK', 'CASH', Math.abs(cash));
      }
      break;

    case 'BUYBACK':
    case 'TEBUS':
    case 'PERPANJANG': {
      const ket = jenisTransaksi === 'PERPANJANG' ? 'Perpanjang' : 'Tebus';
      if (payment === 'CASH') {
        add(`${ket} ${noFaktur}`, 'MASUK', 'CASH', jumlahBayar);
      } else if (payment === 'BANK') {
        add(`${ket} ${noFaktur}`, 'MASUK', 'BANK', jumlahBayar);
      } else { // SPLIT
        if (cash !== 0) add(`${ket} Cash ${noFaktur}`, 'MASUK', 'CASH', cash);
        add(`${ket} Bank ${noFaktur}`, 'MASUK', 'BANK', bank);
      }
      break;
    }

    case 'KURANG':
      if (payment === 'CASH') {
        add(`Kurang Pinjaman ${noFaktur}`, 'MASUK',  'CASH', jumlahGadai + ujrahBerjalan);
        add(`KURANG ${noFaktur}`,          'KELUAR', 'CASH', jumlahGadaiBaru);
      } else if (payment === 'BANK') {
        add(`Kurang Pinjaman ${noFaktur}`,       'MASUK',  'BANK', jumlahBayar);
        add(`KURANG Modal ${noFaktur}`,           'MASUK',  'CASH', jumlahGadaiBaru);
        add(`KURANG ${noFaktur}`,                 'KELUAR', 'CASH', jumlahGadaiBaru);
      } else { // SPLIT
        const _gb  = jumlahGadaiBaru;
        const _csh = cash;
        add(`KURANG ${noFaktur}`,                 'KELUAR', 'CASH', _gb);
        add(`Kurang Pinjaman Bank ${noFaktur}`,   'MASUK',  'BANK', bank);
        add(`Kurang Pinjaman Cash ${noFaktur}`,   'MASUK',  'CASH', _gb + _csh);
      }
      break;

    case 'TAMBAH':
      if (payment === 'CASH') {
        add(`TAMBAH ${noFaktur}`,          'KELUAR', 'CASH', jumlahGadaiBaru);
        add(`Tambah Pinjaman ${noFaktur}`, 'MASUK',  'CASH', jumlahGadaiBaru - jumlahBayar);
      } else if (payment === 'BANK') {
        add(`TAMBAH ${noFaktur}`,          'KELUAR', 'CASH', jumlahGadaiBaru);
        add(`Tambah Pinjaman ${noFaktur}`, 'MASUK',  'CASH', jumlahGadaiBaru - jumlahBayar);
        add(`TF TAMBAH ${noFaktur}`,       'MASUK',  'CASH', jumlahBayar);
      } else { // SPLIT
        add(`TAMBAH ${noFaktur}`,          'KELUAR', 'CASH', jumlahGadaiBaru);
        add(`Tambah Pinjaman ${noFaktur}`, 'MASUK',  'CASH', jumlahGadaiBaru - jumlahBayar);
        if (bank > 0) add(`TF TAMBAH ${noFaktur}`,  'MASUK', 'CASH', bank);
        if (cash > 0) add(`Tambah Cash ${noFaktur}`, 'MASUK', 'CASH', cash);
      }
      break;

    case 'SITA': {
      const nilaiSita = taksiranSita ?? taksiran;
      add(`Modal Sita ${noFaktur}`,   'MASUK',  'CASH', nilaiSita);
      add(`BARANG SITA ${noFaktur}`,  'KELUAR', 'CASH', nilaiSita);
      break;
    }

    case 'JUAL': {
      const jual = taksiranJual ?? taksiran;
      if (payment === 'CASH') {
        add(`Jual ${noFaktur}`,  'MASUK',  'CASH', pokok);
        add(`JUAL ${noFaktur}`,  'KELUAR', 'CASH', jual);
      } else if (payment === 'BANK') {
        add(`Jual ${noFaktur}`,  'MASUK',  'CASH', pokok);
        add(`JUAL ${noFaktur}`,  'KELUAR', 'CASH', pokok);
      } else { // SPLIT
        const _jb  = jumlahBayar;
        const _csh = cash;
        add(`Jual ${noFaktur}`,  'MASUK',  'CASH', _jb);
        add(`JUAL ${noFaktur}`,  'KELUAR', 'CASH', _jb + _csh);
      }
      break;
    }
  }

  // ── Insert semua entri ke tb_kas ─────────────────────────────
  if (entries.length === 0) return;

  // Generate ID untuk setiap entri
  const rows = await Promise.all(
    entries.map(async (e) => {
      const id = await nextKasId(db, outletId);
      return { id, ...e };
    })
  );

  const { error } = await db.from('tb_kas').insert(rows);
  if (error) throw new Error('Gagal insert kas: ' + error.message);
}

// ─── Reverse kas entries (untuk batal / edit payment) ────────
// Cermin _reverseKas() di GAS.
export async function reverseKas(
  db:      SupabaseClient,
  outletId: number,
  noRef:   string,
  jenis:   string,
  user:    string,
  outlet:  string
): Promise<number> {
  // Ambil semua entri kas dengan noRef + jenis yang belum di-reverse
  const { data: rows, error } = await db
    .from('tb_kas')
    .select('*')
    .eq('no_ref', noRef.trim().toUpperCase())
    .ilike('jenis', jenis)
    .neq('sumber', 'BATAL');

  if (error || !rows || rows.length === 0) return 0;

  const now = new Date().toISOString();
  const reversals: KasEntry[] = [];

  for (const r of rows) {
    const jml = Number(r.jumlah) || 0;
    if (jml === 0) continue;

    const id = await nextKasId(db, outletId);
    reversals.push({
      id,
      tgl:        now,
      no_ref:     String(r.no_ref ?? ''),
      keterangan: 'BATAL ' + String(r.keterangan ?? ''),
      tipe:       r.tipe === 'MASUK' ? 'KELUAR' : 'MASUK',
      tipe_kas:   r.tipe_kas ?? 'CASH',
      jumlah:     jml,
      jenis:      String(r.jenis ?? ''),
      sumber:     'AUTO',
      kasir:      user,
      outlet:     outlet,
    });
  }

  if (reversals.length === 0) return 0;

  // Insert reversal entries
  const { error: insErr } = await db.from('tb_kas').insert(reversals);
  if (insErr) throw new Error('Gagal insert reversal kas: ' + insErr.message);

  // Tandai entri asli sebagai BATAL
  const ids = rows.map((r) => r.id);
  await db.from('tb_kas').update({ sumber: 'BATAL' }).in('id', ids);

  return reversals.length;
}
