-- ============================================================
-- Migration 014: WhatsApp Automation Infrastructure
-- File: supabase/migrations/014_whatsapp_automation.sql
-- Tanggal: 2026-05-14
--
-- Tujuan: Infrastructure untuk auto-notif WhatsApp (Phase 2 plan).
-- ADDITIVE ONLY: tidak menghapus atau ganti kolom existing.
-- TIDAK mengganggu alur kas, transaksi, atau fungsi lain.
--
-- Tabel baru:
--   tb_wa_config     — config provider (Wablas) per outlet
--   tb_wa_template   — template message editable
--   tb_wa_outgoing   — log setiap WA yang dikirim
--   tb_wa_incoming   — log balasan dari konsumen
--
-- Kolom baru di tabel existing:
--   tb_gadai.reminder_state, reminder_next_at, opt_out_wa
--   tb_sjb.reminder_state, reminder_next_at, opt_out_wa
-- (semua dengan default value, tidak break record existing)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 1. tb_wa_config
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tb_wa_config (
  id              SERIAL PRIMARY KEY,
  outlet_id       INTEGER NOT NULL REFERENCES public.outlets(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL DEFAULT 'WABLAS',   -- 'WABLAS' | 'FONNTE' | 'WHACENTER'
  api_key         TEXT NOT NULL,                     -- token API provider
  api_secret      TEXT,                              -- some providers need this
  api_base_url    TEXT,                              -- override default URL kalau provider beda region
  nomor_pengirim  TEXT NOT NULL,                     -- WA sender number (628xx...)
  nomor_backup    TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  status          TEXT NOT NULL DEFAULT 'ACTIVE',    -- 'ACTIVE' | 'BANNED' | 'PAUSED'
  daily_quota     INTEGER NOT NULL DEFAULT 1000,     -- safety cap per hari, anti-spam loop bug
  last_test_at    TIMESTAMPTZ,
  last_test_ok    BOOLEAN,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Max 1 config ACTIVE per outlet — gunakan partial unique index
CREATE UNIQUE INDEX IF NOT EXISTS uq_wa_config_active_per_outlet
  ON public.tb_wa_config (outlet_id)
  WHERE status = 'ACTIVE' AND enabled = TRUE;

COMMENT ON TABLE public.tb_wa_config IS
  'Config WhatsApp 3rd-party provider per outlet. Adapter pattern: provider kolom menentukan adapter mana yg dipakai di lib/wa/sender.ts';


-- ─────────────────────────────────────────────────────────────
-- 2. tb_wa_template
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tb_wa_template (
  code         TEXT PRIMARY KEY,        -- 'GADAI_NEW' | 'TEBUS_OK' | 'JT_H_MIN_1' | dst
  category     TEXT NOT NULL,           -- 'TRANSAKSI' | 'REMINDER' | 'COMPLIANCE'
  description  TEXT,
  body         TEXT NOT NULL,           -- body dengan {{placeholder}}
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tb_wa_template IS
  'Template message WA. Editable owner via dashboard tanpa perlu deploy ulang.';


-- ─────────────────────────────────────────────────────────────
-- 3. tb_wa_outgoing
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tb_wa_outgoing (
  id              BIGSERIAL PRIMARY KEY,
  outlet_id       INTEGER NOT NULL REFERENCES public.outlets(id),
  ref_table       TEXT,                    -- 'tb_gadai' | 'tb_sjb' | 'tb_tebus' | 'tb_buyback' | 'tb_transfer_request'
  ref_id          TEXT,                    -- id atau no_faktur — flexibility
  no_faktur       TEXT,                    -- denormalize untuk query cepat
  nama_nasabah    TEXT,
  nomor_tujuan    TEXT NOT NULL,           -- 628xx...
  template_code   TEXT NOT NULL,           -- FK soft ke tb_wa_template.code
  message_body    TEXT NOT NULL,           -- final body setelah render placeholder
  status          TEXT NOT NULL DEFAULT 'PENDING',  -- 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED' | 'SKIPPED'
  provider        TEXT,                    -- 'WABLAS' | dst (denormalize)
  provider_msg_id TEXT,                    -- ID dari Wablas/Fonnte
  error_msg       TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_outgoing_outlet_date
  ON public.tb_wa_outgoing (outlet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_outgoing_ref
  ON public.tb_wa_outgoing (ref_table, ref_id);
CREATE INDEX IF NOT EXISTS idx_wa_outgoing_status_pending
  ON public.tb_wa_outgoing (status)
  WHERE status IN ('PENDING','FAILED');
CREATE INDEX IF NOT EXISTS idx_wa_outgoing_dedupe
  ON public.tb_wa_outgoing (template_code, ref_id, created_at);

COMMENT ON TABLE public.tb_wa_outgoing IS
  'Log setiap WA yang dikirim sistem. Dipakai untuk: dashboard inbox, audit trail anti-fraud, dedupe cron reminder.';


-- ─────────────────────────────────────────────────────────────
-- 4. tb_wa_incoming
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tb_wa_incoming (
  id                  BIGSERIAL PRIMARY KEY,
  outlet_id           INTEGER REFERENCES public.outlets(id),
  nomor_pengirim      TEXT NOT NULL,           -- nomor konsumen (628xx...)
  nama_nasabah        TEXT,                    -- resolve dari tb_gadai/tb_sjb berdasarkan nomor
  ref_table           TEXT,                    -- 'tb_gadai' | 'tb_sjb'
  ref_id              TEXT,
  no_faktur           TEXT,
  message_body        TEXT NOT NULL,
  provider_msg_id     TEXT,
  state               TEXT NOT NULL DEFAULT 'NEW',  -- 'NEW' | 'IN_PROGRESS' | 'HANDLED' | 'STALE'
  handled_by          TEXT,                    -- nama kasir
  handled_at          TIMESTAMPTZ,
  reschedule_to       TIMESTAMPTZ,             -- kalau di-reschedule, kapan reminder baru
  reschedule_reason   TEXT,
  alerted_telegram    BOOLEAN NOT NULL DEFAULT FALSE,   -- supaya stale alert tidak double
  received_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_incoming_state_open
  ON public.tb_wa_incoming (state, received_at)
  WHERE state IN ('NEW','IN_PROGRESS');
CREATE INDEX IF NOT EXISTS idx_wa_incoming_outlet
  ON public.tb_wa_incoming (outlet_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_incoming_ref
  ON public.tb_wa_incoming (ref_table, ref_id);

COMMENT ON TABLE public.tb_wa_incoming IS
  'Balasan dari konsumen via WhatsApp. State machine: NEW -> IN_PROGRESS (kasir buka) -> HANDLED (selesai). STALE = stuck > 4 jam.';


-- ─────────────────────────────────────────────────────────────
-- 5. ALTER tb_gadai & tb_sjb — tambah kolom reminder state
-- ─────────────────────────────────────────────────────────────
-- Default 'AUTO' supaya kontrak existing & baru otomatis ikut reminder.
-- Kolom additive, tidak break query existing.

ALTER TABLE public.tb_gadai
  ADD COLUMN IF NOT EXISTS reminder_state TEXT NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS reminder_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_out_wa BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.tb_sjb
  ADD COLUMN IF NOT EXISTS reminder_state TEXT NOT NULL DEFAULT 'AUTO',
  ADD COLUMN IF NOT EXISTS reminder_next_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opt_out_wa BOOLEAN NOT NULL DEFAULT FALSE;

-- Index untuk cron scan (jatuh tempo + sita per hari)
-- WHERE clause harus IMMUTABLE untuk index expression — pakai date kolom langsung
CREATE INDEX IF NOT EXISTS idx_gadai_reminder_aktif
  ON public.tb_gadai (tgl_jt, tgl_sita)
  WHERE status = 'AKTIF' AND reminder_state IN ('AUTO','RESCHEDULED');

CREATE INDEX IF NOT EXISTS idx_sjb_reminder_aktif
  ON public.tb_sjb (tgl_jt, tgl_sita)
  WHERE status = 'AKTIF' AND reminder_state IN ('AUTO','RESCHEDULED');


-- ─────────────────────────────────────────────────────────────
-- 6. Seed template (draft awal — Pak Fendy iterasi wording nanti)
-- ─────────────────────────────────────────────────────────────
-- Placeholder convention: {{nama}}, {{no_faktur}}, {{barang}}, dst.
-- Diisi di lib/wa/sender.ts saat render template.

INSERT INTO public.tb_wa_template (code, category, description, body) VALUES
-- Group A: konfirmasi transaksi (anti-fraud)
('GADAI_NEW', 'TRANSAKSI', 'Konfirmasi akad gadai baru',
$$Selamat datang di ACEH GADAI SYARIAH {{outlet}}.

Akad gadai Anda telah aktif:
• No Faktur: {{no_faktur}}
• Barang: {{barang}}
• Pinjaman: Rp {{jumlah_gadai}}
• Jatuh tempo: {{tgl_jt}}
• Tgl jual (jika tidak ditebus): {{tgl_sita}}

Reminder otomatis akan dikirim H-1 menjelang jatuh tempo. Simpan pesan ini sebagai bukti.

Outlet: {{outlet}}
WA: {{wa_outlet}}$$),

('SJB_NEW', 'TRANSAKSI', 'Konfirmasi akad SJB baru',
$$Akad Jual Beli Kembali (SJB) Anda telah aktif:
• No SJB: {{no_faktur}}
• Barang: {{barang}}
• Harga Jual: Rp {{harga_jual}}
• Harga Buyback: Rp {{harga_buyback}}
• Jatuh tempo: {{tgl_jt}}

Reminder otomatis akan dikirim H-1 menjelang jatuh tempo.

Outlet: ACEH GADAI SYARIAH {{outlet}}
WA: {{wa_outlet}}$$),

('TAMBAH_OK', 'TRANSAKSI', 'Konfirmasi tambah pinjaman',
$$Konfirmasi penambahan pinjaman:
• No Faktur: {{no_faktur}}
• Pinjaman sebelumnya: Rp {{jumlah_lama}}
• Pinjaman baru: Rp {{jumlah_baru}}
• Tambahan diterima: Rp {{selisih}}
• Jatuh tempo baru: {{tgl_jt}}

Outlet: {{outlet}}$$),

('KURANG_OK', 'TRANSAKSI', 'Konfirmasi kurang pinjaman',
$$Konfirmasi pengurangan pinjaman:
• No Faktur: {{no_faktur}}
• Pinjaman sebelumnya: Rp {{jumlah_lama}}
• Pinjaman baru: Rp {{jumlah_baru}}
• Pembayaran: Rp {{selisih}}
• Jatuh tempo baru: {{tgl_jt}}

Outlet: {{outlet}}$$),

('PERPANJANG_OK', 'TRANSAKSI', 'Konfirmasi perpanjang gadai',
$$Konfirmasi perpanjangan kontrak:
• No Faktur: {{no_faktur}}
• Barang: {{barang}}
• Ujrah dibayar: Rp {{jumlah_bayar}}
• Jatuh tempo baru: {{tgl_jt_baru}}

Outlet: {{outlet}}$$),

('TEBUS_OK', 'TRANSAKSI', 'Konfirmasi penebusan gadai',
$$Konfirmasi penebusan:
• No Faktur: {{no_faktur}}
• Barang: {{barang}}
• Total bayar: Rp {{jumlah_bayar}}
• Tgl tebus: {{tgl_tebus}}

Terima kasih telah mempercayakan kami.
ACEH GADAI SYARIAH {{outlet}}$$),

('DISKON_CONFIRM', 'COMPLIANCE', 'Konfirmasi diskon (ANTI-FRAUD)',
$$PENTING — Bpk/Ibu {{nama}},

Anda telah mendapat KERINGANAN UJRAH pada transaksi {{no_faktur}}:
• Ujrah seharusnya: Rp {{ujrah_seharusnya}}
• Diskon yang diberikan: Rp {{selisih}}
• Total yang Anda bayar: Rp {{jumlah_bayar}}
• Alasan: {{alasan}}

Simpan pesan ini sebagai bukti.
Jika ada selisih dengan yang dibayarkan secara fisik, mohon hubungi kantor pusat di {{wa_owner}}.

ACEH GADAI SYARIAH$$),

('BUYBACK_OK', 'TRANSAKSI', 'Konfirmasi buyback SJB',
$$Konfirmasi pembelian kembali (Buyback):
• No SJB: {{no_faktur}}
• Barang: {{barang}}
• Total bayar: Rp {{jumlah_bayar}}
• Tgl buyback: {{tgl_tebus}}

Terima kasih.
ACEH GADAI SYARIAH {{outlet}}$$),

('PERPANJANG_SJB_OK', 'TRANSAKSI', 'Konfirmasi perpanjang SJB',
$$Konfirmasi perpanjangan akad SJB:
• No SJB: {{no_faktur}}
• Ujrah dibayar: Rp {{jumlah_bayar}}
• Jatuh tempo baru: {{tgl_jt_baru}}

Outlet: {{outlet}}$$),

('SITA_GADAI_OK', 'COMPLIANCE', 'Konfirmasi sita gadai (saat barang masuk gudang sita)',
$$Pemberitahuan: Kontrak gadai Anda {{no_faktur}} telah masuk masa sita per {{tgl_sita}}.

Barang akan diproses untuk penjualan. Jika hasil penjualan lebih besar dari pinjaman + ujrah, selisihnya menjadi hak Anda dan akan kami informasikan.

ACEH GADAI SYARIAH {{outlet}}$$),

('SITA_SJB_OK', 'COMPLIANCE', 'Konfirmasi sita SJB',
$$Pemberitahuan: Akad SJB Anda {{no_faktur}} telah masuk masa sita per {{tgl_sita}}.

Barang menjadi milik perusahaan dan akan diproses penjualan sesuai akad.

ACEH GADAI SYARIAH {{outlet}}$$),

('JUAL_OK', 'COMPLIANCE', 'Konfirmasi barang dijual + selisih kelebihan',
$$Pemberitahuan: Barang dari kontrak {{no_faktur}} telah terjual.

• Harga jual: Rp {{harga_jual}}
• Pinjaman + ujrah: Rp {{total_kewajiban}}
• Selisih lebih (hak Anda): Rp {{selisih_kelebihan}}

Selisih ini dapat diambil di outlet selama 1 tahun sejak tanggal penjualan. Setelah itu menjadi sedekah sesuai akad.

ACEH GADAI SYARIAH {{outlet}}$$),

('KELEBIHAN_READY', 'COMPLIANCE', 'Saldo kelebihan jual sita siap diambil',
$$Bpk/Ibu {{nama}},

Saldo kelebihan dari penjualan kontrak {{no_faktur}} sebesar Rp {{selisih_kelebihan}} siap diambil di outlet kami.

Mohon datang dengan membawa KTP dan surat akad asli. Berlaku sampai {{tgl_kadaluarsa}}.

ACEH GADAI SYARIAH {{outlet}}$$),

('TRANSFER_OK', 'TRANSAKSI', 'Konfirmasi transfer bank ke rekening konsumen sukses',
$$Konfirmasi pencairan via transfer:
• No Faktur: {{no_faktur}}
• Nominal: Rp {{nominal}}
• Bank: {{bank}}
• A/N: {{nama_penerima}}
• No Rek: {{no_rek}}
• Tgl Transfer: {{tgl_transfer}}

Mohon cek mutasi rekening Anda. Jika dalam 1x24 jam belum masuk, hubungi {{wa_outlet}}.

ACEH GADAI SYARIAH {{outlet}}$$),

-- Group B: reminders
('JT_GADAI_H_MIN_1', 'REMINDER', 'Reminder jatuh tempo gadai H-1',
$$Halo Bpk/Ibu {{nama}},

Kontrak gadai Anda {{no_faktur}} ({{barang}}) akan JATUH TEMPO BESOK ({{tgl_jt}}).

Mohon segera dilakukan tebus atau perpanjang.
• Estimasi tebus: Rp {{estimasi_tebus}}
• Estimasi perpanjang (ujrah): Rp {{estimasi_ujrah}}

Balas pesan ini jika butuh penundaan atau bantuan.

Outlet: {{outlet}}
WA: {{wa_outlet}}$$),

('JT_GADAI_H_0', 'REMINDER', 'Reminder jatuh tempo gadai hari-H',
$$Halo Bpk/Ibu {{nama}},

Kontrak gadai Anda {{no_faktur}} ({{barang}}) JATUH TEMPO HARI INI ({{tgl_jt}}).

Mohon segera dilakukan tebus atau perpanjang sebelum outlet tutup.
• Estimasi tebus: Rp {{estimasi_tebus}}
• Estimasi perpanjang (ujrah): Rp {{estimasi_ujrah}}

Outlet: {{outlet}} (10:00 - 22:00)
WA: {{wa_outlet}}$$),

('JT_GADAI_H_PLUS_1', 'REMINDER', 'Reminder jatuh tempo gadai H+1 (lewat)',
$$Halo Bpk/Ibu {{nama}},

Kontrak gadai Anda {{no_faktur}} telah LEWAT JATUH TEMPO 1 hari.

Mohon segera hubungi kami untuk perpanjang atau tebus. Kalau tidak ada tindak lanjut, kontrak akan masuk masa sita pada {{tgl_sita}}.

Outlet: {{outlet}}
WA: {{wa_outlet}}$$),

('SITA_GADAI_H_MIN_1', 'REMINDER', 'Reminder masa sita gadai H-1',
$$⚠️ PERINGATAN TERAKHIR — Bpk/Ibu {{nama}},

Kontrak gadai {{no_faktur}} ({{barang}}) akan MASUK MASA SITA BESOK ({{tgl_sita}}).

Setelah itu barang akan diproses untuk penjualan. Mohon segera datang ke outlet untuk tebus atau perpanjang.

Outlet: {{outlet}}
WA: {{wa_outlet}}$$),

('SITA_GADAI_H_0', 'REMINDER', 'Reminder masa sita gadai hari-H',
$$Bpk/Ibu {{nama}},

Kontrak gadai {{no_faktur}} ({{barang}}) MASUK MASA SITA HARI INI.

Barang akan diproses penjualan. Jika masih ingin negosiasi sebelum dijual, mohon segera hubungi kami.

Outlet: {{outlet}}
WA: {{wa_outlet}}$$),

('SITA_GADAI_H_PLUS_1', 'REMINDER', 'Reminder masa sita gadai H+1',
$$Bpk/Ibu {{nama}},

Kontrak gadai {{no_faktur}} telah masuk sita 1 hari lalu. Barang dalam proses penjualan.

Jika ada selisih lebih dari hasil penjualan, akan kami informasikan untuk diambil di outlet.

ACEH GADAI SYARIAH {{outlet}}$$),

('JT_SJB_H_MIN_1', 'REMINDER', 'Reminder jatuh tempo SJB H-1',
$$Halo Bpk/Ibu {{nama}},

Akad SJB {{no_faktur}} ({{barang}}) akan JATUH TEMPO BESOK ({{tgl_jt}}).

• Harga buyback: Rp {{harga_buyback}}

Mohon segera lakukan buyback atau perpanjang jika ingin barang kembali.

Outlet: {{outlet}}
WA: {{wa_outlet}}$$),

('JT_SJB_H_0', 'REMINDER', 'Reminder jatuh tempo SJB hari-H',
$$Halo Bpk/Ibu {{nama}},

Akad SJB {{no_faktur}} ({{barang}}) JATUH TEMPO HARI INI.

Mohon segera lakukan buyback Rp {{harga_buyback}} atau perpanjang.

Outlet: {{outlet}} (10:00 - 22:00)
WA: {{wa_outlet}}$$),

('JT_SJB_H_PLUS_1', 'REMINDER', 'Reminder jatuh tempo SJB H+1 (lewat)',
$$Halo Bpk/Ibu {{nama}},

Akad SJB {{no_faktur}} telah LEWAT JATUH TEMPO. Setelah masa sita ({{tgl_sita}}), barang sepenuhnya menjadi milik perusahaan sesuai akad jual beli kembali.

Outlet: {{outlet}}
WA: {{wa_outlet}}$$)

ON CONFLICT (code) DO NOTHING;


-- ─────────────────────────────────────────────────────────────
-- 7. Trigger updated_at auto-update untuk tabel baru
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at_wa() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wa_config_updated_at ON public.tb_wa_config;
CREATE TRIGGER trg_wa_config_updated_at
  BEFORE UPDATE ON public.tb_wa_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_wa();

DROP TRIGGER IF EXISTS trg_wa_template_updated_at ON public.tb_wa_template;
CREATE TRIGGER trg_wa_template_updated_at
  BEFORE UPDATE ON public.tb_wa_template
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_wa();


-- ─────────────────────────────────────────────────────────────
-- DONE. Tabel & template siap.
-- Next: build lib/wa/sender.ts (Layer 2)
-- ─────────────────────────────────────────────────────────────
