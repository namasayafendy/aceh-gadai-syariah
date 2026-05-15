# PROJECT PLAN — ACEH GADAI SYARIAH

> Dokumen ini adalah master plan untuk pengembangan aplikasi setelah versi go-live.
> Setiap perubahan besar di-tambah/update di sini supaya Claude (sesi-sesi mendatang) & Pak Fendy punya referensi konsisten.

---

## STATUS APLIKASI SAAT INI (per 2026-05-14)

- ✅ Versi 1.0 sudah di-deploy production ke `app.acehgadaisyariah.com`
- ✅ Fitur inti: Gadai, SJB, Tebus, Tambah, Kurang, Perpanjang, Sita, Jual, Buyback
- ✅ Modul pendukung: Buku Kas, Dashboard, Laporan Harian/Malam, Jatuh Tempo, Cek Stok, Riwayat Diskon, Transfer Antar Outlet, Backup Nightly
- ✅ Infrastruktur: Multi-outlet RLS, OTP login, Diskon Approval via Telegram, Backup ke Supabase Storage
- ✅ 13 migration files terapply ke Supabase production (`ochatvnuakloxubvdpku`)
- ⚠️ Production Supabase: `ochatvnuakloxubvdpku` (aceh-gadai-syariah)
- ⚠️ Training Supabase (untuk dev nanti): `ovgezhgesctgizrswncd` (ags-training) — belum di-clone schema
- ⚠️ Vercel Production Branch: `master`, **manual promote** (Pak Fendy klik Promote di Vercel dashboard setelah preview ready)

---

## ROADMAP DEVELOPMENT

### 🚧 Phase 2 (NEXT — bangun sebelum/segera setelah go-live mass)
**Tema: WhatsApp Automation + Anti-Fraud**

- 📲 Integrasi 3rd party WhatsApp API (Fonnte/Wablas) — 1 nomor per outlet
- 🛡️ Notifikasi auto-confirm setiap transaksi keuangan ke konsumen (anti-fraud)
- ⏰ Auto-reminder jatuh tempo & sita
- 📊 Dashboard WhatsApp Inbox (review + interact)
- 🔁 Reschedule mechanism (kasir bisa set reminder ulang setelah nego)
- 🚨 Alert ke admin pusat (Telegram) kalau ada balasan konsumen yang tidak ditindaklanjuti kasir

### 🏗️ Phase 3 (Setelah Phase 2 stabil)
**Tema: Development Environment Setup**

- 🧪 Clone schema production → Supabase training (`ags-training`)
- 🌐 Setup Vercel env vars per environment (Production vs Preview)
- 💻 `.env.local` di laptop Pak Fendy pakai training credentials
- 🌳 Branch-based workflow (feature branch → preview URL → merge ke master)
- 🏷️ Convention: tag versi stabil setelah promote production

### 🎯 Phase 4 (Setelah Phase 3 stabil)
**Tema: Customer App + Expanded WhatsApp Features**

- 📱 Customer App (PWA) — login by nomor HP, lihat kontrak, history, voucher, kalkulator, booking tebus/perpanjang
- ⭐ Survey kepuasan + voucher reward (free admin Rp 10rb)
- 🎯 Cross-sell win-back untuk nasabah lama (>3 bulan tidak transaksi)
- 🤝 Referral program (kode-based dulu, lalu app-based dengan share link)
- 🔔 Push notification dari customer app (gratis, kurangi dependensi WA berbayar)

### 🚀 Phase 5 (Long-term, 1+ tahun)
**Tema: Scale + Intelligence**

- 🤖 AI chatbot untuk FAQ standar di WhatsApp
- 📈 Predictive analytics: model ML untuk default rate, optimal harga jual sita
- 🌐 Migrasi ke Official WhatsApp Business API (BSP resmi: Wati/Qiscus/Twilio)
- 🌍 Web app untuk owner mobile-friendly (real-time monitor semua outlet)

---

## PHASE 2 DETAIL — WhatsApp Automation

### FINAL DECISIONS (per 2026-05-14 setelah konfirmasi Pak Fendy)

| Decision | Pilihan |
|----------|---------|
| Provider | **Wablas** (lebih stabil anti-ban). Code adapter-pattern jadi bisa switch ke Fonnte/Whacenter tanpa rewrite |
| Nomor strategy | 1 nomor per outlet, pakai nomor BARU (bukan nomor utama outlet). Backup nomor disiapkan |
| Stale threshold (kasir tidak respond) | **4 jam** dalam jam kerja (10:00-21:00 WIB). Di luar jam kerja, timer freeze, mulai lagi jam 10:00 besok |
| Alert recipient | **Telegram grup admin** saja (admin + Pak Fendy) |
| Diskon confirmasi level | **Opsi B**: tampilkan ujrah seharusnya + diskon + total bayar. TANPA nama kasir |
| Opt-out konsumen | **SKIP dulu**. Lihat reaksi lapangan dulu, baru implementasi di phase berikutnya |
| C1 Transfer sukses | ✅ INCLUDE |
| C2 Kelebihan jual sita | ✅ INCLUDE |
| C3 Reminder ambil barang setelah tebus | ❌ SKIP |
| C4 Welcome message pertama transaksi | ❌ SKIP (defer ke phase customer app) |
| C5 Ulang tahun | ❌ SKIP (defer ke phase customer app) |
| C6 SITA SJB | ✅ INCLUDE |
| Build approach | **Opsi A — bertahap layer per layer**, setiap layer di-back-test sebelum lanjut |
| Data saat build | **Semua data dummy sekarang di-baked** — fitur langsung jalan untuk semua outlet existing & outlet baru |
| Live cutover | Pak Fendy buat outlet baru sendiri saat siap go-live, lalu delete outlet dummy |
| Template message | Disimpan di tabel `tb_wa_template` (editable live dari dashboard). Wording iterasi sambil pakai |

### Estimasi biaya

5-10 outlet × Rp 200rb/bulan (Wablas paket basic) = Rp 1jt - Rp 2jt/bulan flat unlimited.

### Daftar Notifikasi yang Akan Dibangun

#### Group A: Konfirmasi Transaksi Keuangan (TRIGGER: setelah submit di sistem)

Tujuan utama: anti-fraud + audit trail digital + customer experience.

| # | Trigger | Template Inti | Anti-fraud value |
|---|---------|---------------|------------------|
| 1 | Gadai Baru | "Selamat datang Pak X. Kontrak SBR-X-XXXX aktif. Pinjaman Rp X. JT: tgl Y. Jual: tgl Z." | Kasir tidak bisa buat kontrak fiktif pakai data nasabah real |
| 2 | SJB Baru (Akad Jual Beli) | "Akad jual beli kembali. No SJB-X-XXXX. Harga jual Rp X. Buyback Rp Y. JT: tgl Z." | Sama dengan #1 |
| 3 | Tambah Pinjaman | "Pinjaman SBR-X-XXXX ditambah Rp X. Pinjaman baru: Rp Y. JT diperpanjang ke tgl Z." | Kasir tidak bisa "tambah" tanpa sepengetahuan nasabah |
| 4 | Kurang Pinjaman | "Pinjaman SBR-X-XXXX dikurangi Rp X (Anda bayar). Pinjaman sekarang: Rp Y. JT: tgl Z." | Sama |
| 5 | Perpanjang Gadai | "Kontrak SBR-X-XXXX diperpanjang. Bayar ujrah Rp X. JT baru: tgl Y." | Konsumen tahu nominal yang dibayarkan |
| 6 | Tebus Gadai | "Konfirmasi tebus. SBR-X-XXXX, barang B. Total bayar Rp X. Selisih: Rp Y." | Konsumen tahu total real yang dibayarkan |
| 7 | **Diskon (Tebus/Perpanjang/Tambah/Kurang)** ⭐ | "Konfirmasi: tebus dengan diskon Rp X (dari ujrah Rp Y). Total dibayar Rp Z." | **CRITICAL**: kasir tidak bisa main-main dengan nominal diskon — selisih langsung ketahuan konsumen |
| 8 | Buyback SJB (BUYBACK) | "Konfirmasi beli kembali SJB-X-XXXX. Total bayar Rp X." | Sama dengan #6 |
| 9 | Perpanjang SJB | "Akad SJB-X-XXXX diperpanjang. Bayar ujrah Rp X. JT baru: tgl Y." | Sama dengan #5 |
| 10 | SITA (saat barang akhirnya disita) | "Kontrak SBR-X-XXXX telah masuk masa sita per tgl X. Jika ada kelebihan dari penjualan akan kami informasikan." | Compliance + opt untuk negosiasi |
| 11 | JUAL (saat barang dijual) | "Barang dari SBR-X-XXXX telah terjual seharga Rp X. Selisih lebih Rp Y dapat diambil di outlet selama 1 tahun." | Compliance — wajib informasi selisih |

#### Group B: Reminder Otomatis (TRIGGER: cron harian)

| # | Trigger | Schedule | Template Inti |
|---|---------|----------|---------------|
| 12 | Jatuh Tempo Gadai H-1 | Cron 09:00 WIB tiap hari | "Kontrak SBR-X-XXXX akan jatuh tempo BESOK (tgl Y). Mohon perhatian." |
| 13 | Jatuh Tempo Gadai H-0 | Cron 09:00 | "Kontrak SBR-X-XXXX jatuh tempo HARI INI. Silakan tebus/perpanjang." |
| 14 | Jatuh Tempo Gadai H+1 | Cron 09:00 | "Kontrak SBR-X-XXXX telah lewat jatuh tempo 1 hari. Mohon segera dihubungi." |
| 15 | Sita Gadai H-1 (60 hari dari akad) | Cron 09:00 | "Kontrak SBR-X-XXXX akan masuk masa sita BESOK. Ini reminder TERAKHIR. Segera tebus/perpanjang." |
| 16 | Sita Gadai H-0 | Cron 09:00 | "Kontrak SBR-X-XXXX masuk masa sita HARI INI. Barang akan kami proses penjualan." |
| 17 | Sita Gadai H+1 | Cron 09:00 | "Kontrak SBR-X-XXXX telah masuk sita. Kalau ada penjualan, selisih akan diinformasikan." |
| 18 | SJB Jatuh Tempo H-1 / H-0 / H+1 | Cron 09:00 | Same pattern dengan #12-14 tapi untuk SJB |

#### Group C: Saran Tambahan dari Saya (NEED PAK FENDY KONFIRMASI)

Saran tambahan yang saya rasa **urgent untuk dibangun bersamaan**:

| # | Trigger | Alasan | Priority |
|---|---------|--------|----------|
| C1 | Transfer ke rekening konsumen sukses (saat gadai/SJB dibayar via bank) | Konsumen butuh konfirmasi transfer masuk; anti-dispute "transfer belum masuk" | HIGH |
| C2 | Saldo kelebihan dari jual sita siap diambil | Compliance regulasi gadai syariah + good will + reduce uang menggantung di outlet | HIGH |
| C3 | Reminder ambil barang setelah tebus (kalau >3 hari belum diambil) | Operational — barang nyangkut di outlet bikin space penuh | MEDIUM |
| C4 | Welcome message saat nasabah pertama kali transaksi | Branding + onboarding | LOW |
| C5 | Ulang tahun nasabah (kalau ada di profile) | Customer relationship + cross-sell opportunity | LOW |
| C6 | Notif untuk SJB SITA (paralel #10 tapi untuk SJB) | Konsistensi dengan gadai | HIGH |

**Pertanyaan untuk Pak Fendy:** mana dari C1-C6 yang mau di-include di Phase 2 ini?

### Mekanisme Reschedule

**Konteks:** kalau konsumen balas WA dan minta nego (mis. "tunda 7 hari, gajian dulu"), kasir handle manual di WhatsApp. Setelah deal, kasir set reminder ulang di dashboard.

**Flow:**
1. Konsumen balas WA reminder → webhook hit `/api/wa/webhook` → state kontrak: `HUMAN_HANDLING` → semua auto-reminder pause untuk kontrak ini
2. Notif Telegram ke grup outlet: "🔔 Nasabah X (SBR-Y-ZZZZ) balas WA: 'tunda 7 hari'. Buka dashboard: [link]"
3. Kasir buka dashboard WhatsApp Inbox → lihat balasan → nego di WhatsApp asli
4. Setelah deal, kasir di dashboard klik tombol:
   - [Tunda 3 hari] [Tunda 7 hari] [Tunda 14 hari] [Custom tgl] → set `reminder_next_at` baru, state kembali `RESCHEDULED`
   - [Tandai sudah dihubungi tanpa reschedule] → state `MANUAL_CONTACTED`, reminder dipause selamanya untuk reminder ini, tapi reminder slot berikutnya (mis. H+1, sita H-1) tetap jalan
   - [Eskalasi ke Sita] → langsung proses sita
5. Saat tgl reschedule tiba → state kembali `AUTO_REMINDER`, kirim WA lagi

### Alert ke Admin Pusat (Anti-kasir-lalai)

**Konteks:** kalau ada konsumen balas WA tapi kasir outlet tidak respon / tidak set reschedule, owner harus tahu. Ini indicator kasir tidak responsive.

**Flow alerting:**

1. **Real-time alert** (Telegram ke grup admin/owner):
   - Konsumen balas WA → state HUMAN_HANDLING + timer mulai
   - Kalau >2 jam (jam kerja) tidak ada aksi kasir → notif Telegram ke owner: "⚠️ STALE: Nasabah X (outlet Y) balas WA 2 jam lalu, kasir belum respond/reschedule"
   - Kalau >24 jam tidak ada aksi → notif kedua, escalation

2. **Daily summary** (cron 21:00 WIB tiap hari):
   - Kirim ringkasan ke owner Telegram per outlet:
     ```
     📊 Ringkasan WA Outlet LANGSA hari ini:
     - Reminder terkirim: 23
     - Balasan masuk: 4
       - Sudah di-handle: 3 ✅
       - Belum di-handle (stale): 1 ⚠️
     - Reschedule di-set: 2
     - Failed delivery: 1
     ```

3. **Weekly performance** (cron Senin pagi):
   - Per kasir: berapa cepat rata-rata respond (Mean Time to Response)
   - Per outlet: response rate, reschedule rate, completion rate
   - Identifikasi kasir/outlet yang perlu attention

### Database Schema (Additive — TIDAK MENGGANGGU TABEL EXISTING)

Migration baru: `supabase/migrations/014_whatsapp_automation.sql`

```sql
-- A. Config Fonnte/Wablas per outlet
CREATE TABLE tb_wa_config (
  id SERIAL PRIMARY KEY,
  outlet_id INT REFERENCES outlets(id),
  provider TEXT NOT NULL DEFAULT 'FONNTE', -- 'FONNTE' | 'WABLAS' | 'WHACENTER'
  api_key TEXT NOT NULL,
  nomor_pengirim TEXT NOT NULL,
  nomor_backup TEXT,
  status TEXT DEFAULT 'ACTIVE', -- 'ACTIVE' | 'BANNED' | 'PAUSED'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(outlet_id, status) -- max 1 active per outlet
);

-- B. Log setiap WA yang dikirim
CREATE TABLE tb_wa_outgoing (
  id BIGSERIAL PRIMARY KEY,
  outlet_id INT,
  ref_table TEXT, -- 'tb_gadai' | 'tb_sjb' | 'tb_tebus' | 'tb_buyback'
  ref_id TEXT,
  no_faktur TEXT,
  nomor_tujuan TEXT NOT NULL,
  nama_nasabah TEXT,
  template_code TEXT NOT NULL, -- 'GADAI_NEW' | 'TEBUS_OK' | 'JT_H_MIN_1' | dst
  message_body TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING', -- 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
  provider_msg_id TEXT, -- ID dari Fonnte
  error_msg TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- C. Log balasan masuk dari konsumen
CREATE TABLE tb_wa_incoming (
  id BIGSERIAL PRIMARY KEY,
  outlet_id INT,
  nomor_pengirim TEXT NOT NULL, -- nomor konsumen
  nama_nasabah TEXT, -- resolve dari tb_gadai / tb_sjb berdasarkan nomor
  ref_table TEXT,
  ref_id TEXT,
  no_faktur TEXT,
  message_body TEXT NOT NULL,
  state TEXT DEFAULT 'NEW', -- 'NEW' | 'IN_PROGRESS' | 'HANDLED' | 'STALE'
  handled_by TEXT, -- nama kasir
  handled_at TIMESTAMPTZ,
  next_reminder_at TIMESTAMPTZ, -- kalau di-reschedule
  reschedule_reason TEXT,
  alerted_telegram BOOLEAN DEFAULT FALSE,
  received_at TIMESTAMPTZ DEFAULT now()
);

-- D. Per-kontrak: state reminder
ALTER TABLE tb_gadai ADD COLUMN reminder_state TEXT DEFAULT 'AUTO';
-- 'AUTO' | 'HUMAN_HANDLING' | 'RESCHEDULED' | 'MANUAL_CONTACTED' | 'OPT_OUT'
ALTER TABLE tb_gadai ADD COLUMN reminder_next_at TIMESTAMPTZ;
ALTER TABLE tb_gadai ADD COLUMN opt_out_wa BOOLEAN DEFAULT FALSE;

ALTER TABLE tb_sjb ADD COLUMN reminder_state TEXT DEFAULT 'AUTO';
ALTER TABLE tb_sjb ADD COLUMN reminder_next_at TIMESTAMPTZ;
ALTER TABLE tb_sjb ADD COLUMN opt_out_wa BOOLEAN DEFAULT FALSE;

-- E. Template (so easy to edit copy without code deploy)
CREATE TABLE tb_wa_template (
  code TEXT PRIMARY KEY, -- 'GADAI_NEW' | 'TEBUS_OK' | dst
  description TEXT,
  body TEXT NOT NULL, -- with {{placeholders}}
  is_active BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index untuk cron scan (jatuh tempo & sita)
CREATE INDEX idx_gadai_reminder_due ON tb_gadai(tgl_jt, tgl_sita, status, reminder_state) WHERE status = 'AKTIF';
CREATE INDEX idx_sjb_reminder_due ON tb_sjb(tgl_jt, tgl_sita, status, reminder_state) WHERE status = 'AKTIF';
```

### API Endpoints Baru

```
POST   /api/wa/send                  → Sender util, dipakai semua trigger (called dari gadai/submit, tebus/submit, dll)
POST   /api/wa/webhook               → Receiver dari Fonnte/Wablas (incoming reply)
GET    /api/wa/inbox?outletId=X      → List conversation untuk dashboard (filter by status)
POST   /api/wa/reschedule            → Kasir set tanggal reminder ulang
POST   /api/wa/mark-handled          → Kasir mark balasan sudah ditangani
GET    /api/wa/stats?outletId=X      → Stats untuk dashboard owner
POST   /api/wa/cron-reminder         → Cron daily 09:00 — kirim H-1/H/H+1 reminder
POST   /api/wa/cron-stale-alert      → Cron tiap jam — cek balasan yang belum di-handle >2 jam
POST   /api/wa/cron-daily-summary    → Cron 21:00 — kirim daily summary ke owner Telegram
```

### Cron Schedule Baru di vercel.json

```json
{
  "crons": [
    { "path": "/api/backup/nightly", "schedule": "0 16 * * *" },
    { "path": "/api/laporan/nightly-send", "schedule": "0 18 * * *" },
    { "path": "/api/wa/cron-reminder", "schedule": "0 2 * * *" },     // 09:00 WIB = 02:00 UTC
    { "path": "/api/wa/cron-stale-alert", "schedule": "0 * * * *" },  // tiap jam
    { "path": "/api/wa/cron-daily-summary", "schedule": "0 14 * * *" } // 21:00 WIB = 14:00 UTC
  ]
}
```

### UI Baru

#### Halaman `/wa-inbox` (Dashboard WhatsApp)

- Left panel: list conversation per outlet (kasir lihat outlet sendiri, owner lihat semua)
- Indicator badge: 🔵 NEW reply, 🟢 IN_PROGRESS, ⚠️ STALE (>2 jam), ✅ HANDLED
- Right panel: chat detail per conversation
- Quick actions:
  - [Tunda 3/7/14/Custom hari]
  - [Tandai dihubungi via telepon]
  - [Eskalasi ke Sita]
  - [Buka WhatsApp ↗] (untuk reply manual via app WhatsApp asli)
- Filter & search: per outlet, per status, per tanggal
- Stats card di atas: sent, delivered, read, replied, failed, stale
- Untuk owner: bandingan antar outlet

#### Setting WhatsApp di `/owner` atau `/settings`

- Form input API key Fonnte per outlet
- Set nomor pengirim primary & backup
- Toggle ON/OFF auto-reminder per outlet
- Edit template message (advanced — owner only)

#### Indicator di `/jatuhtempo` & dashboard

- Per kontrak tampil status reminder: ⏳ AUTO / 👤 HUMAN / 🔁 RESCHEDULED (with tgl) / ✅ DONE / ⛔ OPT-OUT
- Tombol manual "Kirim WA Reminder Sekarang" (untuk emergency manual blast)

### Template Notifikasi (Draft Awal — Bisa Diedit Pak Fendy)

> Catatan: setiap template harus include nama outlet & nomor WA outlet kalau konsumen mau konfirmasi.

**GADAI_NEW:**
```
Halo Bpk/Ibu {{nama}},
Akad gadai Anda telah aktif:
• No: {{no_faktur}}
• Barang: {{barang}}
• Pinjaman: Rp {{jumlah_gadai}}
• Jatuh tempo: {{tgl_jt}}
• Tgl jual: {{tgl_sita}}

Reminder otomatis akan dikirim H-1 jatuh tempo.
Outlet: ACEH GADAI SYARIAH {{outlet}}
WA: {{wa_outlet}}
```

**TEBUS_OK:**
```
Konfirmasi penebusan:
• No: {{no_faktur}}
• Barang: {{barang}}
• Total bayar: Rp {{jumlah_bayar}}
{{#diskon}}• Diskon ujrah: Rp {{selisih}}{{/diskon}}
• Tgl tebus: {{tgl_tebus}}

Terima kasih telah mempercayakan kami.
Outlet ACEH GADAI SYARIAH {{outlet}}
```

**DISKON_CONFIRM (anti-fraud):**
```
PENTING — Bpk/Ibu {{nama}},
Anda telah mendapat KERINGANAN UJRAH pada transaksi {{no_faktur}}:
• Ujrah seharusnya: Rp {{ujrah_seharusnya}}
• Diskon yang diberikan: Rp {{selisih}}
• Total yang Anda bayar: Rp {{jumlah_bayar}}
• Kasir: {{kasir}}
• Alasan diskon: {{alasan}}

Simpan pesan ini sebagai bukti. Jika ada selisih dengan yang dibayarkan,
mohon hubungi kantor pusat di {{wa_owner}}.
```

**JT_H_MIN_1 (jatuh tempo besok):**
```
Halo Bpk/Ibu {{nama}},
Kontrak gadai {{no_faktur}} ({{barang}}) akan JATUH TEMPO BESOK
({{tgl_jt}}). Mohon segera dilakukan tebus atau perpanjang.

Total yang harus dibayar:
• Tebus: Rp {{total_tebus}}
• Perpanjang (ujrah saja): Rp {{ujrah}}

Outlet: ACEH GADAI SYARIAH {{outlet}}
WA: {{wa_outlet}}

Balas pesan ini jika butuh penundaan atau bantuan.
```

(Template lain akan dibuat saat development)

### Estimasi Effort

- DB migration + template seed: ~2 jam
- API endpoint /api/wa/send + integration di submit endpoints: ~6-8 jam
- API endpoint webhook receiver + state machine: ~4-6 jam
- Cron jobs (reminder + stale alert + daily summary): ~4-6 jam
- Dashboard UI `/wa-inbox`: ~8-12 jam
- Setting page (API key per outlet): ~2-3 jam
- Testing menyeluruh: ~4-6 jam
- **Total: ~30-45 jam (4-6 hari full focus)**

### Safety Plan saat Build

⚠️ **TIDAK BOLEH GANGGU FUNGSI EXISTING:**

- Semua schema changes wajib additive (ADD COLUMN dengan default, CREATE TABLE baru). TIDAK ada DROP / RENAME.
- Auto-WA dipanggil setelah transaksi sukses (post-commit). Kalau WA gagal → log error, tapi transaksi tetap success. Alur kas TIDAK terpengaruh.
- Fitur dibalik feature flag per outlet (`tb_wa_config.status = 'ACTIVE'`). Outlet yang belum setup tetap jalan normal tanpa WA.
- Test di outlet 1 dulu (mis. LANGSA), monitor 1 minggu, baru roll out ke outlet lain.
- Template message editable di DB (`tb_wa_template`), bisa di-update tanpa deploy kode.

---

## CATATAN PRINSIP DEVELOPMENT (untuk Claude sesi mendatang)

1. **Hormati alur kas yang sudah jalan** — `lib/db/kas.ts` dan `generateKas()` adalah fungsi paling kritis. Tidak boleh diutak-atik tanpa explicit instruction dari Pak Fendy. Setiap perubahan yang menyentuhnya wajib disebutkan eksplisit di commit message.

2. **Sebelum perubahan besar, tanya dulu** — Pak Fendy explicit mau dikonfirmasi sebelum perubahan yang berpotensi merusak fungsi lain. Jangan main commit langsung.

3. **Migration selalu additive** — JANGAN DROP/RENAME kolom yang masih dipakai. Tambah kolom baru, deprecate yang lama secara perlahan.

4. **Update PROJECT_PLAN.md ini** kalau ada milestone selesai atau roadmap berubah.

5. **Tag versi stabil** setelah setiap deploy production sukses: `git tag -a vX.Y-stable -m "..."` lalu push.

6. **Vercel currently manual promote** — push ke master HANYA bikin preview. Pak Fendy harus klik "Promote to Production" di Vercel dashboard. Pattern ini akan terus dipakai sampai Phase 3 (setup dev env terpisah).

---

## CHANGELOG PROJECT_PLAN

- **2026-05-14** — Plan awal disusun setelah diskusi WhatsApp automation + customer app roadmap dengan Pak Fendy
