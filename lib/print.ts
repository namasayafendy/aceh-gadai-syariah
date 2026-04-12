// ============================================================
// ACEH GADAI SYARIAH - Client-side Print Utility
// File: lib/print.ts
// Opens popup window with print-ready HTML documents
// Alamat/telpon dari outlet settings (passed in data)
// ============================================================

const fmtRp = (v: number | string) => 'Rp ' + (parseFloat(String(v || 0)) || 0).toLocaleString('id-ID');
const fmtTgl = (v: string) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
  if (!win) { alert('Izinkan popup untuk halaman ini agar bisa mencetak.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

const BASE_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#ccc;padding:10px}
.noprint{margin-bottom:10px;background:#fff;padding:8px;border-radius:4px}
.page{background:#fff;width:210mm;min-height:297mm;padding:12mm 15mm;margin:0 auto 10px}
.page:not(:last-child){page-break-after:always;break-after:page}
.page:last-child{page-break-after:avoid}
.page-half{background:#fff;width:210mm;min-height:148mm;padding:15mm;margin:0 auto 10px;page-break-after:always}
.page-half:last-child{page-break-after:avoid}
p{margin-bottom:3px}
@media print{body{background:#fff;padding:0}.noprint{display:none}
.page,.page-half{margin:0}.page:not(:last-child),.page-half:not(:last-child){page-break-after:always}}
`;

// ════════════════════════════════════════════════════════════
// CETAK SURAT KONTRAK GADAI (4 lembar)
// ════════════════════════════════════════════════════════════
export interface GadaiPrintData {
  noFaktur: string; tglGadai: string; tglJT: string; tglSita: string;
  nama: string; noKtp: string; telp1: string; telp2?: string;
  kategori: string; barang: string; kelengkapan: string; grade?: string; imeiSn: string;
  taksiran: number; jumlahGadai: number; biayaAdmin?: number;
  ujrahNominal: number; ujrahPersen: number | string;
  barcodeA: string; barcodeB: string; locationGudang?: string;
  kasir: string; outlet: string; alamat: string; kota: string;
  telpon: string; namaPerusahaan: string; waktuOperasional: string;
}

export function printGadai(r: GadaiPrintData) {
  const isEmas = ['EMAS', 'EMAS PAUN'].includes((r.kategori || '').toUpperCase());
  const ujrahNom = parseFloat(String(r.ujrahNominal || 0));

  // Breakdown (non-emas)
  let bdHtml = '';
  if (!isEmas && ujrahNom > 0) {
    const perPeriod = Math.ceil(ujrahNom / 6 / 1000) * 1000;
    const bd = [1, 2, 3, 4, 5, 6].map(i => perPeriod * i);
    bdHtml = `<p style="font-size:9px;font-weight:bold;margin:4px 0 2px">Biaya ujrah</p>
      <table style="font-size:9px;border-collapse:collapse"><tbody>
      <tr><td style="padding:1px 6px">1-5 hari: <b>${fmtRp(bd[0])}</b></td>
      <td style="padding:1px 6px">6-10 hari: <b>${fmtRp(bd[1])}</b></td>
      <td style="padding:1px 6px">11-15 hari: <b>${fmtRp(bd[2])}</b></td></tr>
      <tr><td style="padding:1px 6px">16-20 hari: <b>${fmtRp(bd[3])}</b></td>
      <td style="padding:1px 6px">21-25 hari: <b>${fmtRp(bd[4])}</b></td>
      <td style="padding:1px 6px">26-30 hari: <b>${fmtRp(bd[5])}</b></td></tr>
      </tbody></table>`;
  }

  let bcCounter = 0;
  const bcMap: { id: string; val: string }[] = [];

  function header(judul: string, barcode: string) {
    bcCounter++;
    const bcId = `bc-${bcCounter}`;
    bcMap.push({ id: bcId, val: barcode });
    const isBcB = barcode === r.barcodeB;
    const rakLabel = isBcB && r.locationGudang && r.locationGudang !== '—'
      ? `<div style="margin-top:4px;font-size:22px;font-weight:900;letter-spacing:2px;border:2px solid #000;padding:2px 6px;display:inline-block">${r.locationGudang}</div>` : '';
    return `<div style="display:flex;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px">
      <div style="width:55px;text-align:center"><div style="border:1px solid #000;width:45px;height:45px;margin:auto;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold">AG</div></div>
      <div style="flex:1;text-align:center">
        <div style="font-size:12px;font-weight:bold">${judul}</div>
        <div style="font-size:11px;font-weight:bold">${r.namaPerusahaan || 'PT. ACEH GADAI SYARIAH'}</div>
        <div style="font-size:8px">Alamat: ${r.alamat || ''} | Telp/WA: ${r.telpon || ''}</div>
        <div style="font-size:8px">Waktu Operasional: ${r.waktuOperasional || ''}</div>
      </div>
      <div style="text-align:right;min-width:120px">
        <svg id="${bcId}" style="height:35px"></svg>
        <div style="font-size:9px;font-weight:bold">${r.noFaktur}</div>
        ${rakLabel}
      </div>
    </div>`;
  }

  function dataSection() {
    return `<table style="width:100%;font-size:9.5px;margin-bottom:6px"><tbody>
      <tr><td style="width:50%;vertical-align:top;padding-right:10px">
        <table style="width:100%"><tbody>
        <tr><td style="padding:1px 0;width:90px">Nama</td><td style="padding:1px 0">: <b>${r.nama}</b></td></tr>
        <tr><td style="padding:1px 0">No. KTP</td><td style="padding:1px 0">: ${r.noKtp || '—'}</td></tr>
        <tr><td style="padding:1px 0">Telepon</td><td style="padding:1px 0">: ${r.telp1 || '—'}${r.telp2 ? ' / ' + r.telp2 : ''}</td></tr>
        <tr><td style="padding:1px 0">Kategori</td><td style="padding:1px 0">: ${r.kategori}</td></tr>
        <tr><td style="padding:1px 0">Barang</td><td style="padding:1px 0">: ${r.barang}</td></tr>
        <tr><td style="padding:1px 0">Kelengkapan</td><td style="padding:1px 0">: ${r.kelengkapan || '—'}</td></tr>
        <tr><td style="padding:1px 0">${isEmas ? 'Berat' : 'Grade'}</td><td style="padding:1px 0">: ${r.grade || '—'}</td></tr>
        <tr><td style="padding:1px 0">IMEI/SN</td><td style="padding:1px 0">: ${r.imeiSn || '—'}</td></tr>
        </tbody></table>
      </td><td style="vertical-align:top">
        <table style="width:100%"><tbody>
        <tr><td style="padding:1px 0;width:90px">Tgl Gadai</td><td style="padding:1px 0">: <b>${fmtTgl(r.tglGadai)}</b></td></tr>
        <tr><td style="padding:1px 0">Jatuh Tempo</td><td style="padding:1px 0">: <b>${fmtTgl(r.tglJT)}</b></td></tr>
        <tr><td style="padding:1px 0">Tgl Sita</td><td style="padding:1px 0">: ${fmtTgl(r.tglSita)}</td></tr>
        <tr><td style="padding:1px 0">Taksiran</td><td style="padding:1px 0">: <b>${fmtRp(r.taksiran)}</b></td></tr>
        <tr><td style="padding:1px 0">Jml Gadai</td><td style="padding:1px 0">: <b>${fmtRp(r.jumlahGadai)}</b></td></tr>
        <tr><td style="padding:1px 0">Biaya Admin</td><td style="padding:1px 0">: ${fmtRp(r.biayaAdmin || 10000)}</td></tr>
        <tr><td style="padding:1px 0">Ujrah</td><td style="padding:1px 0">: ${fmtRp(r.ujrahNominal)} (${r.ujrahPersen}%)</td></tr>
        </tbody></table>
        ${bdHtml}
      </td></tr></tbody></table>`;
  }

  function footer(lembar: string) {
    return `<div style="margin-top:12px;display:flex;font-size:9px">
      <div style="flex:1;text-align:center">
        <div style="margin-bottom:45px">${r.kota || r.outlet}, ${fmtTgl(r.tglGadai)}</div>
        <div style="margin-bottom:4px">Konsumen/Rahin</div>
        <div style="border-top:1px solid #000;padding-top:4px;display:inline-block;min-width:120px">${r.nama}</div>
      </div>
      <div style="flex:1;text-align:center">
        <div style="margin-bottom:45px">&nbsp;</div>
        <div style="margin-bottom:4px">${r.namaPerusahaan || 'PT. ACEH GADAI SYARIAH'}</div>
        <div style="border-top:1px solid #000;padding-top:4px;display:inline-block;min-width:120px">${r.kasir}</div>
      </div>
    </div>
    <div style="text-align:right;font-size:8px;color:#999;margin-top:6px">${lembar}</div>`;
  }

  function page(barcode: string, akad: 'ijarah' | 'sbr', lembar: string) {
    const judul = akad === 'ijarah' ? 'AKAD IJARAH (SEWA PENYIMPANAN)' : 'SURAT BUKTI RAHN (AKAD RAHN)';
    return `<div class="page">${header(judul, barcode)}${dataSection()}
      <p style="font-size:9px;margin:4px 0">Sepakat membuat ${akad === 'ijarah' ? 'Akad ijarah' : 'akad rahn'} sebagai berikut:</p>
      <p style="font-size:8px;color:#666;margin-bottom:4px">[Syarat & ketentuan berlaku sesuai peraturan ${r.namaPerusahaan || 'PT. ACEH GADAI SYARIAH'}]</p>
      ${footer(lembar)}
    </div>`;
  }

  const pages = [
    page(r.barcodeA, 'ijarah', 'Lembar 1 — Ijarah Customer'),
    page(r.barcodeA, 'sbr', 'Lembar 2 — SBR Customer'),
    page(r.barcodeB, 'ijarah', 'Lembar 3 — Ijarah Perusahaan'),
    page(r.barcodeB, 'sbr', 'Lembar 4 — SBR Perusahaan'),
  ];

  const bcScript = bcMap.map(b =>
    `try{JsBarcode(document.getElementById("${b.id}"),"${b.val}",{format:"CODE128",width:1.2,height:35,displayValue:false});}catch(e){}`
  ).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Dokumen Gadai ${r.noFaktur}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
    <style>${BASE_CSS}</style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button>
    <button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button>
    &nbsp;&nbsp;<small>4 lembar | Barcode A: <b>${r.barcodeA}</b> | Barcode B: <b>${r.barcodeB}</b></small></div>
    ${pages.join('')}
    <script>window.onload=function(){${bcScript}};<\/script>
    </body></html>`;

  openPrintWindow(html);
}

// ════════════════════════════════════════════════════════════
// CETAK NOTA TEBUS / PERPANJANG / dll (2 lembar half-page)
// ════════════════════════════════════════════════════════════
export interface TebusPrintData {
  idTebus: string; noFaktur: string; status: string;
  tglTebus: string; namaNasabah: string; kategori: string; barang: string;
  jumlahGadai: number; ujrahBerjalan: number; hariAktual: number;
  totalTebusSistem: number; jumlahBayar: number; selisih?: number;
  payment: string; kasir: string;
  outlet: string; alamat: string; kota: string; telpon: string;
  namaPerusahaan: string;
}

export function printTebus(r: TebusPrintData) {
  const statusLabel: Record<string, string> = {
    TEBUS: 'PENEBUSAN', PERPANJANG: 'PERPANJANGAN', TAMBAH: 'PENAMBAHAN',
    KURANG: 'PENGURANGAN', SITA: 'PENYITAAN', JUAL: 'PENJUALAN',
  };

  function nota(lembar: string) {
    return `<div class="page-half">
      <div style="text-align:center;margin-bottom:10px">
        <div style="font-size:13px;font-weight:bold">NOTA ${statusLabel[r.status] || r.status}</div>
        <div style="font-size:10px">${r.namaPerusahaan || 'PT. ACEH GADAI SYARIAH'}</div>
        <div style="font-size:8px">${r.alamat || ''} | Telp/WA: ${r.telpon || ''}</div>
      </div>
      <table style="width:100%;font-size:10px;margin-bottom:10px"><tbody>
        <tr><td style="padding:2px 0;width:120px">ID Tebus</td><td>: ${r.idTebus}</td></tr>
        <tr><td style="padding:2px 0">No Faktur</td><td>: <b>${r.noFaktur}</b></td></tr>
        <tr><td style="padding:2px 0">Status</td><td>: <b>${r.status}</b></td></tr>
        <tr><td style="padding:2px 0">Tanggal</td><td>: ${fmtTgl(r.tglTebus)}</td></tr>
        <tr><td style="padding:2px 0">Nama</td><td>: ${r.namaNasabah}</td></tr>
        <tr><td style="padding:2px 0">Kategori</td><td>: ${r.kategori}</td></tr>
        <tr><td style="padding:2px 0">Barang</td><td>: ${r.barang}</td></tr>
        <tr><td style="padding:2px 0">Lama Gadai</td><td>: ${r.hariAktual} hari</td></tr>
        <tr><td style="padding:2px 0">Pinjaman</td><td>: ${fmtRp(r.jumlahGadai)}</td></tr>
        <tr><td style="padding:2px 0">Ujrah Berjalan</td><td>: ${fmtRp(r.ujrahBerjalan)}</td></tr>
        <tr style="border-top:1px solid #000"><td style="padding:4px 0;font-weight:bold">Total Sistem</td><td style="font-weight:bold">: ${fmtRp(r.totalTebusSistem)}</td></tr>
        <tr><td style="padding:2px 0;font-weight:bold;font-size:12px">JUMLAH BAYAR</td><td style="font-weight:bold;font-size:12px">: ${fmtRp(r.jumlahBayar)}</td></tr>
        <tr><td style="padding:2px 0">Pembayaran</td><td>: ${r.payment}</td></tr>
        <tr><td style="padding:2px 0">Kasir</td><td>: ${r.kasir}</td></tr>
      </tbody></table>
      <div style="display:flex;font-size:9px;margin-top:16px">
        <div style="flex:1;text-align:center">
          <div style="margin-bottom:40px">${r.kota || r.outlet}, ${fmtTgl(r.tglTebus)}</div>
          <div>Konsumen</div><div style="border-top:1px solid #000;padding-top:4px;display:inline-block;min-width:100px">${r.namaNasabah}</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="margin-bottom:40px">&nbsp;</div>
          <div>Kasir</div><div style="border-top:1px solid #000;padding-top:4px;display:inline-block;min-width:100px">${r.kasir}</div>
        </div>
      </div>
      <div style="text-align:right;font-size:8px;color:#999;margin-top:8px">${lembar}</div>
    </div>`;
  }

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Nota ${r.status} ${r.noFaktur}</title>
    <style>${BASE_CSS}</style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button>
    <button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button></div>
    ${nota('Lembar Nasabah')}${nota('Lembar Perusahaan')}
    </body></html>`;

  openPrintWindow(html);
}

// ════════════════════════════════════════════════════════════
// CETAK SURAT SJB (2 lembar)
// ════════════════════════════════════════════════════════════
export interface SJBPrintData {
  noSJB: string; nama: string; noKtp?: string; telp1?: string;
  kategori: string; barang: string; kelengkapan?: string; grade?: string; imeiSn?: string;
  hargaJual: number; hargaBuyback: number; lamaTitip: number;
  tglJual: string; tglJT: string;
  barcodeA: string; barcodeB?: string;
  kasir: string; outlet: string; alamat: string; kota: string;
  telpon: string; namaPerusahaan: string;
}

export function printSJB(r: SJBPrintData) {
  let bcCounter = 0;
  const bcMap: { id: string; val: string }[] = [];

  function page(barcode: string, lembar: string) {
    bcCounter++;
    const bcId = `sjb-bc-${bcCounter}`;
    bcMap.push({ id: bcId, val: barcode });

    return `<div class="page">
      <div style="display:flex;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:10px">
        <div style="width:55px;text-align:center"><div style="border:1px solid #000;width:45px;height:45px;margin:auto;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold">AG</div></div>
        <div style="flex:1;text-align:center">
          <div style="font-size:13px;font-weight:bold">SURAT PERJANJIAN JUAL DAN BELI KEMBALI (SJB)</div>
          <div style="font-size:11px;font-weight:bold">${r.namaPerusahaan || 'PT. ACEH GADAI SYARIAH'}</div>
          <div style="font-size:8px">Alamat: ${r.alamat || ''} | Telp/WA: ${r.telpon || ''}</div>
        </div>
        <div style="text-align:right;min-width:120px">
          <svg id="${bcId}" style="height:35px"></svg>
          <div style="font-size:9px;font-weight:bold">${r.noSJB}</div>
        </div>
      </div>
      <table style="width:100%;font-size:10px;margin-bottom:12px"><tbody>
        <tr><td style="padding:2px 0;width:120px">No. SJB</td><td>: <b>${r.noSJB}</b></td></tr>
        <tr><td>Nama Pemilik</td><td>: <b>${r.nama}</b></td></tr>
        <tr><td>No KTP</td><td>: ${r.noKtp || '—'}</td></tr>
        <tr><td>Telepon</td><td>: ${r.telp1 || '—'}</td></tr>
        <tr><td>Kategori</td><td>: ${r.kategori}</td></tr>
        <tr><td>Barang</td><td>: ${r.barang}</td></tr>
        <tr><td>Kelengkapan</td><td>: ${r.kelengkapan || '—'}</td></tr>
        <tr><td>IMEI/SN</td><td>: ${r.imeiSn || '—'}</td></tr>
        <tr><td>Harga Jual</td><td>: <b>${fmtRp(r.hargaJual)}</b></td></tr>
        <tr><td>Harga Buyback</td><td>: <b style="color:red">${fmtRp(r.hargaBuyback)}</b></td></tr>
        <tr><td>Lama Titip</td><td>: ${r.lamaTitip} hari</td></tr>
        <tr><td>Tgl Jual</td><td>: ${fmtTgl(r.tglJual)}</td></tr>
        <tr><td>Batas Buyback</td><td>: <b>${fmtTgl(r.tglJT)}</b></td></tr>
      </tbody></table>
      <p style="font-size:9px;margin-bottom:12px">Apabila PIHAK PERTAMA tidak melakukan pembelian kembali hingga tanggal yang ditentukan, maka barang sepenuhnya menjadi milik ${r.namaPerusahaan || 'PT. ACEH GADAI SYARIAH'}.</p>
      <div style="display:flex;font-size:9px;margin-top:20px">
        <div style="flex:1;text-align:center">
          <div style="margin-bottom:45px">${r.kota || r.outlet}, ${fmtTgl(r.tglJual)}</div>
          <div>PIHAK PERTAMA</div><div style="border-top:1px solid #000;padding-top:4px;display:inline-block;min-width:120px">${r.nama}</div>
        </div>
        <div style="flex:1;text-align:center">
          <div style="margin-bottom:45px">&nbsp;</div>
          <div>PIHAK KEDUA</div><div style="border-top:1px solid #000;padding-top:4px;display:inline-block;min-width:120px">${r.kasir}</div>
        </div>
      </div>
      <div style="text-align:right;font-size:8px;color:#999;margin-top:8px">${lembar}</div>
    </div>`;
  }

  const pages = page(r.barcodeA, 'Lembar Konsumen') + page(r.barcodeB || r.noSJB, 'Lembar Perusahaan');
  const bcScript = bcMap.map(b =>
    `try{JsBarcode(document.getElementById("${b.id}"),"${b.val}",{format:"CODE128",width:1.2,height:35,displayValue:false});}catch(e){}`
  ).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>SJB ${r.noSJB}</title>
    <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>
    <style>${BASE_CSS}</style></head><body>
    <div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button>
    <button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button></div>
    ${pages}
    <script>window.onload=function(){${bcScript}};<\/script>
    </body></html>`;

  openPrintWindow(html);
}
