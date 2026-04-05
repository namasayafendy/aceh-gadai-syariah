// ============================================================
// ACEH GADAI SYARIAH - Auth Types
// File: types/auth.ts
// ============================================================

export type UserRole = 'KASIR' | 'ADMIN' | 'OWNER';
export type UserStatus = 'AKTIF' | 'NONAKTIF';

// ── Profile dari tabel profiles (Supabase Auth users) ────────
export interface Profile {
  id: string;          // UUID dari auth.users
  nama: string;
  username: string | null;
  role: UserRole;
  outlet_id: number;   // 0 = semua outlet, 1/2/dst = outlet spesifik
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

// ── Outlet dari tabel outlets ─────────────────────────────────
export interface Outlet {
  id: number;
  name: string;
  alamat: string | null;
  kota: string | null;
  telpon: string | null;
  waktu_operasional: string | null;
  nama_perusahaan: string | null;
  status_kepala_gudang: string | null;
  biaya_admin: number;
  web_url: string | null;
}

// ── Session User — disimpan di context/cookie ─────────────────
// Mirip SESSION_USER di GAS Index.html
export interface SessionUser {
  id: string;
  email: string;
  nama: string;
  role: UserRole;
  outlet_id: number;
  outlet_name: string;          // "LHOKSEUMAWE", "LANGSA", atau "ALL"
  show_branch_selector: boolean; // true jika outlet_id === 0 (Owner/Admin)
}

// ── Return type dari validate_pin API ────────────────────────
export interface PinValidationResult {
  ok: boolean;
  msg?: string;
  nama?: string;
  role?: UserRole;
  outlet_id?: number;
}

// ── Karyawan (untuk dropdown kasir di transaksi) ─────────────
export interface Karyawan {
  id: string;
  nama: string;
  username: string | null;
  role: UserRole;
  outlet_id: number;
  status: UserStatus;
}

// ── Auth form state ───────────────────────────────────────────
export interface LoginFormState {
  error?: string;
  success?: boolean;
}

// ── Supabase Database types (generated pattern) ───────────────
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Profile, 'id' | 'created_at'>>;
      };
      outlets: {
        Row: Outlet;
        Insert: Omit<Outlet, 'created_at' | 'updated_at'>;
        Update: Partial<Omit<Outlet, 'id' | 'created_at'>>;
      };
      karyawan: {
        Row: Karyawan & { pin: string | null; created_at: string; updated_at: string };
        Insert: Omit<Karyawan, 'created_at' | 'updated_at'> & { pin?: string };
        Update: Partial<Karyawan> & { pin?: string };
      };
    };
    Functions: {
      validate_pin: {
        Args: { p_pin: string; p_outlet_id: number };
        Returns: PinValidationResult;
      };
      get_user_profile: {
        Args: { user_id: string };
        Returns: SessionUser;
      };
    };
  };
}
