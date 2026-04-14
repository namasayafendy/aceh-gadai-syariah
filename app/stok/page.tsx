'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Cek Stok (Audit + Total Aset)
// File: app/stok/page.tsx
// Replika 100% dari cekstok.html GAS:
// - Tab Audit Stok: scan barcode per rak, cek OK/salah rak
// - Tab Total Aset: laporan semua barang aktif per rak
// ============================================================

import { useState, useRef, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';

// ── Types ────────────────────────────────────────────────────
interface RakItem {
  id: string; kode: string; nama: string; kategori: string; ket: string;
}
interface AuditItem {
  scanKey: string; noFaktur: string; nama: string; kategori: string;
  barang: string; taksiran: number; pinjaman: number;
  tglGadai: string; tglJT: string; rak: string; tipe: string;
}
interface ScannedEntry {
  scanKey: string; noFaktur: string; nama: string; kategori: string;
  barang: string; tglJT: string; status: 'ok' | 'missplaced';
  seharusnya: string; scanRak: string;
}
interface UnknownEntry {
  bc: string; rak: string; time: string;
}
interface RakState {
  scanned: ScannedEntry[];
  done: boolean;
}
interface AuditState {
  activeRak: string | null;
  rakState: Record<string, RakState>;
  globalUnknown: UnknownEntry[];
}

// Aset types
interface AsetItem {
  noFaktur: string; tipe: string; nama: string; kategori: string;
  barang: string; taksiran: number; pinjaman: number;
  tglGadai: string; tglJT: string; rak: string; warning: string;
}

// ── Helper: format Rp mini ───────────────────────────────────
function rpMini(v: number) {
  return 'Rp ' + (v || 0).toLocaleString('id-ID');
}

// ══════════════════════════════════════════════════════════════
export default function CekStokPage() {
  const outletId = useOutletId();

  // Tab state
  const [activeTab, setActiveTab] = useState<'audit' | 'aset'>('audit');

  // Audit data from server
  const [auditData, setAuditData] = useState<{ rak: RakItem[]; items: AuditItem[] } | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);

  // Audit session state (client-side only, like GAS)
  const [audit, setAudit] = useState<AuditState | null>(null);

  // Flash message
  const [flash, setFlash] = useState<{ type: string; msg: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Scan input ref
  const scanRef = useRef<HTMLInputElement>(null);

  // Rekap modal
  const [showRekap, setShowRekap] = useState(false);

  // Aset state
  const [asetData, setAsetData] = useState<{ items: AsetItem[]; rakOrder: string[]; rakNames: Record<string, string> } | null>(null);
  const [asetLoading, setAsetLoading] = useState(false);

  // ── Flash helper ───────────────────────────────────────────
  const csFlash = useCallback((type: string, msg: string) => {
    setFlash({ type, msg });
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 3500);
  }, []);

  // ── Load audit data from server ────────────────────────────
  const loadAuditData = useCallback(async () => {
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/gadai/stok/audit?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) {
        setAuditData({ rak: json.rak || [], items: json.items || [] });
      } else {
        csFlash('err', json.msg || 'Gagal memuat data');
      }
    } catch {
      csFlash('err', 'Error koneksi server');
    }
    setAuditLoading(false);
  }, [outletId, csFlash]);

  // Load on mount
  useEffect(() => { loadAuditData(); }, [loadAuditData]);

  // ── Missing items for a rak ────────────────────────────────
  const getMissingForRak = useCallback((rakKode: string): AuditItem[] => {
    if (!auditData || !audit) return [];
    const expected = auditData.items.filter(it => it.rak === rakKode);
    const scannedBCs: Record<string, boolean> = {};

    // Items scanned OK in this rak
    const st = audit.rakState[rakKode];
    if (st) st.scanned.forEach(s => { if (s.status === 'ok') scannedBCs[s.scanKey] = true; });

    // Items found in other rak but belong to this rak (missplaced)
    Object.keys(audit.rakState).forEach(rk => {
      audit.rakState[rk].scanned.forEach(s => {
        if (s.seharusnya === rakKode || (s.status === 'missplaced' && auditData.items.find(it => it.scanKey === s.scanKey && it.rak === rakKode))) {
          scannedBCs[s.scanKey] = true;
        }
      });
    });

    return expected.filter(it => !scannedBCs[it.scanKey]);
  }, [auditData, audit]);

  // ── Pill stats ─────────────────────────────────────────────
  const getPillStats = useCallback(() => {
    if (!audit || !auditData) return { ok: 0, mis: 0, miss: 0, unk: 0 };
    let totalOk = 0, totalMis = 0, totalMiss = 0;
    const totalUnk = audit.globalUnknown.length;

    Object.values(audit.rakState).forEach(st => {
      st.scanned.forEach(s => {
        if (s.status === 'ok') totalOk++;
        else totalMis++;
      });
    });

    // Missing = expected not scanned anywhere
    auditData.items.forEach(it => {
      let found = false;
      Object.values(audit.rakState).forEach(st => {
        if (st.scanned.find(s => s.scanKey === it.scanKey)) found = true;
      });
      if (!found) totalMiss++;
    });

    return { ok: totalOk, mis: totalMis, miss: totalMiss, unk: totalUnk };
  }, [audit, auditData]);

  // ── Select rak ─────────────────────────────────────────────
  const selectRak = (kode: string) => {
    if (!audit) {
      csFlash('err', 'Tekan "Mulai Audit Baru" terlebih dahulu.');
      return;
    }
    setAudit(prev => {
      if (!prev) return prev;
      const newState = { ...prev, activeRak: kode };
      if (!newState.rakState[kode]) {
        newState.rakState = { ...newState.rakState, [kode]: { scanned: [], done: false } };
      }
      return newState;
    });
    setTimeout(() => scanRef.current?.focus(), 100);
  };

  // ── Mulai Audit Baru ──────────────────────────────────────
  const mulaiAuditBaru = async () => {
    if (audit && !confirm('Reset audit dan mulai dari awal?')) return;
    // Refresh data from server
    setAuditLoading(true);
    try {
      const res = await fetch(`/api/gadai/stok/audit?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) {
        setAuditData({ rak: json.rak || [], items: json.items || [] });
        setAudit({ activeRak: null, rakState: {}, globalUnknown: [] });
        csFlash('ok', 'Audit baru dimulai. Pilih rak untuk mulai scan.');
      } else {
        csFlash('err', json.msg || 'Gagal memuat data');
      }
    } catch {
      csFlash('err', 'Error koneksi server');
    }
    setAuditLoading(false);
  };

  // ── Scan submit ────────────────────────────────────────────
  const scanSubmit = () => {
    if (!scanRef.current) return;
    const bc = scanRef.current.value.trim().toUpperCase();
    scanRef.current.value = '';
    scanRef.current.focus();
    if (!bc) return;

    if (!audit) { csFlash('err', 'Tekan "Mulai Audit Baru" terlebih dahulu.'); return; }
    if (!audit.activeRak) { csFlash('err', 'Pilih rak terlebih dahulu.'); return; }
    if (!auditData) return;

    const activeRak = audit.activeRak;

    // Cari item berdasarkan scanKey (barcodeB)
    const found = auditData.items.find(it => it.scanKey.toUpperCase() === bc);

    if (!found) {
      // Tidak ada di database
      setAudit(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          globalUnknown: [...prev.globalUnknown, { bc, rak: activeRak, time: new Date().toLocaleTimeString('id-ID') }]
        };
      });
      csFlash('err', '❓ Barcode tidak dikenal — tidak ada di data aktif.');
      return;
    }

    // Cek duplikat scan
    let alreadyScanned = false;
    Object.values(audit.rakState).forEach(st => {
      if (st.scanned.find(s => s.scanKey === bc)) alreadyScanned = true;
    });
    if (alreadyScanned) {
      csFlash('warn', '⚠️ Barcode ini sudah pernah discan sebelumnya.');
      return;
    }

    // Status: ok vs missplaced
    const isMissplaced = found.rak !== activeRak;
    const entry: ScannedEntry = {
      scanKey:    bc,
      noFaktur:   found.noFaktur,
      nama:       found.nama,
      kategori:   found.kategori,
      barang:     found.barang,
      tglJT:      found.tglJT,
      status:     isMissplaced ? 'missplaced' : 'ok',
      seharusnya: isMissplaced ? found.rak : '',
      scanRak:    activeRak,
    };

    setAudit(prev => {
      if (!prev || !prev.activeRak) return prev;
      const rk = prev.activeRak;
      const oldSt = prev.rakState[rk] || { scanned: [], done: false };
      return {
        ...prev,
        rakState: {
          ...prev.rakState,
          [rk]: { ...oldSt, scanned: [...oldSt.scanned, entry] },
        },
      };
    });

    if (isMissplaced) {
      csFlash('warn', `🔀 SALAH RAK! ${found.noFaktur} — ${found.nama} / ${found.barang} seharusnya di RAK ${found.rak}`);
    } else {
      csFlash('ok', `✅ ${found.noFaktur} — ${found.nama} / ${found.barang}`);
    }
  };

  // ── Done / Skip rak ────────────────────────────────────────
  const doneRak = () => {
    if (!audit?.activeRak || !auditData) return;
    const rk = audit.activeRak;
    setAudit(prev => {
      if (!prev) return prev;
      const oldSt = prev.rakState[rk] || { scanned: [], done: false };
      return { ...prev, rakState: { ...prev.rakState, [rk]: { ...oldSt, done: true } } };
    });
    csFlash('ok', `Rak ${rk} ditandai selesai.`);
    // Auto-select next undone rak
    const nextRak = auditData.rak.find(r => {
      const st = audit.rakState[r.kode];
      return !st || !st.done;
    });
    if (nextRak && nextRak.kode !== rk) {
      setTimeout(() => selectRak(nextRak.kode), 100);
    } else {
      csFlash('ok', '🎉 Semua rak sudah diaudit! Tekan "Selesai & Rekap" untuk hasil akhir.');
    }
  };

  const skipRak = () => {
    if (!audit?.activeRak) return;
    csFlash('warn', `Rak ${audit.activeRak} di-skip. Pilih rak selanjutnya.`);
    setAudit(prev => prev ? { ...prev, activeRak: null } : prev);
  };

  // ── Cetak rekap audit PDF ──────────────────────────────────
  const cetakRekapAudit = () => {
    if (!audit || !auditData) return;
    const allScanned: Record<string, ScannedEntry> = {};
    const missplacedItems: ScannedEntry[] = [];
    const missingItems: AuditItem[] = [];
    let totalOk = 0, totalMis = 0, totalMiss = 0;
    const totalUnk = audit.globalUnknown.length;

    Object.values(audit.rakState).forEach(st => {
      st.scanned.forEach(s => {
        allScanned[s.scanKey] = s;
        if (s.status === 'ok') totalOk++;
        else { totalMis++; missplacedItems.push(s); }
      });
    });

    auditData.items.forEach(it => {
      if (!allScanned[it.scanKey]) { totalMiss++; missingItems.push(it); }
    });

    const fmtDate2 = new Date().toLocaleString('id-ID');
    let rowsMp = missplacedItems.map((s, i) =>
      `<tr><td>${i+1}</td><td>${s.noFaktur}</td><td>${s.nama}</td><td>${s.barang}</td><td style="color:#d97706;font-weight:700">${s.seharusnya}</td><td style="color:#2563eb">${s.scanRak}</td></tr>`
    ).join('');

    const missTotalTaks = missingItems.reduce((s, m) => s + (m.taksiran || 0), 0);
    const missTotalPinj = missingItems.reduce((s, m) => s + (m.pinjaman || 0), 0);
    let rowsMiss = missingItems.map((m, i) =>
      `<tr><td>${i+1}</td><td>${m.noFaktur}</td><td>${m.nama}</td><td>${m.kategori}</td><td>${m.barang}</td><td>${formatDate(m.tglGadai)}</td><td style="color:#d97706">${formatDate(m.tglJT)}</td><td style="text-align:right;font-weight:700">${rpMini(m.taksiran)}</td><td style="text-align:right;font-weight:700;color:#ef4444">${rpMini(m.pinjaman)}</td><td style="font-weight:700;color:#ef4444">${m.rak}</td></tr>`
    ).join('');
    rowsMiss += `<tr style="background:#fee2e2"><td colspan="7" style="text-align:right;font-weight:700;padding:4px 7px">Total</td><td style="text-align:right;font-weight:900;padding:4px 7px">${rpMini(missTotalTaks)}</td><td style="text-align:right;font-weight:900;color:#ef4444;padding:4px 7px">${rpMini(missTotalPinj)}</td><td></td></tr>`;

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Rekap Audit Stok</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:11px;color:#111;padding:20px}h1{font-size:15px;font-weight:700;margin-bottom:2px}.sub{font-size:10px;color:#6b7280;margin-bottom:14px}.pills{display:flex;gap:10px;margin-bottom:14px}.pill{padding:6px 14px;border-radius:6px;font-weight:700;font-size:12px}table{width:100%;border-collapse:collapse;margin-bottom:14px;font-size:10px}th{background:#f3f4f6;padding:5px 7px;text-align:left;font-size:9px;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #d1d5db}td{padding:5px 7px;border-bottom:1px solid #e5e7eb}h2{font-size:11px;font-weight:700;margin:10px 0 5px;text-transform:uppercase;letter-spacing:.4px;color:#374151}@media print{@page{size:A4;margin:12mm}}</style></head><body>`;
    html += `<h1>📋 Rekap Audit Stok — Aceh Gadai Syariah</h1>`;
    html += `<div class="sub">Dicetak: ${fmtDate2} · ${auditData.items.length} item · ${auditData.rak.length} rak</div>`;
    html += `<div class="pills"><div class="pill" style="background:#d1fae5;color:#065f46">✅ Sesuai: ${totalOk}</div><div class="pill" style="background:#fef3c7;color:#92400e">🔀 Salah Rak: ${totalMis}</div><div class="pill" style="background:#fee2e2;color:#991b1b">⚠️ Tidak Ditemukan: ${totalMiss}</div>${totalUnk ? `<div class="pill" style="background:#f3f4f6;color:#374151">❓ Tidak Dikenal: ${totalUnk}</div>` : ''}</div>`;
    if (missplacedItems.length) {
      html += `<h2>🔀 Barang Salah Rak</h2><table><thead><tr><th>No</th><th>No Faktur</th><th>Nama</th><th>Barang</th><th>Seharusnya di</th><th>Ditemukan di</th></tr></thead><tbody>${rowsMp}</tbody></table>`;
    }
    if (missingItems.length) {
      html += `<h2>⚠️ Barang Tidak Ditemukan</h2><table><thead><tr><th>No</th><th>No Faktur</th><th>Nama</th><th>Kategori</th><th>Barang</th><th>Tgl Gadai</th><th>JT</th><th style="text-align:right">Taksiran</th><th style="text-align:right">Pinjaman/Harga Jual</th><th>Rak</th></tr></thead><tbody>${rowsMiss}</tbody></table>`;
    }
    if (!missplacedItems.length && !missingItems.length) {
      html += '<p style="text-align:center;padding:20px;font-weight:700;color:#059669">🎉 Semua item ditemukan dan posisi sesuai!</p>';
    }
    html += `<p style="font-size:9px;color:#9ca3af;margin-top:10px;border-top:1px solid #e5e7eb;padding-top:6px">Aceh Gadai Syariah · Laporan Audit Stok · ${fmtDate2}</p></body></html>`;

    const win = window.open('', '_blank', 'width=900,height=650');
    if (!win) { alert('Izinkan popup untuk mencetak.'); return; }
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 400);
  };

  // ── Load total aset ────────────────────────────────────────
  const loadTotalAset = async () => {
    setAsetLoading(true);
    try {
      const res = await fetch(`/api/gadai/stok/aset?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) {
        setAsetData({ items: json.items || [], rakOrder: json.rakOrder || [], rakNames: json.rakNames || {} });
      } else {
        csFlash('err', json.msg || 'Gagal memuat data aset');
      }
    } catch {
      csFlash('err', 'Error koneksi server');
    }
    setAsetLoading(false);
  };

  // ── Cetak aset PDF ─────────────────────────────────────────
  const cetakAsetPdf = () => {
    if (!asetData || !asetData.items.length) return;
    const { items, rakOrder: ro, rakNames: rn } = asetData;
    const fmtDate2 = new Date().toLocaleString('id-ID');

    const byRak: Record<string, AsetItem[]> = {};
    items.forEach(it => {
      const rk = it.rak || '(Tanpa Rak)';
      if (!byRak[rk]) byRak[rk] = [];
      byRak[rk].push(it);
    });
    const totalItem = items.length;
    const totalTaks = items.reduce((s, i) => s + (i.taksiran || 0), 0);
    const totalPinj = items.reduce((s, i) => s + (i.pinjaman || 0), 0);

    const rakOrder2 = [...(ro.length ? ro : Object.keys(byRak).sort())];
    Object.keys(byRak).forEach(r => { if (!rakOrder2.includes(r)) rakOrder2.push(r); });

    let rows = '';
    let no = 0;
    rakOrder2.forEach(rk => {
      const list = byRak[rk];
      if (!list?.length) return;
      const rakTaks = list.reduce((s, i) => s + (i.taksiran || 0), 0);
      const rakPinj = list.reduce((s, i) => s + (i.pinjaman || 0), 0);
      const rakNama = rn[rk] ? `${rk} — ${rn[rk]}` : rk;
      rows += `<tr class="rak-hdr"><td colspan="8">📦 Rak ${rakNama} (${list.length} item)</td><td>${rpMini(rakTaks)}</td><td>${rpMini(rakPinj)}</td></tr>`;
      list.forEach(it => {
        no++;
        const isJt = it.warning && it.warning !== 'BERJALAN';
        rows += `<tr><td>${no}</td><td style="font-family:monospace;font-size:9px">${it.noFaktur}</td><td style="font-size:9px">${it.tipe}</td><td>${it.nama}</td><td style="font-size:9px">${it.kategori}</td><td>${it.barang}</td><td style="font-size:9px">${formatDate(it.tglGadai)}</td><td style="font-size:9px;${isJt ? 'color:#d97706;font-weight:700' : ''}">${formatDate(it.tglJT)}${isJt ? ' ⚠️' : ''}</td><td style="text-align:right">${rpMini(it.taksiran)}</td><td style="text-align:right;font-weight:700">${rpMini(it.pinjaman)}</td></tr>`;
      });
      rows += `<tr class="sub-row"><td colspan="8" style="text-align:right">Subtotal Rak ${rk} (${list.length})</td><td style="text-align:right">${rpMini(rakTaks)}</td><td style="text-align:right">${rpMini(rakPinj)}</td></tr>`;
    });

    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Laporan Total Aset Gudang</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;font-size:10px;color:#111;padding:16px}h1{font-size:14px;font-weight:700}p.sub{font-size:9px;color:#6b7280;margin-bottom:10px}.pills{display:flex;gap:8px;margin-bottom:12px}.pill{padding:6px 12px;border-radius:6px;font-size:11px;font-weight:700}table{width:100%;border-collapse:collapse}th{background:#f3f4f6;padding:4px 6px;font-size:8px;text-transform:uppercase;color:#6b7280;border-bottom:1px solid #d1d5db;text-align:left}td{padding:4px 6px;border-bottom:1px solid #e5e7eb}.rak-hdr td{background:#eff6ff;color:#1d4ed8;font-weight:700;border-top:1px solid #bfdbfe;font-size:10px}.sub-row td{background:#f9fafb;font-weight:700;font-size:9px}.grand td{background:#eef2ff;color:#4338ca;font-weight:900;font-size:11px;border-top:2px solid #6366f1}td.r{text-align:right}@media print{@page{size:A4 landscape;margin:10mm}body{padding:0}}</style></head><body>`;
    html += `<h1>🏦 Laporan Total Aset Gudang — Aceh Gadai Syariah</h1><p class="sub">Dicetak: ${fmtDate2}</p>`;
    html += `<div class="pills"><div class="pill" style="background:#dbeafe;color:#1e40af">📦 ${totalItem} Item</div><div class="pill" style="background:#d1fae5;color:#065f46">Taksiran: ${rpMini(totalTaks)}</div><div class="pill" style="background:#fef3c7;color:#92400e">Pinjaman / Harga Jual: ${rpMini(totalPinj)}</div></div>`;
    html += `<table><thead><tr><th>No</th><th>No Kontrak</th><th>Tipe</th><th>Nama</th><th>Kategori</th><th>Barang</th><th>Tgl Gadai/Akad</th><th>Jatuh Tempo</th><th>Taksiran</th><th>Pinjaman/Harga Jual</th></tr></thead><tbody>${rows}<tr class="grand"><td colspan="8">🏦 TOTAL ASET GUDANG (${totalItem} item)</td><td class="r">${rpMini(totalTaks)}</td><td class="r">${rpMini(totalPinj)}</td></tr></tbody></table>`;
    html += `<p style="font-size:8px;color:#9ca3af;margin-top:8px;border-top:1px solid #e5e7eb;padding-top:6px">Aceh Gadai Syariah · Laporan Aset Gudang · ${fmtDate2}</p></body></html>`;

    const win = window.open('', '_blank', 'width=1100,height=700');
    if (!win) { alert('Izinkan popup untuk cetak.'); return; }
    win.document.write(html); win.document.close(); win.focus();
    setTimeout(() => win.print(), 500);
  };

  // ── Computed values ────────────────────────────────────────
  const pills = getPillStats();
  const activeRak = audit?.activeRak ?? null;
  const activeRakInfo = auditData?.rak.find(r => r.kode === activeRak) ?? null;
  const activeRakExpected = activeRak ? (auditData?.items.filter(it => it.rak === activeRak) ?? []) : [];
  const activeRakScanned = activeRak && audit?.rakState[activeRak] ? audit.rakState[activeRak].scanned : [];
  const activeRakOkCount = activeRakScanned.filter(s => s.status === 'ok').length;
  const activeRakMissing = activeRak ? getMissingForRak(activeRak) : [];

  // Count per rak for left panel
  const countPerRak: Record<string, number> = {};
  auditData?.items.forEach(it => { countPerRak[it.rak] = (countPerRak[it.rak] || 0) + 1; });

  // Aset computed
  const asetByRak: Record<string, AsetItem[]> = {};
  asetData?.items.forEach(it => {
    const rk = it.rak || '(Tanpa Rak)';
    if (!asetByRak[rk]) asetByRak[rk] = [];
    asetByRak[rk].push(it);
  });
  const asetTotalItem = asetData?.items.length ?? 0;
  const asetTotalTaks = asetData?.items.reduce((s, i) => s + (i.taksiran || 0), 0) ?? 0;
  const asetTotalPinj = asetData?.items.reduce((s, i) => s + (i.pinjaman || 0), 0) ?? 0;
  const asetRakOrder = (() => {
    const ro = asetData?.rakOrder?.length ? [...asetData.rakOrder] : Object.keys(asetByRak).sort();
    Object.keys(asetByRak).forEach(r => { if (!ro.includes(r)) ro.push(r); });
    return ro;
  })();

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <AppShell title="📦 Cek Stok" subtitle="Audit stok & total aset gudang">
      <div style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>

        {/* ── LEFT: Rak list panel ── */}
        <div style={{ width: 240, minWidth: 240, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface)', borderRight: '1px solid var(--border)' }}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px' }}>
              {activeTab === 'audit' ? '📦 Cek Stok' : '💰 Total Aset'}
            </h3>
            <p style={{ fontSize: 10, color: 'var(--text3)', margin: 0 }}>
              {auditData ? `${auditData.rak.length} rak · ${auditData.items.length} item aktif` : 'Belum dimuat'}
            </p>
          </div>

          {/* Rak list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {auditLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>⏳ Memuat data...</div>
            ) : !auditData?.rak.length ? (
              <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: 'var(--text3)' }}>Belum ada rak terdaftar.<br/>Tambah rak di menu Owner.</div>
            ) : auditData.rak.map(r => {
              const cnt = countPerRak[r.kode] || 0;
              const state = audit?.rakState[r.kode];
              let icon = '🔲', cls = '', doneTxt = '';
              if (state?.done) {
                const miss = getMissingForRak(r.kode).length;
                if (miss === 0) { icon = '✅'; cls = 'done-ok'; doneTxt = 'Lengkap'; }
                else { icon = '⚠️'; cls = 'done-warn'; doneTxt = `${miss} kurang`; }
              } else if (state && state.scanned.length) {
                icon = '🔄'; doneTxt = `${state.scanned.length} terscan`;
              }
              const isActive = activeRak === r.kode;
              return (
                <div key={r.kode} onClick={() => selectRak(r.kode)}
                  style={{
                    padding: '9px 12px', borderRadius: 7, marginBottom: 4, cursor: 'pointer',
                    border: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    background: isActive ? 'rgba(99,102,241,.06)' : undefined,
                    opacity: cnt === 0 ? 0.45 : 1,
                    transition: '.15s',
                  }}>
                  <span style={{ float: 'right', fontSize: 11, marginTop: 1 }}>{icon}</span>
                  <div style={{ fontSize: 12, fontWeight: 600, color: cls === 'done-ok' ? 'var(--green)' : cls === 'done-warn' ? 'var(--warn)' : undefined }}>
                    {r.kode} — {r.nama}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2 }}>
                    {cnt} item{doneTxt ? ` · ${doneTxt}` : ''}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom buttons */}
          <div style={{ padding: '10px 8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <button className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={mulaiAuditBaru}>
              🔄 Mulai Audit Baru
            </button>
            <button className="btn btn-sm" style={{ width: '100%', background: '#6366f1', color: '#fff', border: 'none' }}
              disabled={!audit} onClick={() => setShowRekap(true)}>
              ✅ Selesai &amp; Rekap
            </button>
          </div>
        </div>

        {/* ── RIGHT: main area ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* TABS */}
          <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
            <div onClick={() => setActiveTab('audit')}
              style={{ padding: '10px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                color: activeTab === 'audit' ? 'var(--accent)' : 'var(--text3)',
                borderBottom: `2px solid ${activeTab === 'audit' ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -2, whiteSpace: 'nowrap' }}>
              📋 Audit Stok
            </div>
            <div onClick={() => setActiveTab('aset')}
              style={{ padding: '10px 18px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                color: activeTab === 'aset' ? 'var(--accent)' : 'var(--text3)',
                borderBottom: `2px solid ${activeTab === 'aset' ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -2, whiteSpace: 'nowrap' }}>
              💰 Total Aset
            </div>
          </div>

          {/* ═══ PANEL AUDIT ═══ */}
          {activeTab === 'audit' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

              {/* Top header */}
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 2px' }}>
                  {activeRak ? `📦 Rak: ${activeRak}${activeRakInfo ? ` — ${activeRakInfo.nama}` : ''}` : 'Pilih Rak untuk Mulai Scan'}
                </h2>
                <p style={{ fontSize: 11, color: 'var(--text3)', margin: 0 }}>
                  {activeRak
                    ? `${activeRakExpected.length} item diharapkan · ${activeRakScanned.length} terscan · ${activeRakOkCount} sesuai`
                    : 'Klik rak di sebelah kiri, kemudian scan barcode barang satu per satu'}
                </p>
              </div>

              {/* Scan input */}
              <div style={{ display: 'flex', gap: 10, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0, alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>📷 Scan Barcode:</span>
                <input ref={scanRef} type="text"
                  placeholder="Scan atau ketik barcode — Enter untuk submit"
                  autoComplete="off" autoCorrect="off" spellCheck={false}
                  onKeyDown={e => { if (e.key === 'Enter') scanSubmit(); }}
                  style={{ flex: 1, padding: '10px 14px', fontSize: 14, background: 'var(--surface)', border: '2px solid var(--border)', borderRadius: 8, color: 'var(--text)', outline: 'none', fontFamily: 'var(--mono)' }} />
                <button className="btn btn-primary btn-sm" onClick={scanSubmit}>✓</button>
              </div>

              {/* Flash feedback */}
              {flash && (
                <div style={{
                  padding: '10px 20px', fontSize: 12, fontWeight: 600, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8,
                  background: flash.type === 'ok' ? 'rgba(16,185,129,.1)' : flash.type === 'warn' ? 'rgba(251,191,36,.1)' : 'rgba(239,68,68,.1)',
                  color: flash.type === 'ok' ? 'var(--green)' : flash.type === 'warn' ? '#d97706' : 'var(--red)',
                }}>
                  {flash.msg}
                </div>
              )}

              {/* Scanned table or idle */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
                {!activeRak ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 8, padding: 40 }}>
                    <div style={{ fontSize: 48 }}>📋</div>
                    <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
                      Pilih rak di panel kiri untuk mulai audit, atau tekan <b>Mulai Audit Baru</b> untuk reset
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Scanned items header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <h4 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', margin: 0 }}>
                        Item Terscan di Rak {activeRak} ({activeRakScanned.length})
                      </h4>
                      <span style={{ fontSize: 12, fontWeight: 700 }}>{activeRakOkCount} / {activeRakExpected.length}</span>
                    </div>

                    {/* Scanned table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 24, padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>No</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>No Faktur</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Nama</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Kategori</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Barang</th>
                          <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeRakScanned.length === 0 ? (
                          <tr><td colSpan={6} className="empty-state">Belum ada scan di rak ini</td></tr>
                        ) : activeRakScanned.map((s, i) => (
                          <tr key={i} style={{ borderLeft: `3px solid ${s.status === 'ok' ? 'var(--green)' : 'var(--warn)'}` }}>
                            <td style={{ padding: '7px 8px', color: 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{i + 1}</td>
                            <td style={{ padding: '7px 8px', fontFamily: 'var(--mono)', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.3)' }}>{s.noFaktur}</td>
                            <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{s.nama}</td>
                            <td style={{ padding: '7px 8px', fontSize: 10, color: 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{s.kategori}</td>
                            <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{s.barang}</td>
                            <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(46,51,73,.3)' }}>
                              {s.status === 'ok'
                                ? <span style={{ color: 'var(--green)', fontWeight: 700, fontSize: 10 }}>✅ OK</span>
                                : <span style={{ color: 'var(--warn)', fontWeight: 700, fontSize: 10 }}>🔀 Seharusnya: {s.seharusnya}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Missing items */}
                    {activeRakMissing.length > 0 && (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--warn)', marginBottom: 6 }}>
                          ⚠️ Belum Terscan di Rak Ini
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                          <thead>
                            <tr>
                              <th style={{ width: 24, padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>No</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>No Faktur</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Nama</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Kategori</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Barang</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>Gadai</th>
                              <th style={{ padding: '6px 8px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '1px solid var(--border)', background: 'var(--surface2)', fontWeight: 600 }}>JT</th>
                            </tr>
                          </thead>
                          <tbody>
                            {activeRakMissing.map((m, i) => (
                              <tr key={i} style={{ borderLeft: '3px solid var(--warn)' }}>
                                <td style={{ padding: '7px 8px', color: 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{i + 1}</td>
                                <td style={{ padding: '7px 8px', fontFamily: 'var(--mono)', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.3)' }}>{m.noFaktur}</td>
                                <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{m.nama}</td>
                                <td style={{ padding: '7px 8px', fontSize: 10, color: 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{m.kategori}</td>
                                <td style={{ padding: '7px 8px', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{m.barang}</td>
                                <td style={{ padding: '7px 8px', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.3)' }}>{formatDate(m.tglGadai)}</td>
                                <td style={{ padding: '7px 8px', fontSize: 10, color: 'var(--warn)', borderBottom: '1px solid rgba(46,51,73,.3)' }}>{formatDate(m.tglJT)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Bottom stat bar */}
              <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', background: 'var(--surface2)', flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid rgba(16,185,129,.3)', color: 'var(--green)' }}>
                  ✅ {pills.ok} ok
                </span>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid rgba(251,191,36,.3)', color: 'var(--warn)' }}>
                  🔀 {pills.mis} salah rak
                </span>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid rgba(239,68,68,.3)', color: 'var(--red)' }}>
                  ⚠️ {pills.miss} belum scan
                </span>
                <span style={{ padding: '4px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  ❓ {pills.unk} tdk dikenal
                </span>
                <div style={{ flex: 1 }} />
                {activeRak && (
                  <>
                    <button className="btn btn-outline btn-sm" onClick={skipRak}>⏭ Skip Rak Ini</button>
                    <button className="btn btn-sm" style={{ background: 'var(--green)', color: '#fff', border: 'none' }} onClick={doneRak}>✓ Tandai Rak Selesai</button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ═══ PANEL ASET ═══ */}
          {activeTab === 'aset' && (
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              {/* Toolbar */}
              <div style={{ padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface2)' }}>
                <button className="btn btn-primary btn-sm" onClick={loadTotalAset} disabled={asetLoading}>
                  {asetLoading ? '⏳ Memuat...' : asetData ? '🔄 Refresh' : '📊 Generate Laporan Aset'}
                </button>
                {asetData && asetData.items.length > 0 && (
                  <button className="btn btn-sm" style={{ background: '#6366f1', color: '#fff', border: 'none' }} onClick={cetakAsetPdf}>
                    🖨️ Cetak PDF
                  </button>
                )}
                {asetData && <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 4 }}>Per {new Date().toLocaleString('id-ID')}</span>}
              </div>

              {/* Summary cards */}
              {asetData && asetData.items.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, padding: '14px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Total Item</div>
                    <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{asetTotalItem}</div>
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Total Taksiran</div>
                    <div style={{ fontSize: 12, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{rpMini(asetTotalTaks)}</div>
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Total Pinjaman / Harga Jual</div>
                    <div style={{ fontSize: 12, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--warn)' }}>{rpMini(asetTotalPinj)}</div>
                  </div>
                  <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>Total Rak Berisi</div>
                    <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'var(--mono)', color: 'var(--text2)' }}>{Object.keys(asetByRak).length} rak</div>
                  </div>
                </div>
              )}

              {/* Aset table */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 0 }}>
                {!asetData ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 8, padding: 40 }}>
                    <div style={{ fontSize: 48 }}>💰</div>
                    <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
                      Tekan <b>Generate Laporan Aset</b> untuk melihat seluruh barang di gudang
                    </p>
                  </div>
                ) : asetData.items.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: 8, padding: 40 }}>
                    <div style={{ fontSize: 48 }}>📭</div>
                    <p style={{ fontSize: 13, textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
                      Tidak ada barang aktif di gudang saat ini
                    </p>
                  </div>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr>
                        <th style={{ width: 24, padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>No</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>No Kontrak</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Tipe</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Nama</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Kategori</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Barang</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Tgl Gadai/Akad</th>
                        <th style={{ padding: '7px 10px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Jatuh Tempo</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Taksiran</th>
                        <th style={{ padding: '7px 10px', textAlign: 'right', fontSize: 10, textTransform: 'uppercase', color: 'var(--text3)', borderBottom: '2px solid var(--border)', background: 'var(--surface2)', fontWeight: 600, position: 'sticky', top: 0, zIndex: 1 }}>Pinjaman / Harga Jual</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let no = 0;
                        return asetRakOrder.map(rk => {
                          const rows2 = asetByRak[rk];
                          if (!rows2?.length) return null;
                          const rakTaks = rows2.reduce((s, i) => s + (i.taksiran || 0), 0);
                          const rakPinj = rows2.reduce((s, i) => s + (i.pinjaman || 0), 0);
                          const rakNama = asetData.rakNames?.[rk] ? `${rk} — ${asetData.rakNames[rk]}` : rk;
                          return [
                            // Rak header row
                            <tr key={`rh-${rk}`} style={{ background: 'var(--surface2)', fontWeight: 700, fontSize: 11, color: 'var(--accent)', borderTop: '2px solid var(--border)' }}>
                              <td colSpan={8} style={{ padding: '8px 10px' }}>📦 Rak {rakNama} ({rows2.length} item)</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{rpMini(rakTaks)}</td>
                              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{rpMini(rakPinj)}</td>
                            </tr>,
                            // Item rows
                            ...rows2.map(it => {
                              no++;
                              const isJt = it.warning && it.warning !== 'BERJALAN';
                              const tipeBadge = it.tipe === 'SJB'
                                ? <span style={{ background: 'rgba(99,102,241,.15)', color: 'var(--accent)', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 }}>SJB</span>
                                : <span style={{ background: 'rgba(16,185,129,.12)', color: 'var(--green)', fontSize: 9, padding: '2px 6px', borderRadius: 10, fontWeight: 700 }}>GADAI</span>;
                              return (
                                <tr key={`ai-${it.noFaktur}-${no}`}>
                                  <td style={{ padding: '7px 10px', color: 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{no}</td>
                                  <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{it.noFaktur}</td>
                                  <td style={{ padding: '7px 10px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{tipeBadge}</td>
                                  <td style={{ padding: '7px 10px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{it.nama}</td>
                                  <td style={{ padding: '7px 10px', fontSize: 10, color: 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{it.kategori}</td>
                                  <td style={{ padding: '7px 10px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{it.barang}</td>
                                  <td style={{ padding: '7px 10px', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{formatDate(it.tglGadai)}</td>
                                  <td style={{ padding: '7px 10px', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)', ...(isJt ? { color: 'var(--warn)', fontWeight: 700 } : {}) }}>{formatDate(it.tglJT)}{isJt ? ' ⚠️' : ''}</td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{rpMini(it.taksiran)}</td>
                                  <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{rpMini(it.pinjaman)}</td>
                                </tr>
                              );
                            }),
                            // Subtotal row
                            <tr key={`st-${rk}`} style={{ background: 'rgba(99,102,241,.04)', fontWeight: 700, fontSize: 11 }}>
                              <td colSpan={8} style={{ padding: '5px 10px', textAlign: 'right' }}>Subtotal Rak {rk} ({rows2.length} item)</td>
                              <td style={{ padding: '5px 10px', textAlign: 'right' }}>{rpMini(rakTaks)}</td>
                              <td style={{ padding: '5px 10px', textAlign: 'right' }}>{rpMini(rakPinj)}</td>
                            </tr>,
                          ];
                        });
                      })()}
                      {/* Grand total */}
                      <tr style={{ background: 'var(--surface2)', fontWeight: 900, fontSize: 12, borderTop: '2px solid var(--accent)', color: 'var(--accent)' }}>
                        <td colSpan={8} style={{ padding: '8px 10px' }}>🏦 TOTAL ASET GUDANG ({asetTotalItem} item)</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{rpMini(asetTotalTaks)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right' }}>{rpMini(asetTotalPinj)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══ REKAP MODAL ══ */}
      {showRekap && audit && auditData && (() => {
        const allScanned2: Record<string, ScannedEntry> = {};
        const missplacedItems2: ScannedEntry[] = [];
        const missingItems2: AuditItem[] = [];
        let tOk = 0, tMis = 0, tMiss = 0;
        const tUnk = audit.globalUnknown.length;

        Object.values(audit.rakState).forEach(st => {
          st.scanned.forEach(s => {
            allScanned2[s.scanKey] = s;
            if (s.status === 'ok') tOk++;
            else { tMis++; missplacedItems2.push(s); }
          });
        });
        auditData.items.forEach(it => {
          if (!allScanned2[it.scanKey]) { tMiss++; missingItems2.push(it); }
        });

        // Group missing by rak
        const missByRak: Record<string, AuditItem[]> = {};
        missingItems2.forEach(m => { if (!missByRak[m.rak]) missByRak[m.rak] = []; missByRak[m.rak].push(m); });
        const missTotalTaks2 = missingItems2.reduce((s, m) => s + (m.taksiran || 0), 0);
        const missTotalPinj2 = missingItems2.reduce((s, m) => s + (m.pinjaman || 0), 0);

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={e => { if (e.target === e.currentTarget) setShowRekap(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 12, padding: 24, maxWidth: 680, width: '95%', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.4)' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>📋 Hasil Audit Stok</h2>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 16 }}>
                {new Date().toLocaleString('id-ID')} · {auditData.items.length} item · {Object.keys(audit.rakState).length} rak diaudit
              </div>

              {/* Summary pills */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 16 }}>
                {[
                  { lbl: 'Sesuai', val: tOk, col: 'var(--green)' },
                  { lbl: 'Salah Rak', val: tMis, col: 'var(--warn)' },
                  { lbl: 'Tidak Ditemukan', val: tMiss, col: 'var(--red)' },
                  { lbl: 'Tidak Dikenal', val: tUnk, col: 'var(--text3)' },
                ].map(p => (
                  <div key={p.lbl} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 9, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>{p.lbl}</div>
                    <div style={{ fontFamily: 'var(--mono)', fontSize: 18, fontWeight: 900, color: p.col }}>{p.val}</div>
                  </div>
                ))}
              </div>

              {/* Per-rak summary */}
              <div style={{ marginBottom: 16 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', margin: '0 0 8px' }}>📦 Rekap Per Rak</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead>
                    <tr>
                      {['Rak', 'Expected', 'Terscan', 'Salah Posisi', 'Kurang', 'Status'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', background: 'var(--surface2)', fontSize: 10, textAlign: 'left', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditData.rak.map(r => {
                      const exp = auditData.items.filter(it => it.rak === r.kode).length;
                      const st2 = audit.rakState[r.kode];
                      const scCnt = st2 ? st2.scanned.length : 0;
                      const misCnt = st2 ? st2.scanned.filter(s => s.status === 'missplaced').length : 0;
                      const kurang = getMissingForRak(r.kode).length;
                      const status = !st2 ? '🔲 Belum diaudit' : kurang === 0 && misCnt === 0 ? '✅ Lengkap' : '⚠️ Ada masalah';
                      return (
                        <tr key={r.kode}>
                          <td style={{ padding: '5px 8px', fontWeight: 700, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{r.kode} — {r.nama}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{exp}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'center', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{scCnt}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'center', color: misCnt ? 'var(--warn)' : 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{misCnt}</td>
                          <td style={{ padding: '5px 8px', textAlign: 'center', color: kurang ? 'var(--red)' : 'var(--text3)', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{kurang}</td>
                          <td style={{ padding: '5px 8px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Missplaced */}
              {missplacedItems2.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', margin: '0 0 8px' }}>
                    🔀 Barang Salah Rak ({missplacedItems2.length})
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr>
                      {['No Faktur', 'Nama', 'Barang', 'Seharusnya', 'Ditemukan di'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', background: 'var(--surface2)', fontSize: 10, textAlign: 'left', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {missplacedItems2.map((s, i) => (
                        <tr key={i}>
                          <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{s.noFaktur}</td>
                          <td style={{ padding: '5px 8px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{s.nama}</td>
                          <td style={{ padding: '5px 8px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{s.barang}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--warn)', fontWeight: 700, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{s.seharusnya}</td>
                          <td style={{ padding: '5px 8px', color: 'var(--accent)', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{s.scanRak}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Missing */}
              {missingItems2.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', margin: '0 0 8px' }}>
                    ⚠️ Barang Tidak Ditemukan ({missingItems2.length})
                  </h3>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 6, fontSize: 11 }}>
                    <span>Total Taksiran: <strong style={{ color: 'var(--red)', fontFamily: 'monospace' }}>{rpMini(missTotalTaks2)}</strong></span>
                    <span>Total Pinjaman/Harga Jual: <strong style={{ color: 'var(--red)', fontFamily: 'monospace' }}>{rpMini(missTotalPinj2)}</strong></span>
                  </div>
                  {Object.keys(missByRak).map(rk => (
                    <div key={rk}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--warn)', margin: '8px 0 4px' }}>Rak {rk} ({missByRak[rk].length})</div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, marginBottom: 8 }}>
                        <thead><tr>
                          {['No Faktur', 'Nama', 'Kategori', 'Barang', 'Gadai', 'JT', 'Taksiran', 'Pinjaman/Harga Jual'].map(h => (
                            <th key={h} style={{ padding: '5px 8px', background: 'var(--surface2)', fontSize: 10, textAlign: h.includes('Taksiran') || h.includes('Pinjaman') ? 'right' : 'left', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                          ))}
                        </tr></thead>
                        <tbody>
                          {missByRak[rk].map((m, i) => (
                            <tr key={i}>
                              <td style={{ padding: '5px 8px', fontFamily: 'monospace', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{m.noFaktur}</td>
                              <td style={{ padding: '5px 8px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{m.nama}</td>
                              <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{m.kategori}</td>
                              <td style={{ padding: '5px 8px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{m.barang}</td>
                              <td style={{ padding: '5px 8px', fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{formatDate(m.tglGadai)}</td>
                              <td style={{ padding: '5px 8px', fontSize: 10, color: 'var(--warn)', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{formatDate(m.tglJT)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10, borderBottom: '1px solid rgba(46,51,73,.25)' }}>{rpMini(m.taksiran)}</td>
                              <td style={{ padding: '5px 8px', textAlign: 'right', fontWeight: 700, fontSize: 10, color: 'var(--red)', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{rpMini(m.pinjaman)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}

              {/* Unknown */}
              {audit.globalUnknown.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text3)', margin: '0 0 8px' }}>
                    ❓ Barcode Tidak Dikenal ({audit.globalUnknown.length})
                  </h3>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead><tr>
                      {['Waktu Scan', 'Ditemukan di Rak'].map(h => (
                        <th key={h} style={{ padding: '5px 8px', background: 'var(--surface2)', fontSize: 10, textAlign: 'left', color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {audit.globalUnknown.map((u, i) => (
                        <tr key={i}>
                          <td style={{ padding: '5px 8px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{u.time}</td>
                          <td style={{ padding: '5px 8px', borderBottom: '1px solid rgba(46,51,73,.25)' }}>{u.rak}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tOk > 0 && tMis === 0 && tMiss === 0 && tUnk === 0 && (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--green)', fontSize: 14, fontWeight: 700 }}>
                  🎉 Semua item ditemukan dan posisi sesuai!
                </div>
              )}

              {/* Buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn btn-primary" onClick={cetakRekapAudit}>🖨️ Cetak PDF</button>
                <button className="btn btn-outline" onClick={() => setShowRekap(false)}>Tutup</button>
              </div>
            </div>
          </div>
        );
      })()}
    </AppShell>
  );
}
