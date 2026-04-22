// ============================================================
// ACEH GADAI SYARIAH - PDF Builder Laporan Malam (pdfkit)
// File: lib/laporan/buildLaporanPdf.ts
//
// Generate Buffer PDF dari hasil getLaporanMalam + computeLaporanExtras.
// Layout meniru tampilan cetak HTML di lib/print.ts (printLaporanMalam):
//
//   1. Header (judul + tgl)
//   2. Rekap Keluar/Masuk (8 cards)
//   3. Rekap Laba (5 cards)
//   4. Banner Total Laba
//   5. Summary 3 cards (Total Keluar / Masuk / Laba)
//   6. Saldo Cash / Bank
//   7. Tabel Gadai Baru
//   8. Tabel Tebus / Tambah / Kurang
//   9. Tabel Perpanjang
//  10. Tabel Jual / Sita
//  11. Footer timestamp
//
// Dipakai HANYA oleh /api/laporan/nightly-send (cron Vercel jam 01:00 WIB).
// Halaman /laporan & tombol cetak di browser TIDAK terpengaruh.
// ============================================================

import PDFDocument from 'pdfkit';
import type { LaporanMalamResult, LaporanExtras } from './getLaporanMalam';
import { hitungLaba } from './getLaporanMalam';

// ── Format Rupiah ──
function fmtRp(v: number | string): string {
  return 'Rp ' + (parseFloat(String(v ?? 0)) || 0).toLocaleString('id-ID');
}

// ── Page (landscape A4 supaya tabel 15-kolom muat) ──
const PAGE_W = 842;   // landscape A4 width in points
const PAGE_H = 595;
const MARGIN = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;

interface CardSpec { label: string; value: string; color?: string; sub?: string; }

export async function buildLaporanMalamPdf(
  d: LaporanMalamResult,
  ex: LaporanExtras,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: MARGIN,
        info: {
          Title: `Laporan Malam ${d.outlet.nama} ${d.tgl}`,
          Author: 'Aceh Gadai Syariah',
          Subject: `Laporan harian outlet ${d.outlet.nama}`,
          CreationDate: new Date(),
        },
      });

      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const tglDate = new Date(d.tgl + 'T00:00:00');
      const tglFmt = tglDate.toLocaleDateString('id-ID', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
      });

      // ── 1. HEADER ──
      doc.fillColor('#000').fontSize(16).font('Helvetica-Bold')
        .text(`LAPORAN HARIAN — ${d.outlet.nama.toUpperCase()}`, MARGIN, MARGIN);
      doc.fillColor('#555').fontSize(9).font('Helvetica')
        .text(tglFmt, MARGIN, doc.y + 2);

      doc.moveDown(0.6);

      // ── 2. REKAP KELUAR/MASUK (8 cards in row) ──
      const rk = d.rekap;
      const cardsRow1: CardSpec[] = [
        { label: 'Gadai Keluar',     value: fmtRp(rk.gadaiKeluar),     color: '#dc2626', sub: `${d.gadaiList.length} trx gadai` },
        { label: 'Akad SJB Keluar',  value: fmtRp(rk.sjbKeluar),       color: '#d97706', sub: `${d.sjbList.length} akad SJB` },
        { label: 'Total Keluar',     value: fmtRp(rk.totalKeluar),     color: '#dc2626', sub: 'Gadai + SJB' },
        { label: 'Tebus Masuk',      value: fmtRp(rk.tebusMasuk),      color: '#16a34a' },
        { label: 'Buyback Masuk',    value: fmtRp(ex.buybackMasuk),    color: '#0891b2' },
        { label: 'Perpanjang',       value: fmtRp(rk.perpanjangMasuk), color: '#6366f1' },
        { label: 'Jual Barang',      value: fmtRp(ex.jualMasuk),       color: '#dc2626' },
        { label: 'Total Masuk',      value: fmtRp(ex.totalMasukAll),   color: '#15803d' },
      ];
      drawCardsRow(doc, cardsRow1, doc.y);

      // ── 3. REKAP LABA (5 cards) ──
      const cardsRow2: CardSpec[] = [
        { label: 'Laba Tebus',      value: fmtRp(ex.labaTebus), color: '#16a34a' },
        { label: 'Laba Buyback',    value: fmtRp(ex.labaBB),    color: '#0891b2' },
        { label: 'Laba Perpanjang', value: fmtRp(ex.labaPjg),   color: '#6366f1' },
        { label: 'Laba Jual',       value: fmtRp(ex.labaJual),  color: '#d97706' },
        { label: 'Laba Sita/T/K',   value: fmtRp(ex.labaSita + ex.labaTK), color: '#000' },
      ];
      drawCardsRow(doc, cardsRow2, doc.y + 6);

      // ── 4. BANNER TOTAL LABA ──
      const labaY = doc.y + 6;
      const labaH = 24;
      doc.save()
        .roundedRect(MARGIN, labaY, CONTENT_W, labaH, 4)
        .fillAndStroke('#e6f7ee', '#22c55e').restore();
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(10)
        .text('TOTAL LABA HARI INI', MARGIN + 10, labaY + 7);
      doc.fillColor(ex.labaTotal >= 0 ? '#16a34a' : '#dc2626').fontSize(13)
        .text(fmtRp(ex.labaTotal), MARGIN, labaY + 6, { width: CONTENT_W - 10, align: 'right' });

      // ── 5. SUMMARY 3 cards (Total Keluar / Masuk / Laba) ──
      doc.y = labaY + labaH + 4;
      const sumY = doc.y;
      const sumH = 38;
      doc.save()
        .roundedRect(MARGIN, sumY, CONTENT_W, sumH, 5)
        .fillAndStroke('#f0fdf4', '#22c55e').restore();
      const colW = CONTENT_W / 3;
      drawSummaryCol(doc, MARGIN, sumY, colW, 'TOTAL KELUAR', fmtRp(rk.totalKeluar), '#dc2626', 'Gadai + SJB');
      drawSummaryCol(doc, MARGIN + colW, sumY, colW, 'TOTAL MASUK', fmtRp(ex.totalMasukAll), '#16a34a', 'Tebus + BB + Pjg + Jual', true);
      drawSummaryCol(doc, MARGIN + colW * 2, sumY, colW, 'TOTAL LABA', fmtRp(ex.labaTotal), ex.labaTotal >= 0 ? '#16a34a' : '#dc2626', '');

      // ── 6. SALDO ──
      doc.y = sumY + sumH + 6;
      const saldoCards: CardSpec[] = [
        { label: 'Saldo Cash', value: fmtRp(d.saldo.cash), color: '#000' },
        { label: 'Saldo Bank', value: fmtRp(d.saldo.bank), color: '#1d4ed8' },
      ];
      drawCardsRow(doc, saldoCards, doc.y);

      // ── 7. TABEL GADAI BARU ──
      const gadaiRows = [
        ...d.gadaiList.map((r: any) => ({ ...r, _isSJB: false })),
        ...d.sjbList.map((r: any)   => ({ ...r, _isSJB: true })),
      ];
      drawSection(doc, `Gadai Baru (${gadaiRows.length} transaksi)`);
      drawGadaiTable(doc, gadaiRows);

      // ── 8. TABEL TEBUS/TAMBAH/KURANG ──
      drawSection(doc, `Tebus / Tambah / Kurang (${ex.tebusOnly.length} transaksi)`);
      drawTebusTable(doc, ex.tebusOnly, true);

      // ── 9. TABEL PERPANJANG ──
      drawSection(doc, `Perpanjang (${ex.perpanjangList.length} transaksi)`);
      drawTebusTable(doc, ex.perpanjangList, false);

      // ── 10. TABEL JUAL/SITA ──
      drawSection(doc, `Jual / Sita (${ex.jualSitaList.length} transaksi)`);
      drawTebusTable(doc, ex.jualSitaList, false);

      // ── 11. FOOTER ──
      doc.moveDown(0.5);
      ensureSpace(doc, 14);
      doc.fillColor('#888').font('Helvetica').fontSize(8)
        .text(`Dicetak otomatis: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`, MARGIN, doc.y);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// ── DRAW HELPERS ───────────────────────────────────────────────

function drawCardsRow(doc: PDFKit.PDFDocument, cards: CardSpec[], y: number) {
  const gap = 4;
  const w = (CONTENT_W - gap * (cards.length - 1)) / cards.length;
  const h = 32;
  cards.forEach((c, i) => {
    const x = MARGIN + (w + gap) * i;
    doc.save()
      .roundedRect(x, y, w, h, 3)
      .fillAndStroke('#fff', '#cccccc').restore();
    doc.fillColor('#666').font('Helvetica').fontSize(7)
      .text(c.label, x + 5, y + 4, { width: w - 10 });
    doc.fillColor(c.color ?? '#000').font('Helvetica-Bold').fontSize(9)
      .text(c.value, x + 5, y + 14, { width: w - 10 });
    if (c.sub) {
      doc.fillColor('#666').font('Helvetica').fontSize(6)
        .text(c.sub, x + 5, y + 25, { width: w - 10 });
    }
  });
  doc.y = y + h;
}

function drawSummaryCol(
  doc: PDFKit.PDFDocument, x: number, y: number, w: number,
  lbl: string, val: string, color: string, sub: string, hasBorder = false,
) {
  if (hasBorder) {
    doc.save().lineWidth(0.5).strokeColor('#22c55e')
      .moveTo(x, y + 4).lineTo(x, y + 34).stroke()
      .moveTo(x + w, y + 4).lineTo(x + w, y + 34).stroke().restore();
  }
  doc.fillColor('#666').font('Helvetica-Bold').fontSize(7)
    .text(lbl, x, y + 4, { width: w, align: 'center' });
  doc.fillColor(color).font('Helvetica-Bold').fontSize(13)
    .text(val, x, y + 14, { width: w, align: 'center' });
  if (sub) {
    doc.fillColor('#666').font('Helvetica').fontSize(6)
      .text(sub, x, y + 30, { width: w, align: 'center' });
  }
}

function drawSection(doc: PDFKit.PDFDocument, title: string) {
  doc.moveDown(0.5);
  ensureSpace(doc, 18);
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(11)
    .text(title, MARGIN, doc.y);
  doc.moveDown(0.2);
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number) {
  if (doc.y + needed > PAGE_H - MARGIN) {
    doc.addPage();
  }
}

// ── TABEL GADAI BARU (8 kolom) ──
function drawGadaiTable(doc: PDFKit.PDFDocument, rows: any[]) {
  const cols = [
    { label: 'No',            w: 22,  align: 'center' as const },
    { label: 'No Faktur',     w: 90,  align: 'left'   as const },
    { label: 'Kategori',      w: 70,  align: 'left'   as const },
    { label: 'Barang',        w: 200, align: 'left'   as const },
    { label: 'Taksiran',      w: 80,  align: 'right'  as const },
    { label: 'Total Gadai',   w: 90,  align: 'right'  as const },
    { label: 'Ket',           w: 80,  align: 'left'   as const },
    { label: 'Bayar',         w: 56,  align: 'left'   as const },
  ];
  drawTableHeader(doc, cols);
  if (rows.length === 0) {
    drawEmptyRow(doc, cols);
    return;
  }
  rows.forEach((r, i) => {
    const cells = [
      String(i + 1),
      String(r.no_faktur ?? '—') + (r._isSJB ? ' [SJB]' : ''),
      String(r.kategori ?? '—'),
      String(r.barang ?? '—'),
      fmtRp(r.taksiran ?? r.harga_jual ?? 0),
      fmtRp(r.jumlah_gadai ?? r.harga_jual ?? 0),
      String(r._ket ?? (r._isSJB ? 'SJB' : 'GADAI')),
      String(r.payment ?? 'CASH'),
    ];
    drawTableRow(doc, cols, cells, undefined, [
      undefined, undefined, undefined, undefined, undefined,
      '#dc2626', // total gadai red
      undefined, undefined,
    ]);
  });
}

// ── TABEL TEBUS (15 kolom) ──
function drawTebusTable(doc: PDFKit.PDFDocument, rows: any[], showAnom: boolean) {
  const cols = [
    { label: 'No',         w: 18,  align: 'center' as const },
    { label: 'Tgl Gadai',  w: 50,  align: 'left'   as const },
    { label: 'Tgl Tebus',  w: 50,  align: 'left'   as const },
    { label: 'No Faktur',  w: 80,  align: 'left'   as const },
    { label: 'Lama',       w: 30,  align: 'right'  as const },
    { label: 'Nama',       w: 75,  align: 'left'   as const },
    { label: 'Kategori',   w: 50,  align: 'left'   as const },
    { label: 'Taksiran',   w: 55,  align: 'right'  as const },
    { label: 'Pinjaman',   w: 55,  align: 'right'  as const },
    { label: 'Tot Sistem', w: 55,  align: 'right'  as const },
    { label: 'Jml Bayar',  w: 55,  align: 'right'  as const },
    { label: 'Jml Tebus',  w: 55,  align: 'right'  as const },
    { label: 'Bayar',      w: 35,  align: 'left'   as const },
    { label: 'Catatan',    w: 90,  align: 'left'   as const },
    { label: 'Laba',       w: 35,  align: 'right'  as const },
  ];
  drawTableHeader(doc, cols);
  if (rows.length === 0) {
    drawEmptyRow(doc, cols);
    return;
  }
  rows.forEach((r: any, i: number) => {
    const jb  = Number(r.jumlah_bayar || 0);
    const pi  = Number(r.jumlah_gadai || r.harga_jual || 0);
    const gb  = Number(r.jumlah_gadai_baru || r.harga_jual_baru || 0);
    const uj  = Number(r.ujrah_berjalan || 0);
    const tak = Number(r.taksiran || 0);
    const tot = Number(r.total_tebus_sistem || r.total_sistem || 0);
    const sel = Number(r.selisih || 0);
    const hr  = Number(r.hari_aktual || 0);
    const st  = String(r.status ?? '').toUpperCase();
    const nama = String(r.nama_nasabah ?? r.nama ?? '');
    const nf   = String(r.no_faktur ?? '');
    const pay  = String(r.payment ?? 'CASH');
    const cat  = String(r.alasan ?? '');
    const tanpaSrt = r.tanpa_surat ? String(r.tanpa_surat).includes('TANPA_SURAT') : false;
    const idDiskon = r.id_diskon ? String(r.id_diskon) : '';
    const laba = hitungLaba(st, jb, pi, uj, gb);

    const anoms: string[] = [];
    if (sel > 1000) anoms.push('DISKON' + (idDiskon ? ` [${idDiskon}]` : ''));
    if (tanpaSrt)   anoms.push('TANPA BARCODE');
    const catStr = anoms.length
      ? anoms.join(' | ') + (cat ? ' — ' + cat : '')
      : (cat || '—');
    const isAnom = showAnom && anoms.length > 0;

    let jt2: number;
    if      (st === 'TAMBAH')  jt2 = gb > 0 ? (gb - jb) : jb;
    else if (st === 'KURANG')  jt2 = gb > 0 ? (jb + gb) : jb;
    else if (st === 'SITA')    jt2 = tak;
    else                       jt2 = jb;

    const tglGadai = r.tgl_gadai ? new Date(r.tgl_gadai).toLocaleDateString('id-ID') : '—';
    const tglTebus = r.tgl       ? new Date(r.tgl).toLocaleDateString('id-ID')       : '—';
    const isTK = ['TAMBAH', 'KURANG', 'SITA'].includes(st);
    const namaCell = nama
      + (r._isBuyback ? ' [SJB]' : '')
      + (showAnom && st && !['TEBUS', 'PERPANJANG'].includes(st) ? ` [${st}]` : '');

    const cells = [
      String(i + 1),
      tglGadai,
      tglTebus,
      nf,
      hr > 0 ? `${hr} hr` : '—',
      namaCell,
      String(r.kategori ?? ''),
      fmtRp(tak),
      fmtRp(pi),
      fmtRp(tot),
      fmtRp(jb),
      fmtRp(jt2),
      pay,
      catStr,
      fmtRp(laba),
    ];
    const colors = [
      undefined, undefined, undefined, undefined, undefined,
      undefined, undefined, undefined, undefined, '#666',
      '#000', isTK ? '#2563eb' : '#000',
      undefined, undefined,
      laba > 0 ? '#16a34a' : (laba < 0 ? '#dc2626' : '#666'),
    ];
    drawTableRow(doc, cols, cells, isAnom ? '#fff3cd' : undefined, colors);
  });
}

// ── TABLE PRIMITIVES ──
type Col = { label: string; w: number; align: 'left' | 'center' | 'right' };

function drawTableHeader(doc: PDFKit.PDFDocument, cols: Col[]) {
  ensureSpace(doc, 18);
  const y = doc.y;
  const h = 14;
  let x = MARGIN;
  doc.save().rect(MARGIN, y, sumWidths(cols), h).fillAndStroke('#f0f0f0', '#ccc').restore();
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(7);
  cols.forEach(c => {
    doc.text(c.label, x + 3, y + 4, { width: c.w - 6, align: c.align, lineBreak: false });
    x += c.w;
  });
  doc.y = y + h;
}

function drawTableRow(
  doc: PDFKit.PDFDocument, cols: Col[], cells: string[],
  bgColor?: string, cellColors?: (string | undefined)[],
) {
  // Compute row height based on tallest cell
  doc.font('Helvetica').fontSize(7);
  let rowH = 12;
  cols.forEach((c, i) => {
    const txt = cells[i] ?? '';
    const h = doc.heightOfString(txt, { width: c.w - 6, align: c.align });
    if (h + 4 > rowH) rowH = h + 4;
  });
  // Cap row height
  if (rowH > 40) rowH = 40;

  ensureSpace(doc, rowH + 1);
  const y = doc.y;
  let x = MARGIN;

  if (bgColor) {
    doc.save().rect(MARGIN, y, sumWidths(cols), rowH).fillAndStroke(bgColor, '#ddd').restore();
  } else {
    doc.save().rect(MARGIN, y, sumWidths(cols), rowH).strokeColor('#ddd').stroke().restore();
  }

  cols.forEach((c, i) => {
    const txt = cells[i] ?? '';
    const color = cellColors?.[i] ?? '#000';
    doc.fillColor(color).font('Helvetica').fontSize(7)
      .text(txt, x + 3, y + 2, { width: c.w - 6, align: c.align, lineBreak: true, height: rowH - 4, ellipsis: true });
    x += c.w;
  });
  doc.y = y + rowH;
}

function drawEmptyRow(doc: PDFKit.PDFDocument, cols: Col[]) {
  ensureSpace(doc, 16);
  const y = doc.y;
  const h = 14;
  doc.save().rect(MARGIN, y, sumWidths(cols), h).strokeColor('#ddd').stroke().restore();
  doc.fillColor('#888').font('Helvetica-Oblique').fontSize(8)
    .text('— Tidak ada transaksi —', MARGIN, y + 3, { width: sumWidths(cols), align: 'center' });
  doc.y = y + h;
}

function sumWidths(cols: Col[]): number {
  return cols.reduce((s, c) => s + c.w, 0);
}
