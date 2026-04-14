'use client';

// ============================================================
// ACEH GADAI SYARIAH - Riwayat Kontrak
// File: app/riwayat/page.tsx
// Search by No SBR/SJB → show all contract history + events
// Mirrors GAS: searchHistoryByKontrak() + renderRiwayat()
// ============================================================

import { useState, useCallback, useRef, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatDate, formatDateTime } from '@/lib/format';

// ── Status color & icon maps ─────────────────────────────────
const statusColorMap: Record<string, string> = {
  PERPANJANG: 'var(--accent)', TAMBAH: 'var(--green)', KURANG: 'var(--warn)',
  TEBUS: '#10b981', SITA: '#ef4444', JUAL: '#f59e0b', BUYBACK: '#06b6d4',
  AKTIF: 'var(--text3)',
};
const statusIconMap: Record<string, string> = {
  PERPANJANG: '🔄', TAMBAH: '➕', KURANG: '➖',
  TEBUS: '✅', SITA: '🔒', JUAL: '🏷️', BUYBACK: '🔁',
};

function Badge({ st }: { st: string }) {
  const c = statusColorMap[st] || 'var(--text3)';
  return (
    <span style={{
      background: `${c}22`, color: c, fontSize: 9, fontWeight: 700,
      padding: '2px 7px', borderRadius: 4, textTransform: 'uppercase' as const,
    }}>
      {st}
    </span>
  );
}

export default function RiwayatPage() {
  const outletId = useOutletId();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const doSearch = useCallback(async () => {
    const nok = input.trim().toUpperCase();
    if (!nok) { setError('Masukkan No Kontrak.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/riwayat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ noKontrak: nok, outletId }),
      });
      const json = await res.json();
      if (!json.ok) { setError(json.msg || 'Tidak ditemukan'); }
      else { setResult(json); }
    } catch (e) { setError('Error: ' + (e as Error).message); }
    setLoading(false);
  }, [input, outletId]);

  const clearSearch = () => {
    setInput(''); setError(''); setResult(null);
    inputRef.current?.focus();
  };

  return (
    <AppShell title="Cari Riwayat Kontrak" subtitle="Search by No SBR / SJB">
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Search bar */}
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)',
          display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') doSearch(); }}
            placeholder="No SBR (SBR-1-0001) atau No SJB (SJB-1-...)"
            style={{
              flex: 1, minWidth: 200, padding: '8px 12px', fontSize: 13,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 7, color: 'var(--text)', fontFamily: 'var(--mono)',
            }}
          />
          <button className="btn btn-primary btn-sm" onClick={doSearch} disabled={loading}>
            🔍 Cari
          </button>
          <button className="btn btn-outline btn-sm" onClick={clearSearch}>✕ Reset</button>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {loading ? '⏳ Mencari...'
              : result ? `✅ ${result.gadai?.noFaktur || ''} · ${(result.events?.length ?? 0) + 1} event`
              : error ? `❌ ${error}`
              : 'Masukkan nomor kontrak lalu tekan Enter'}
          </span>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          {!result && !loading && !error && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 260, color: 'var(--text3)' }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Cari Riwayat Kontrak</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>Masukkan No SBR atau No SJB untuk melihat semua riwayat transaksi</div>
            </div>
          )}

          {error && !result && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--red)' }}>❌ {error}</div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text3)' }}>⏳ Memuat riwayat...</div>
          )}

          {result && <RiwayatResult data={result} />}
        </div>
      </div>
    </AppShell>
  );
}

// ── Riwayat result display ───────────────────────────────────
function RiwayatResult({ data }: { data: any }) {
  const g = data.gadai;
  const events: any[] = data.events || [];
  const sita = data.sita;
  const isSJB = g.tipe === 'SJB';

  return (
    <div>
      {/* ── Kontrak Header Card ──────────────────────────── */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderLeft: `4px solid ${isSJB ? 'var(--warn)' : 'var(--accent)'}`,
        borderRadius: 10, padding: 16, marginBottom: 16,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{
            background: isSJB ? 'rgba(245,158,11,.15)' : 'rgba(59,130,246,.15)',
            color: isSJB ? 'var(--warn)' : 'var(--accent)',
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 5,
          }}>
            {isSJB ? '📄 JUAL TITIP (SJB)' : '💰 GADAI SYARIAH'}
          </span>
          <Badge st={g.status || 'AKTIF'} />
          {g.warning && (
            <span style={{ fontSize: 10, color: 'var(--red)' }}>⚠️ {g.warning}</span>
          )}
        </div>

        {/* Data grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 24px' }}>
          <DataRow label="No Kontrak" value={g.noFaktur} mono />
          <DataRow label="Tanggal Gadai" value={formatDate(g.tglGadai)} />
          <DataRow label="Jatuh Tempo" value={formatDate(g.tglJT)} />
          <DataRow label="Nama Nasabah" value={g.nama} bold />
          <DataRow label="No KTP" value={g.noKtp} />
          <DataRow label="Telepon" value={g.telp} />
          <DataRow label="Kategori" value={g.kategori} />
          <DataRow label="Barang" value={g.barang} />
          {g.kelengkapan && <DataRow label="Kelengkapan" value={g.kelengkapan} />}
          {g.grade && <DataRow label="Grade" value={g.grade} />}
          <DataRow label="Taksiran" value={formatRp(g.taksiran)} green />
          <DataRow label={isSJB ? 'Harga Jual' : 'Jumlah Gadai'} value={formatRp(g.jumlahGadai)} bold />
          {!isSJB && <DataRow label="Ujrah/Bulan" value={formatRp(g.ujrahNominal)} />}
          {isSJB && <DataRow label="Harga Buyback" value={formatRp(g.ujrahNominal)} />}
          {isSJB && <DataRow label="Lama Titip" value={`${g.ujrahPersen} hari`} />}
          <DataRow label="Payment" value={g.payment} />
          <DataRow label="Kasir" value={g.kasir} />
          <DataRow label="Outlet" value={g.outlet} />
          {g.barcodeA && <DataRow label="Barcode A" value={g.barcodeA} mono />}
          {g.barcodeB && <DataRow label="Barcode B" value={g.barcodeB} mono />}
          {g.rak && <DataRow label="Lokasi Rak" value={g.rak} />}
        </div>
      </div>

      {/* ── Timeline ──────────────────────────────────────── */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text2)' }}>
          📋 Riwayat Transaksi ({events.length + 1} event)
        </div>

        {/* Initial event: GADAI */}
        <TimelineItem
          icon={isSJB ? '📄' : '💰'}
          status={isSJB ? 'AKAD SJB' : 'GADAI BARU'}
          tgl={formatDate(g.tglGadai)}
          color={isSJB ? 'var(--warn)' : 'var(--accent)'}
          isFirst
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11 }}>
            <span>{isSJB ? 'Harga Jual' : 'Pinjaman'}: <b>{formatRp(g.jumlahGadai)}</b></span>
            <span>Payment: {g.payment}</span>
            <span>Kasir: {g.kasir}</span>
            <span>Barang: {g.barang}</span>
          </div>
        </TimelineItem>

        {/* Subsequent events */}
        {events.map((ev, i) => {
          const st = String(ev.status || '').toUpperCase();
          const icon = statusIconMap[st] || '📌';
          const color = statusColorMap[st] || 'var(--text3)';
          return (
            <TimelineItem
              key={i}
              icon={icon}
              status={st}
              tgl={formatDateTime(ev.tgl)}
              color={color}
              isLast={i === events.length - 1 && !sita}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11 }}>
                {ev.jumlahGadai > 0 && <span>Pinjaman Awal: {formatRp(ev.jumlahGadai)}</span>}
                {ev.jumlahBaru > 0 && (st === 'TAMBAH' || st === 'KURANG') && (
                  <span>Pinjaman Baru: <b style={{ color: st === 'TAMBAH' ? 'var(--green)' : 'var(--red)' }}>{formatRp(ev.jumlahBaru)}</b></span>
                )}
                {ev.hariAktual > 0 && <span>Lama: {ev.hariAktual} hari</span>}
                {ev.ujrah > 0 && <span>Ujrah: {formatRp(ev.ujrah)}</span>}
                {ev.totalSistem > 0 && <span>Total Sistem: {formatRp(ev.totalSistem)}</span>}
                <span>Bayar: <b>{formatRp(ev.jumlahBayar)}</b></span>
                {ev.selisih !== 0 && <span style={{ color: ev.selisih > 0 ? 'var(--warn)' : 'var(--green)' }}>
                  {ev.selisih > 0 ? `Diskon: ${formatRp(ev.selisih)}` : `Lebih: ${formatRp(Math.abs(ev.selisih))}`}
                </span>}
                <span>Payment: {ev.payment}</span>
                <span>Kasir: {ev.kasir}</span>
              </div>
            </TimelineItem>
          );
        })}

        {/* Sita event if exists */}
        {sita && (
          <TimelineItem
            icon="🔒"
            status={`GUDANG SITA — ${sita.status}`}
            tgl={formatDate(sita.tglSita)}
            color="#ef4444"
            isLast
          >
            <div style={{ fontSize: 11 }}>
              <span>Status: <b>{sita.status}</b></span>
              {sita.taksiran > 0 && <span style={{ marginLeft: 16 }}>Taksiran: {formatRp(sita.taksiran)}</span>}
            </div>
          </TimelineItem>
        )}
      </div>
    </div>
  );
}

// ── Data row helper ──────────────────────────────────────────
function DataRow({ label, value, mono, bold, green }: {
  label: string; value: string; mono?: boolean; bold?: boolean; green?: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
      <span style={{ color: 'var(--text3)', minWidth: 100, flexShrink: 0 }}>{label}</span>
      <span style={{
        color: green ? 'var(--green)' : 'var(--text)',
        fontFamily: mono ? 'var(--mono)' : undefined,
        fontWeight: bold ? 600 : undefined,
      }}>
        {value || '—'}
      </span>
    </div>
  );
}

// ── Timeline item ────────────────────────────────────────────
function TimelineItem({ icon, status, tgl, color, isFirst, isLast, children }: {
  icon: string; status: string; tgl: string; color: string;
  isFirst?: boolean; isLast?: boolean; children: React.ReactNode;
}) {
  return (
    <div style={{ display: 'flex', gap: 12, position: 'relative' }}>
      {/* Timeline line */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 32, flexShrink: 0 }}>
        {!isFirst && <div style={{ width: 2, height: 8, background: 'var(--border)' }} />}
        <div style={{
          width: 28, height: 28, borderRadius: '50%', background: `${color}22`,
          border: `2px solid ${color}`, display: 'flex', alignItems: 'center',
          justifyContent: 'center', fontSize: 13, flexShrink: 0,
        }}>
          {icon}
        </div>
        {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--border)', minHeight: 20 }} />}
      </div>
      {/* Content */}
      <div style={{
        flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '10px 14px', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{
            background: `${color}22`, color, fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 4, textTransform: 'uppercase' as const,
          }}>
            {status}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{tgl}</span>
        </div>
        {children}
      </div>
    </div>
  );
}
