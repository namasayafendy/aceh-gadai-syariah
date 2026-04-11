// ============================================================
// ACEH GADAI SYARIAH - Complete Database Types
// File: types/auth.ts
// ============================================================

export type UserRole   = 'KASIR' | 'ADMIN' | 'OWNER';
export type UserStatus = 'AKTIF' | 'NONAKTIF';
export type PaymentMethod  = 'CASH' | 'BANK' | 'SPLIT';
export type GadaiStatus    = 'AKTIF' | 'TEBUS' | 'PERPANJANG' | 'TAMBAH' | 'KURANG' | 'SITA' | 'JUAL' | 'BATAL';
export type KasTipe        = 'MASUK' | 'KELUAR';
export type KasTipeKas     = 'CASH' | 'BANK';
export type KasSumber      = 'AUTO' | 'MANUAL' | 'BATAL';

// ── Row types per tabel ───────────────────────────────────────

export interface Profile {
  id: string; nama: string; username: string | null;
  role: UserRole; outlet_id: number; status: UserStatus;
  created_at: string; updated_at: string;
}

export interface Outlet {
  id: number; nama: string; alamat: string | null; kota: string | null;
  telpon: string | null; waktu_operasional: string | null;
  nama_perusahaan: string | null; status_kepala_gudang: string | null;
  biaya_admin: number; web_url: string | null;
  created_at: string; updated_at: string;
}

export interface Karyawan {
  id: string; nama: string; username: string | null; pin: string | null;
  role: UserRole; outlet_id: number; status: UserStatus;
  created_at: string; updated_at: string;
}

export interface TbGadai {
  id: string; no_faktur: string; tgl_gadai: string; tgl_jt: string | null;
  tgl_sita: string | null; tgl_tebus: string | null;
  nama: string; no_ktp: string | null; telp1: string | null; telp2: string | null;
  kategori: string; barang: string; kelengkapan: string | null;
  grade: string | null; imei_sn: string | null;
  taksiran: number; jumlah_gadai: number; biaya_admin: number;
  ujrah_persen: number; ujrah_nominal: number;
  barcode_a: string | null; barcode_b: string | null; rak: string | null;
  status: GadaiStatus; catatan: string | null;
  payment: PaymentMethod; cash: number; bank: number;
  kasir: string | null; outlet: string; outlet_id: number;
  created_at: string; updated_at: string; updated_by: string | null;
  warning: string | null;
}

export interface TbSJB {
  id: string; no_faktur: string; tgl_gadai: string; tgl_jt: string | null;
  tgl_sita: string | null; tgl_tebus: string | null;
  nama: string; no_ktp: string | null; telp1: string | null; telp2: string | null;
  kategori: string; barang: string; kelengkapan: string | null;
  grade: string | null; imei_sn: string | null;
  taksiran: number; harga_jual: number; biaya_admin: number;
  lama_titip: number; harga_buyback: number;
  barcode_a: string | null; barcode_b: string | null; rak: string | null;
  status: string; catatan: string | null;
  payment: PaymentMethod; cash: number; bank: number;
  kasir: string | null; outlet: string; outlet_id: number;
  created_at: string; updated_at: string; updated_by: string | null;
  warning: string | null;
}

export interface TbTebus {
  id: string; tgl: string; id_gadai: string; no_faktur: string;
  nama_nasabah: string | null; kategori: string | null; barang: string | null;
  taksiran: number; jumlah_gadai: number; jumlah_gadai_baru: number;
  hari_aktual: number; ujrah_berjalan: number;
  total_tebus_sistem: number; jumlah_bayar: number; selisih: number;
  id_diskon: string | null; status: string; alasan: string | null;
  payment: PaymentMethod; cash: number; bank: number;
  barcode_a: string | null; kasir: string | null; outlet: string;
  tanpa_surat: string | null;
  created_at: string; updated_at: string; updated_by: string | null;
}

export interface TbBuyback {
  id: string; tgl: string; id_sjb: string; no_faktur: string;
  nama: string | null; kategori: string | null; barang: string | null;
  taksiran: number; harga_jual: number; harga_jual_baru: number;
  hari_aktual: number; ujrah_berjalan: number;
  total_sistem: number; jumlah_bayar: number; selisih: number;
  id_diskon: string | null; status: string; alasan: string | null;
  payment: PaymentMethod; cash: number; bank: number;
  barcode_a: string | null; kasir: string | null; outlet: string;
  tanpa_surat: string | null;
  created_at: string; updated_at: string; updated_by: string | null;
}

export interface TbKas {
  id: string; tgl: string; no_ref: string | null; keterangan: string | null;
  tipe: KasTipe; tipe_kas: KasTipeKas; jumlah: number;
  col_h: string | null; col_i: string | null;
  jenis: string | null; sumber: KasSumber;
  kasir: string | null; outlet: string;
  created_at: string; col_o: string | null; col_p: string | null;
}

export interface TbGudangSita {
  sita_id: string; no_faktur: string; id_gadai: string | null;
  tgl_sita: string; barang: string; kategori: string | null;
  nama_nasabah: string | null; keterangan: string | null;
  taksiran_modal: number; status_gudang: string;
  no_bon_ba: string | null; tgl_serah_terima: string | null;
  outlet: string; created_at: string; updated_at: string;
}

export interface TbSerahTerima {
  id_ba: string; no_ba: string; tgl: string; outlet: string;
  kasir: string | null; jumlah_item: number; status: string;
  updated_at: string; catatan: string | null;
}

export interface TbGudangAset {
  id_aset: string; id_ba: string | null; no_ba: string | null;
  sita_id: string | null; no_faktur: string | null;
  barang: string | null; kategori: string | null; nama_nasabah: string | null;
  keterangan: string | null; taksiran_modal: number; outlet: string;
  tgl_masuk: string; status_aset: string;
  id_bon: string | null; tgl_jual: string | null; harga_jual: number;
  updated_at: string;
}

export interface TbJualBon {
  id_bon: string; no_bon: string; tgl: string; kasir: string | null;
  jumlah_item: number; total_modal: number; total_jual: number; laba: number;
  updated_at: string; catatan: string | null;
}

export interface TbJualBonDetail {
  id: string; id_bon: string; no_bon: string | null;
  id_aset: string | null; sita_id: string | null; no_faktur: string | null;
  barang: string | null; kategori: string | null;
  modal: number; harga_jual: number; laba: number;
}

export interface TbDiskon {
  id_diskon: string; tgl: string; no_faktur: string; id_tebus: string | null;
  nama_nasabah: string | null; jumlah_pinjaman: number;
  ujrah_berjalan: number; lama_titip: number;
  total_seharusnya: number; besaran_potongan: number;
  total_setelah_diskon: number; alasan: string | null;
  status_tebus: string | null; kasir: string | null; outlet: string;
  created_at: string; approved: string | null;
}

export interface AuditLog {
  id: number; tgl: string; user_nama: string | null;
  tabel: string | null; record_id: string | null;
  aksi: string | null; field: string | null;
  nilai_lama: string | null; nilai_baru: string | null;
  outlet: string | null; catatan: string | null;
}

export interface Counter {
  id: number; label: string; prefix: string;
  last_val: number; outlet_id: number;
}

export interface TbRak {
  id: string; kode: string; nama: string;
  kategori: string | null; keterangan: string | null;
  outlet: string; outlet_id: number;
  created_at: string; updated_at: string;
}

// ── Session / Auth helpers ────────────────────────────────────

export interface SessionUser {
  id: string; email: string; nama: string; role: UserRole;
  outlet_id: number; outlet_name: string; show_branch_selector: boolean;
}

export interface PinValidationResult {
  ok: boolean; msg?: string; nama?: string;
  role?: UserRole; outlet_id?: number;
}

export interface LoginFormState {
  error?: string; success?: boolean;
}

// ── Supabase Database type (dipakai oleh createClient) ───────

export interface Database {
  public: {
    Tables: {
      profiles:          { Row: Profile;       Insert: Omit<Profile,'created_at'|'updated_at'>;       Update: Partial<Profile>; };
      outlets:           { Row: Outlet;        Insert: Omit<Outlet,'created_at'|'updated_at'>;         Update: Partial<Outlet>; };
      karyawan:          { Row: Karyawan;      Insert: Omit<Karyawan,'created_at'|'updated_at'>;       Update: Partial<Karyawan>; };
      tb_gadai:          { Row: TbGadai;       Insert: Omit<TbGadai,'created_at'|'updated_at'>;        Update: Partial<TbGadai>; };
      tb_sjb:            { Row: TbSJB;         Insert: Omit<TbSJB,'created_at'|'updated_at'>;          Update: Partial<TbSJB>; };
      tb_tebus:          { Row: TbTebus;       Insert: Omit<TbTebus,'created_at'|'updated_at'>;        Update: Partial<TbTebus>; };
      tb_buyback:        { Row: TbBuyback;     Insert: Omit<TbBuyback,'created_at'|'updated_at'>;      Update: Partial<TbBuyback>; };
      tb_kas:            { Row: TbKas;         Insert: Omit<TbKas,'created_at'>;                       Update: Partial<TbKas>; };
      tb_gudang_sita:    { Row: TbGudangSita;  Insert: Omit<TbGudangSita,'created_at'|'updated_at'>;   Update: Partial<TbGudangSita>; };
      tb_serah_terima:   { Row: TbSerahTerima; Insert: Omit<TbSerahTerima,'updated_at'>;               Update: Partial<TbSerahTerima>; };
      tb_gudang_aset:    { Row: TbGudangAset;  Insert: Omit<TbGudangAset,'updated_at'>;                Update: Partial<TbGudangAset>; };
      tb_jual_bon:       { Row: TbJualBon;     Insert: Omit<TbJualBon,'updated_at'>;                   Update: Partial<TbJualBon>; };
      tb_jual_bon_detail:{ Row: TbJualBonDetail; Insert: TbJualBonDetail;                              Update: Partial<TbJualBonDetail>; };
      tb_diskon:         { Row: TbDiskon;      Insert: Omit<TbDiskon,'created_at'>;                    Update: Partial<TbDiskon>; };
      audit_log:         { Row: AuditLog;      Insert: Omit<AuditLog,'id'|'tgl'>;                      Update: Partial<AuditLog>; };
      counter:           { Row: Counter;       Insert: Omit<Counter,'id'>;                             Update: Partial<Counter>; };
      tb_rak:            { Row: TbRak;         Insert: Omit<TbRak,'created_at'|'updated_at'>;          Update: Partial<TbRak>; };
    };
    Functions: {
      validate_pin:       { Args: { p_pin: string; p_outlet_id: number };              Returns: PinValidationResult; };
      get_user_profile:   { Args: { user_id: string };                                 Returns: SessionUser; };
      get_next_id:        { Args: { p_tipe: string; p_outlet_id: number };             Returns: string; };
      get_next_barcode_a: { Args: { p_outlet_id: number };                             Returns: string; };
      hitung_ujrah:       { Args: { p_taksiran: number; p_jumlah_gadai: number; p_kategori: string; p_tgl_gadai: string; p_tgl_tebus: string }; Returns: Record<string, unknown>; };
      hitung_total_tebus: { Args: { p_jumlah_gadai: number; p_ujrah_berjalan: number; p_status: string; p_jumlah_gadai_baru: number }; Returns: number; };
      get_saldo_kas:      { Args: { p_outlet: string; p_tipe_kas: string | null; p_sampai: string | null }; Returns: number; };
      get_assigned_rak:   { Args: { p_kategori: string; p_outlet_id: number };         Returns: string; };
    };
  };
}
