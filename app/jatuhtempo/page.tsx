'use client';

// ============================================================
// ACEH GADAI SYARIAH - Halaman Jatuh Tempo
// File: app/jatuhtempo/page.tsx
// List kontrak AKTIF: LEWAT WAKTU → JATUH TEMPO → BERJALAN
// Gadai diatas, SJB dibawah, sort by lama gadai (desc)
// Kolom: tgl sita, total bayar sistem, no hp, lama gadai
// ============================================================

import { useState, useCallback, useEffect } from 'react';
import AppShell from '@/components/ui/AppShell';
import { useOutletId } from '@/components/auth/AuthProvider';
import { formatRp, formatDate } from '@/lib/format';
import Link from 'next/link';

type JTStatus = 'LEWAT WAKTU' | 'JATUH TEMPO' | 'BERJALAN';

interface JTRow {
  id: string; no_faktur: string; nama: string; telp1: string; telp2: string;
  kategori: string; barang: string; taksiran: number; jumlah_gadai: number;
  ujrah_nominal: number; ujrah_persen: number;
  tgl_gadai: string; tgl_jt: string; tgl_sita: string;
  outlet: string; barcode_a: string;
  _source: string;
  // SJB specific
  harga_jual?: number; harga_buyback?: number; lama_titip?: number;
  // Computed
  _jtStatus: JTStatus; _sisaHari: number; _lamaHari: number;
  _totalBayar: number;
}

function calcJTStatus(tglJt: string): { status: JTStatus; sisa: number } {
  const jt = new Date(tglJt);
  const now = new Date();
  now.setHours(0, 0, 0, 0); jt.setHours(0, 0, 0, 0);
  const sisa = Math.floor((jt.getTime() - now.getTime()) / 86400000);
  if (sisa < 0) return { status: 'LEWAT WAKTU', sisa };
  if (sisa <= 3) return { status: 'JATUH TEMPO', sisa };
  return { status: 'BERJALAN', sisa };
}

// Hitung ujrah berjalan — cermin tebus/page.tsx
function hitungUjrah(r: any, lamaHari: number): number {
  const taksiran = Number(r.taksiran || 0);
  const jmlGadai = Number(r.jumlah_gadai || 0);
  const ujrahSheet = Number(r.ujrah_nominal || 0);
  const kat = String(r.kategori || '').toUpperCase();
  const emasFlag = ['EMAS', 'EMAS PAUN'].includes(kat);

  if (ujrahSheet > 0) {
    if (emasFlag) {
      return Math.ceil((ujrahSheet / 30) * lamaHari / 1000) * 1000;
    } else {
      const hDihitung = Math.ceil(lamaHari / 5) * 5;
      const per5 = Math.round(ujrahSheet / 6);
      return Math.ceil(per5 * (hDihitung / 5) / 1000) * 1000;
    }
  } else {
    if (emasFlag) {
      return Math.round((2.8 / 100 / 30) * taksiran * lamaHari);
    } else {
      const persen = jmlGadai <= 3000000 ? 8 : 7;
      const hDihitung = Math.ceil(lamaHari / 5) * 5;
      return Math.round((persen / 100 / 30) * 5 * taksiran * (hDihitung / 5));
    }
  }
}

function mapRow(r: any): JTRow {
  const { status, sisa } = calcJTStatus(r.tgl_jt);
  const now = new Date();
  const tgl1 = new Date(r.tgl_gadai);
  const lama = Math.max(1, Math.floor((now.getTime() - tgl1.getTime()) / 86400000));

  let totalBayar: number;
  if (r._source === 'SJB') {
    totalBayar = Number(r.harga_buyback || r.harga_jual || 0);
  } else {
    const ujrah = hitungUjrah(r, lama);
    totalBayar = Math.ceil((Number(r.jumlah_gadai || 0) + ujrah) / 1000) * 1000;
  }

  return { ...r, _jtStatus: status, _sisaHari: sisa, _lamaHari: lama, _totalBayar: totalBayar };
}

// ── Print: Semua kontrak jatuh tempo (gadai di atas, SJB di bawah) ──
function printJatuhTempo(gadai: JTRow[], sjb: JTRow[], outletLabel: string) {
  const R = (v: number) => 'Rp ' + (v || 0).toLocaleString('id-ID');
  const fD = (d: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—';
  const tgl = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  function rows(list: JTRow[]) {
    if (list.length === 0) return '<tr><td colspan="12" style="padding:12px;text-align:center;color:#888">Tidak ada</td></tr>';
    return list.map((r, i) => {
      const statColor = r._jtStatus === 'LEWAT WAKTU' ? '#dc2626' : r._jtStatus === 'JATUH TEMPO' ? '#d97706' : '#15803d';
      const sisaText = r._sisaHari < 0 ? `${Math.abs(r._sisaHari)} hr lewat` : r._sisaHari === 0 ? 'HARI INI' : `${r._sisaHari} hari`;
      return `<tr style="border-bottom:1px solid #ddd">
        <td>${i + 1}</td>
        <td style="font-family:monospace">${r.no_faktur}</td>
        <td>${r.nama}</td>
        <td style="font-size:9px">${r.telp1 || '—'}${r.telp2 ? '<br>' + r.telp2 : ''}</td>
        <td>${r.barang}</td>
        <td class="num">${R(r.jumlah_gadai)}</td>
        <td class="num" style="font-weight:bold">${R(r._totalBayar)}</td>
        <td style="text-align:center">${r._lamaHari} hr</td>
        <td>${fD(r.tgl_jt)}</td>
        <td>${fD(r.tgl_sita)}</td>
        <td class="num" style="color:${statColor};font-weight:bold">${sisaText}</td>
        <td style="font-size:9px;font-weight:bold;color:${statColor}">${r._jtStatus}</td>
      </tr>`;
    }).join('');
  }

  const thRow = `<tr style="background:#f0f0f0">
    <th>No</th><th>No Faktur</th><th>Nama</th><th>No HP</th><th>Barang</th>
    <th class="num">Pinjaman</th><th class="num">Total Bayar</th><th>Lama</th>
    <th>Tgl JT</th><th>Tgl Sita</th><th class="num">Sisa/Lewat</th><th>Status</th>
  </tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Jatuh Tempo ${new Date().toLocaleDateString('sv-SE')}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      @page{size:A4 landscape;margin:10mm}
      body{font-family:Arial,sans-serif;font-size:10px;padding:8mm}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{padding:4px 6px;border:1px solid #ccc;text-align:left;vertical-align:top}
      th{font-weight:bold;font-size:9px}
      .num{text-align:right}
      h2{margin-bottom:4px;font-size:14px}
      h3{margin:12px 0 4px;font-size:11px;border-bottom:2px solid #2563eb;padding-bottom:3px;color:#2563eb}
      h3.sjb{border-color:#d97706;color:#d97706}
      .noprint{margin-bottom:8px}
      @media print{.noprint{display:none}}
    </style></head><body>
    <div class="noprint">
      <button onclick="window.print()" style="padding:5px 14px;margin-right:6px">Print / Simpan PDF</button>
      <button onclick="window.close()">Tutup</button>
    </div>
    <h2>DAFTAR JATUH TEMPO — ${outletLabel}</h2>
    <p style="margin-bottom:10px;color:#555">${tgl} &mdash; Total: ${gadai.length + sjb.length} kontrak (Gadai: ${gadai.length}, SJB: ${sjb.length})</p>

    <h3>GADAI (${gadai.length})</h3>
    <table>${thRow}<tbody>${rows(gadai)}</tbody></table>

    <h3 class="sjb">JUAL TITIP / SJB (${sjb.length})</h3>
    <table>${thRow}<tbody>${rows(sjb)}</tbody></table>

    <p style="margin-top:16px;font-size:9px;color:#888">Dicetak: ${new Date().toLocaleString('id-ID')}</p>
  </body></html>`;

  const win = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes');
  if (!win) { alert('Izinkan popup untuk mencetak.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

// ── CSV helpers ─────────────────────────────────────────
function fmtTglDDMMYYYY(s: string): string {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Ex: 200426_1053
function csvStampSuffix(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(2);
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${dd}${mm}${yy}_${HH}${MM}`;
}

// Escape field untuk CSV: quoted + escape internal quote jadi "".
function csvQ(v: string | null | undefined): string {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

// Field telepon dgn trick Excel text-format: '"<digits>"
function csvPhone(v: string | null | undefined): string {
  const digits = String(v ?? '').replace(/"/g, '');
  return `'"${digits}"`;
}

function downloadCSV(filename: string, content: string) {
  // UTF-8 BOM supaya Excel baca Unicode dgn benar
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function buildCsvGadai(rows: JTRow[]): string {
  const header = 'No,No Faktur,Nama,Tgl Gadai,Lama Gadai,Taksiran,Jumlah Pinjaman,Total Gadai,Kategori,Barang,Telpon 1,Telpon 2,Outlet';
  const lines = rows.map((r, i) => {
    const no          = i + 1;
    const noFaktur    = csvQ(r.no_faktur);
    const nama        = csvQ(r.nama);
    const tglGadai    = fmtTglDDMMYYYY(r.tgl_gadai);
    const lama        = r._lamaHari;
    const taksiran    = Number(r.taksiran || 0);
    const pinjaman    = Number(r.jumlah_gadai || 0);
    const totalGadai  = Number(r._totalBayar || 0);
    const kategori    = csvQ(r.kategori);
    const barang      = csvQ(r.barang);
    const telp1       = csvPhone(r.telp1);
    const telp2       = csvPhone(r.telp2);
    const outlet      = csvQ(r.outlet);
    return `${no},${noFaktur},${nama},${tglGadai},${lama},${taksiran},${pinjaman},${totalGadai},${kategori},${barang},${telp1},${telp2},${outlet}`;
  });
  return [header, ...lines, ''].join('\r\n');
}

function buildCsvSjb(rows: JTRow[]): string {
  const header = 'No,No Faktur,Nama,Tgl Jual,Lama Waktu,Jatuh Tempo,Harga Jual,Harga Buyback,Kategori,Barang,No HP,Outlet';
  const lines = rows.map((r, i) => {
    const no           = i + 1;
    const noFaktur     = csvQ(r.no_faktur);
    const nama         = csvQ(r.nama);
    const tglJual      = fmtTglDDMMYYYY(r.tgl_gadai);
    const lamaWaktu    = Number(r.lama_titip || 0);
    const jatuhTempo   = fmtTglDDMMYYYY(r.tgl_jt);
    const hargaJual    = Number(r.harga_jual || 0);
    const hargaBuyback = Number(r.harga_buyback || 0);
    const kategori     = csvQ(r.kategori);
    const barang       = csvQ(r.barang);
    const noHp         = csvPhone(r.telp1);
    const outlet       = csvQ(r.outlet);
    return `${no},${noFaktur},${nama},${tglJual},${lamaWaktu},${jatuhTempo},${hargaJual},${hargaBuyback},${kategori},${barang},${noHp},${outlet}`;
  });
  return [header, ...lines, ''].join('\r\n');
}

// ── Print: hanya data LEWAT WAKTU ─────────────────────────────
function printLewatWaktu(gadai: JTRow[], sjb: JTRow[]) {
  const R = (v: number) => 'Rp ' + (v || 0).toLocaleString('id-ID');
  const fD = (d: string) => d ? new Date(d).toLocaleDateString('id-ID') : '—';
  const tgl = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  const lwGadai = gadai.filter(r => r._jtStatus === 'LEWAT WAKTU');
  const lwSjb = sjb.filter(r => r._jtStatus === 'LEWAT WAKTU');

  function rows(list: JTRow[]) {
    if (list.length === 0) return '<tr><td colspan="11" style="padding:12px;text-align:center;color:#888">Tidak ada</td></tr>';
    return list.map((r, i) =>
      `<tr style="border-bottom:1px solid #ddd">
        <td>${i + 1}</td>
        <td style="font-family:monospace">${r.no_faktur}</td>
        <td>${r.nama}</td>
        <td style="font-size:9px">${r.telp1 || '—'}${r.telp2 ? '<br>' + r.telp2 : ''}</td>
        <td>${r.barang}</td>
        <td class="num">${R(r.jumlah_gadai)}</td>
        <td class="num" style="font-weight:bold">${R(r._totalBayar)}</td>
        <td style="text-align:center">${r._lamaHari} hr</td>
        <td>${fD(r.tgl_jt)}</td>
        <td>${fD(r.tgl_sita)}</td>
        <td class="num" style="color:red;font-weight:bold">${Math.abs(r._sisaHari)} hr lewat</td>
      </tr>`
    ).join('');
  }

  const thRow = `<tr style="background:#f0f0f0">
    <th>No</th><th>No Faktur</th><th>Nama</th><th>No HP</th><th>Barang</th>
    <th class="num">Pinjaman</th><th class="num">Total Bayar</th><th>Lama</th>
    <th>Tgl JT</th><th>Tgl Sita</th><th class="num">Lewat</th>
  </tr>`;

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Lewat Waktu ${new Date().toLocaleDateString('sv-SE')}</title>
    <style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{font-family:Arial,sans-serif;font-size:10px;padding:10mm}
      table{width:100%;border-collapse:collapse;margin-bottom:12px}
      th,td{padding:4px 6px;border:1px solid #ccc;text-align:left;vertical-align:top}
      th{font-weight:bold;font-size:9px}
      .num{text-align:right}
      h2{margin-bottom:4px;font-size:14px}
      h3{margin:12px 0 4px;font-size:11px;border-bottom:2px solid #dc2626;padding-bottom:3px;color:#dc2626}
      .noprint{margin-bottom:8px}
      @media print{.noprint{display:none}}
    </style></head><body>
    <div class="noprint">
      <button onclick="window.print()" style="padding:5px 14px;margin-right:6px">Print</button>
      <button onclick="window.close()">Tutup</button>
    </div>
    <h2>DAFTAR KONTRAK LEWAT WAKTU</h2>
    <p style="margin-bottom:10px;color:#555">${tgl} &mdash; Total: ${lwGadai.length + lwSjb.length} kontrak (Gadai: ${lwGadai.length}, SJB: ${lwSjb.length})</p>

    <h3>GADAI (${lwGadai.length})</h3>
    <table>${thRow}<tbody>${rows(lwGadai)}</tbody></table>

    <h3>JUAL TITIP / SJB (${lwSjb.length})</h3>
    <table>${thRow}<tbody>${rows(lwSjb)}</tbody></table>

    <p style="margin-top:16px;font-size:9px;color:#888">Dicetak: ${new Date().toLocaleString('id-ID')}</p>
  </body></html>`;

  const win = window.open('', '_blank', 'width=1000,height=800,scrollbars=yes');
  if (!win) { alert('Izinkan popup untuk mencetak.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

export default function JatuhTempoPage() {
  const outletId = useOutletId();
  const [gadaiRows, setGadaiRows] = useState<JTRow[]>([]);
  const [sjbRows, setSjbRows] = useState<JTRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'ALL' | JTStatus>('ALL');
  const [search, setSearch] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/gadai/jatuh-tempo?outletId=${outletId}`);
      const json = await res.json();
      if (json.ok) {
        const g = (json.gadai || []).map(mapRow);
        const s = (json.sjb || []).map(mapRow);
        // Sort by lama gadai descending (longest first)
        g.sort((a: JTRow, b: JTRow) => b._lamaHari - a._lamaHari);
        s.sort((a: JTRow, b: JTRow) => b._lamaHari - a._lamaHari);
        setGadaiRows(g);
        setSjbRows(s);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [outletId]);

  useEffect(() => { loadData(); }, [loadData]);

  const allRows = [...gadaiRows, ...sjbRows];
  const cntLewat = allRows.filter(r => r._jtStatus === 'LEWAT WAKTU').length;
  const cntJT = allRows.filter(r => r._jtStatus === 'JATUH TEMPO').length;
  const cntBerjalan = allRows.filter(r => r._jtStatus === 'BERJALAN').length;

  // Filter function
  function applyFilter(rows: JTRow[]): JTRow[] {
    return rows.filter(r => {
      if (filter !== 'ALL' && r._jtStatus !== filter) return false;
      if (search) {
        const s = search.toLowerCase();
        return r.no_faktur.toLowerCase().includes(s) || r.nama.toLowerCase().includes(s) || r.barang.toLowerCase().includes(s) || (r.telp1 || '').includes(s);
      }
      return true;
    });
  }

  const filteredGadai = applyFilter(gadaiRows);
  const filteredSjb = applyFilter(sjbRows);

  // Outlet label untuk filename/judul PDF. Prefer outlet dari baris data; fallback "Outlet {id}".
  const outletLabel = (gadaiRows[0]?.outlet || sjbRows[0]?.outlet || `Outlet ${outletId}`).trim();

  const handlePrintJT = () => printJatuhTempo(filteredGadai, filteredSjb, outletLabel);

  const handleCsvGadai = () => {
    if (filteredGadai.length === 0) { alert('Tidak ada data gadai (sesuai filter) untuk di-export.'); return; }
    const fn = `Data Jatuh Tempo Gadai ${outletLabel} Per ${csvStampSuffix()}.csv`;
    downloadCSV(fn, buildCsvGadai(filteredGadai));
  };

  const handleCsvSjb = () => {
    if (filteredSjb.length === 0) { alert('Tidak ada data SJB (sesuai filter) untuk di-export.'); return; }
    const fn = `Data Jatuh Tempo Jualtitip ${outletLabel} Per ${csvStampSuffix()}.csv`;
    downloadCSV(fn, buildCsvSjb(filteredSjb));
  };

  // Table header style
  const th: React.CSSProperties = { padding: '8px 10px', textAlign: 'left', fontSize: 10, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' };
  const thR: React.CSSProperties = { ...th, textAlign: 'right' };

  function renderRow(r: JTRow, i: number) {
    const isSJB = r._source === 'SJB';
    return (
      <tr key={r.id} style={{
        borderBottom: '1px solid rgba(46,51,73,.5)',
        background: r._jtStatus === 'LEWAT WAKTU' ? 'rgba(239,68,68,.04)' : r._jtStatus === 'JATUH TEMPO' ? 'rgba(245,158,11,.03)' : 'transparent',
      }}>
        <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text3)' }}>{i + 1}</td>
        <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 11 }}>
          <Link href={`/tebus?barcode=${r.barcode_a || r.no_faktur}`} style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            {r.no_faktur}
          </Link>
        </td>
        <td style={{ padding: '7px 10px', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.nama}</td>
        <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--text2)' }}>
          {r.telp1 || '—'}
          {r.telp2 ? <span style={{ color: 'var(--text3)', fontSize: 10 }}><br />{r.telp2}</span> : null}
        </td>
        <td style={{ padding: '7px 10px', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{r.barang}</td>
        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11 }}>{formatRp(r.jumlah_gadai)}</td>
        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, color: 'var(--green)' }}>
          {formatRp(r._totalBayar)}
        </td>
        <td style={{ padding: '7px 10px', textAlign: 'center', fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 700 }}>{r._lamaHari} hr</td>
        <td style={{ padding: '7px 10px', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--text3)' }}>{r.tgl_sita ? formatDate(r.tgl_sita) : '—'}</td>
        <td style={{ padding: '7px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 700, fontSize: 11, color: r._jtStatus === 'LEWAT WAKTU' ? 'var(--red)' : r._jtStatus === 'JATUH TEMPO' ? 'var(--warn)' : 'var(--green)' }}>
          {r._sisaHari < 0 ? `${Math.abs(r._sisaHari)} hr lewat` : r._sisaHari === 0 ? 'HARI INI' : `${r._sisaHari} hari`}
        </td>
        <td style={{ padding: '7px 10px' }}>
          <span style={{
            display: 'inline-block', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
            background: r._jtStatus === 'LEWAT WAKTU' ? 'rgba(239,68,68,.15)' : r._jtStatus === 'JATUH TEMPO' ? 'rgba(245,158,11,.15)' : 'rgba(16,185,129,.12)',
            color: r._jtStatus === 'LEWAT WAKTU' ? 'var(--red)' : r._jtStatus === 'JATUH TEMPO' ? 'var(--warn)' : 'var(--green)',
          }}>{r._jtStatus}</span>
        </td>
      </tr>
    );
  }

  const tableHead = (
    <tr style={{ background: 'var(--surface2)' }}>
      <th style={th}>No</th>
      <th style={th}>No Faktur</th>
      <th style={th}>Nama</th>
      <th style={th}>No HP</th>
      <th style={th}>Barang</th>
      <th style={thR}>Pinjaman</th>
      <th style={thR}>Total Bayar</th>
      <th style={{ ...th, textAlign: 'center' }}>Lama</th>
      <th style={th}>Tgl JT</th>
      <th style={th}>Tgl Sita</th>
      <th style={thR}>Sisa/Lewat</th>
      <th style={th}>Status</th>
    </tr>
  );

  return (
    <AppShell title="Jatuh Tempo" subtitle="Kontrak AKTIF — urutkan berdasarkan lama gadai">
      <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Toolbar */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari nama / no faktur / barang / no hp..."
            style={{ width: 300, padding: '7px 12px', fontSize: 12 }} />
          <button className="btn btn-outline btn-sm" onClick={loadData}>Refresh</button>
          {cntLewat > 0 && (
            <button className="btn btn-danger btn-sm" onClick={() => printLewatWaktu(gadaiRows, sjbRows)}>
              Cetak Lewat Waktu ({cntLewat})
            </button>
          )}
          <button className="btn btn-primary btn-sm" onClick={handlePrintJT}
            disabled={loading || (filteredGadai.length + filteredSjb.length) === 0}>
            🖨️ Cetak PDF ({filteredGadai.length + filteredSjb.length})
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleCsvGadai}
            disabled={loading || filteredGadai.length === 0}>
            ⬇️ CSV Gadai ({filteredGadai.length})
          </button>
          <button className="btn btn-outline btn-sm" onClick={handleCsvSjb}
            disabled={loading || filteredSjb.length === 0}>
            ⬇️ CSV SJB ({filteredSjb.length})
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--red)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Lewat Waktu</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--red)' }}>{loading ? '—' : cntLewat}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--warn)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Jatuh Tempo ≤3 hr</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--warn)' }}>{loading ? '—' : cntJT}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--green)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Berjalan</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)', color: 'var(--green)' }}>{loading ? '—' : cntBerjalan}</div>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--accent)', borderRadius: 10, padding: '11px 16px', flex: 1, minWidth: 130 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 4 }}>Total Aktif</div>
            <div style={{ fontSize: 22, fontWeight: 700, fontFamily: 'var(--mono)' }}>{loading ? '—' : allRows.length}</div>
            <div style={{ fontSize: 10, color: 'var(--text3)' }}>Gadai: {gadaiRows.length} | SJB: {sjbRows.length}</div>
          </div>
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { val: 'ALL', label: 'Semua' },
            { val: 'LEWAT WAKTU', label: 'Lewat Waktu' },
            { val: 'JATUH TEMPO', label: 'Jatuh Tempo' },
            { val: 'BERJALAN', label: 'Berjalan' },
          ].map(p => (
            <button key={p.val} onClick={() => setFilter(p.val as any)}
              style={{
                padding: '4px 13px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${filter === p.val ? 'var(--accent)' : 'var(--border)'}`,
                background: filter === p.val ? (p.val === 'LEWAT WAKTU' ? 'var(--red)' : p.val === 'JATUH TEMPO' ? 'var(--warn)' : p.val === 'BERJALAN' ? 'var(--green)' : 'var(--accent)') : 'transparent',
                color: filter === p.val ? (p.val === 'JATUH TEMPO' || p.val === 'BERJALAN' ? '#000' : '#fff') : 'var(--text2)',
              }}>
              {p.label}
            </button>
          ))}
        </div>

        {/* ═══ GADAI SECTION ═══ */}
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>GADAI</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{filteredGadai.length} kontrak</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>{tableHead}</thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Memuat...</td></tr>
              ) : filteredGadai.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Tidak ada gadai aktif</td></tr>
              ) : filteredGadai.map((r, i) => renderRow(r, i))}
            </tbody>
          </table>
        </div>

        {/* ═══ SJB SECTION ═══ */}
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div style={{ padding: '8px 14px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)' }}>JUAL TITIP (SJB)</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--mono)' }}>{filteredSjb.length} kontrak</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>{tableHead}</thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text3)' }}>Memuat...</td></tr>
              ) : filteredSjb.length === 0 ? (
                <tr><td colSpan={12} style={{ padding: 20, textAlign: 'center', color: 'var(--text3)', fontSize: 11 }}>Tidak ada SJB aktif</td></tr>
              ) : filteredSjb.map((r, i) => renderRow(r, i))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
    