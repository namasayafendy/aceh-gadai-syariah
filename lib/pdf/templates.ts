// ============================================================
// ACEH GADAI SYARIAH - PDF HTML Templates
// File: lib/pdf/templates.ts
//
// Replika KATA PER KATA dari fungsi print di GAS:
//   - printGadaiDoc()     → buildGadaiHtml()
//   - printTebusDoc()     → buildTebusHtml()
//   - printSJBDoc()       → buildSJBHtml()
//   - buildBonDriveHTML_* → buildBonHtml() (ringkasan untuk storage)
//
// Dipakai untuk:
//   1. Backup storage per transaksi (dipanggil dari API route)
//   2. Render cetak di browser (dikirim ke client sebagai string)
// ============================================================

import { LOGO_AG_DATA_URI } from '@/lib/assets/logo-ag';

// ─── Format helpers ───────────────────────────────────────────
const fmtRp = (v: number | string): string =>
  'Rp\u00a0' + (parseFloat(String(v ?? 0)) || 0).toLocaleString('id-ID');

const fmtRpPlain = (v: number | string): string =>
  'Rp ' + (parseFloat(String(v ?? 0)) || 0).toLocaleString('id-ID');

// ─── COMMON CSS ───────────────────────────────────────────────
const BASE_CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#ccc;padding:10px}
.noprint{margin-bottom:10px;background:#fff;padding:8px;border-radius:4px}
.page{background:#fff;width:210mm;min-height:297mm;padding:12mm 15mm;margin:0 auto 10px}
.page:not(:last-child){page-break-after:always;break-after:page}
.page:last-child{page-break-after:avoid;break-after:avoid}
p{margin-bottom:3px}
@media print{body{background:#fff;padding:0}.noprint{display:none}
.page{margin:0;padding:12mm 15mm}
.page:not(:last-child){page-break-after:always;break-after:page}
.page:last-child{page-break-after:avoid;break-after:avoid}}`;

const NOTA_CSS = `*{margin:0;padding:0;box-sizing:border-box}
body{font-family:Arial,sans-serif;background:#ccc;padding:10px}
.noprint{margin-bottom:10px;background:#fff;padding:8px;border-radius:4px}
.page{background:#fff;width:210mm;min-height:148mm;padding:15mm;margin:0 auto 10px;page-break-after:always}
.page-a4{background:#fff;width:210mm;min-height:297mm;padding:12mm 15mm;margin:0 auto 10px;page-break-after:always}
.page:last-child,.page-a4:last-child{page-break-after:avoid}
p{margin-bottom:4px}
@media print{body{background:#fff;padding:0}.noprint{display:none}
.page,.page-a4{margin:0;page-break-after:always}
.page:last-child,.page-a4:last-child{page-break-after:avoid}}`;

// ════════════════════════════════════════════════════════════
// 1. SURAT KONTRAK GADAI
//    4 lembar: Ijarah Customer, SBR Customer, Ijarah Perusahaan, SBR Perusahaan
//    Replika dari printGadaiDoc() di gadai.html
// ════════════════════════════════════════════════════════════
export interface GadaiData {
  noFaktur: string; tglGadai: string; tglJT: string; tglSita: string;
  nama: string; noKtp: string; telp1: string; telp2: string;
  kategori: string; barang: string; kelengkapan: string; grade: string; imeiSn: string;
  taksiran: number; jumlahGadai: number; biayaAdmin: number;
  ujrahNominal: number; ujrahPersen: number | string;
  barcodeA: string; barcodeB: string; locationGudang: string;
  kasir: string; outlet: string; alamat: string; kota: string;
  telpon: string; namaPerusahaan: string; waktuOperasional: string;
  statusKepalaGudang?: string;
}

export function buildGadaiHtml(r: GadaiData): string {
  const isEmas = ['EMAS', 'EMAS PAUN'].includes((r.kategori || '').toUpperCase());

  // Ujrah breakdown
  const ujrahNominalFinal = parseFloat(String(r.ujrahNominal || 0));
  let bd: number[] | null = null;
  if (!isEmas) {
    const perPeriod = Math.ceil(ujrahNominalFinal / 6 / 1000) * 1000;
    bd = [1,2,3,4,5,6].map(i => perPeriod * i);
  }
  const ujrahPerHariVal = isEmas
    ? Math.ceil(ujrahNominalFinal / 30 / 1000) * 1000 : 0;
  const ujrahPerHari = ujrahPerHariVal > 0 ? fmtRp(ujrahPerHariVal) : '';

  let _pageCounter = 0;
  const _bcMap: { id: string; val: string }[] = [];

  function hdr(judul: string, barcode: string, noSbr: string): string {
    _pageCounter++;
    const bcId = 'bc-pg' + _pageCounter;
    _bcMap.push({ id: bcId, val: barcode });
    const isBarcodeB = barcode === r.barcodeB;
    const rakLabel = (isBarcodeB && r.locationGudang && r.locationGudang !== '—')
      ? `<div style="margin-top:4px;font-size:26px;font-weight:900;letter-spacing:3px;color:#000;text-align:center;border:2px solid #000;padding:3px 8px;display:inline-block">${r.locationGudang}</div>`
      : '';
    return `<div style="display:flex;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px">`
      + `<div style="width:60px;min-width:60px;text-align:center"><img src="${LOGO_AG_DATA_URI}" alt="AG" style="width:50px;height:50px;object-fit:contain" /></div>`
      + `<div style="flex:1;text-align:center">`
      + `<div style="font-size:13px;font-weight:bold">${judul}</div>`
      + `<div style="font-size:12px;font-weight:bold">${r.namaPerusahaan || 'ACEH GADAI SYARIAH'}</div>`
      + `<div style="font-size:9px">Alamat: ${r.alamat || ''} | Telp/WA: ${r.telpon || ''}</div>`
      + `<div style="font-size:9px">Waktu Operasional Kerja: ${r.waktuOperasional || 'Senin-Minggu & Libur Nasional : 10.00 - 22.00 WIB'}</div>`
      + `</div>`
      + `<div style="text-align:right;min-width:130px">`
      + `<svg id="${bcId}" style="height:40px"></svg>`
      + `<div style="font-size:9px">${barcode}</div>${rakLabel}</div></div>`
      + `<div style="display:flex;justify-content:flex-end;font-size:10px;margin-bottom:6px">`
      + `<span style="border:1px solid #000;padding:2px 8px"><b>No. SBR :</b>&nbsp;&nbsp;${noSbr}</span></div>`;
  }

  function fieldRow(lbl: string, val: string): string {
    return `<tr><td style="padding:1px 4px;width:160px;vertical-align:top">${lbl}</td>`
      + `<td style="padding:1px 4px;vertical-align:top">: ${val}</td></tr>`;
  }

  function bodyData(akad: string): string {
    const penanda = akad === 'ijarah'
      ? `Kami yang bertanda tangan pada Surat AKAD IJARAH ini, yakni MUA'JIR (Pemberi sewa dalam hal ini PT. ACEH GADAI SYARIAH), dan`
      : `Kami yang bertanda tangan di bawah ini pada Surat Bukti Rahn (SBR) ini.<br>Yakni MURTAHIN (Penerima Gadai dalam hal ini PT ACEH GADAI SYARIAH) Dan`;
    const peran = akad === 'ijarah'
      ? `Dalam hal ini sebagai MUSTA'JIR (Penyewa atau kuasa dari marhun)`
      : `Sebagai RAHIN ( pemilik Marhun atau kuasa dari pemilik Marhun),`;

    let html = `<p style="font-size:9px;margin:0 0 6px">${penanda}</p>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px"><tbody>`;
    html += fieldRow('Nama', r.nama || '');
    html += fieldRow('No. Identitas', r.noKtp || '');
    html += fieldRow('No. Handphone', `${r.telp1 || ''} / ${r.telp2 || ''}`);
    html += `</tbody></table>`;
    html += `<p style="font-size:9px;margin:0 0 4px">${peran}</p>`;

    html += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:2px"><tbody><tr>`;
    html += `<td style="padding:1px 4px;width:80px">Kategori</td><td style="padding:1px 4px;width:130px">: <b>${r.kategori || ''}</b></td>`;
    html += `<td style="padding:1px 4px;width:60px">Barang</td><td style="padding:1px 4px">: ${r.barang || ''}</td>`;
    if (isEmas) {
      html += `<td style="padding:1px 4px;width:40px">Berat</td><td style="padding:1px 4px;width:70px">: ${r.grade || ''} Gram</td>`;
    } else {
      html += `<td style="padding:1px 4px;width:40px">Grade</td><td style="padding:1px 4px;width:70px">: ${r.grade || ''}</td>`;
    }
    html += `</tr>`;
    if (isEmas) {
      html += `<tr><td style="padding:1px 4px">Kadar</td><td style="padding:1px 4px">: ${r.imeiSn || ''}</td>`;
      html += `<td style="padding:1px 4px">Kelengkapan</td><td style="padding:1px 4px" colspan="3">: ${r.kelengkapan || ''}</td></tr>`;
    } else {
      html += `<tr><td style="padding:1px 4px">IMEI/SN</td><td style="padding:1px 4px">: ${r.imeiSn || ''}</td>`;
      html += `<td style="padding:1px 4px">Kelengkapan</td><td style="padding:1px 4px" colspan="3">: ${r.kelengkapan || ''}</td></tr>`;
    }
    html += `</tbody></table>`;

    html += `<p style="font-size:9px;margin:4px 0 2px">Dengan</p>`;
    html += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px"><tbody>`;
    html += `<tr><td style="padding:1px 4px;width:170px">Taksiran maksimal MARHUN</td>`
      + `<td style="padding:1px 4px;width:130px">: ${r.taksiran ? fmtRp(r.taksiran) : ''}</td>`
      + `<td style="padding:1px 4px;width:90px">Biaya Admin</td>`
      + `<td style="padding:1px 4px">: <b>${fmtRp(10000)}</b></td></tr>`;
    html += `<tr><td style="padding:1px 4px">MARHUN BIH (pinjaman)</td>`
      + `<td style="padding:1px 4px">: ${r.jumlahGadai ? fmtRp(r.jumlahGadai) : ''}</td>`
      + `<td style="padding:1px 4px">Tanggal Jatuh Tempo</td>`
      + `<td style="padding:1px 4px">: <b>${r.tglJT || ''}</b></td></tr>`;
    html += `<tr><td></td><td></td><td style="padding:1px 4px">Tanggal Marhun dijual</td>`
      + `<td style="padding:1px 4px">: <b>${r.tglSita || ''}</b></td></tr>`;
    html += `</tbody></table>`;

    if (isEmas) {
      html += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px"><tbody>`;
      html += `<tr><td style="padding:1px 4px">Biaya pemeliharaan dan penyimpanan emas (ujrah) / hari :</td>`
        + `<td style="padding:1px 4px;font-weight:bold">${ujrahPerHari}</td></tr>`;
      html += `</tbody></table>`;
    } else {
      html += `<p style="font-size:9px;font-weight:bold;margin:4px 0 2px">Biaya ujrah</p>`;
      if (bd) {
        html += `<table style="font-size:9px;border-collapse:collapse;margin-bottom:4px"><tbody><tr>`;
        html += `<td style="padding:1px 6px;white-space:nowrap">1-5 hari : <b>${fmtRp(bd[0])}</b></td>`;
        html += `<td style="padding:1px 6px;white-space:nowrap">6-10 hari : <b>${fmtRp(bd[1])}</b></td>`;
        html += `<td style="padding:1px 6px;white-space:nowrap">11-15 hari : <b>${fmtRp(bd[2])}</b></td>`;
        html += `</tr><tr>`;
        html += `<td style="padding:1px 6px;white-space:nowrap">16-20 hari: <b>${fmtRp(bd[3])}</b></td>`;
        html += `<td style="padding:1px 6px;white-space:nowrap">21-25 hari: <b>${fmtRp(bd[4])}</b></td>`;
        html += `<td style="padding:1px 6px;white-space:nowrap">26-30 hari: <b>${fmtRp(bd[5])}</b></td>`;
        html += `</tr></tbody></table>`;
      }
    }
    return html;
  }

  // ── ADDENDUM TEXTS (kata per kata dari GAS) ───────────────
  const addIjarahHP_L = `<p><b>1.</b> MUSTA'JIR menyewa MA'JUR (Tempat Penyimpanan/Gudang) milik MUA'JIR.</p>`
    + `<p><b>2.</b> MUSTA'JIR menyatakan tunduk dan mengikuti segala Peraturan yang berlaku di MUA'JIR dan setuju dikenakan ujrah (Sewa Penyimpanan), dengan ketentuan tarif ujrah yang Berlaku di MUA'JIR atau sebesar yang tertuang dalam SURAT BUKTI RAHN(akad rahn)</p>`
    + `<p><b>3.</b> Tarif ujrah per 5 (lima) hari, untuk 1(satu) hari sampai Dengan 5 (lima) hari, dihitung sama dengan 5 (lima) Hari. 6 (enam) hari sampai dengan 10(sepuluh) hari dihitung sama dengan 10 hari,Dst</p>`
    + `<p><b>4.</b> Permintaan penundaan jual dari MUSTA'JIR dapat diberikan Tambahan hari penundaan sesuai ketentuan pada MUA'JIR dan Dikenakan ujrah sesuai dengan akad ijarah dan ketentuan yang Berlaku di MUA'JIR atau sebesar yang tercantum dalam SURAT BUKTI RAHN. Apabila MUSTA'JIR meninggal dan terdapat hak dan Kewajiban terhadap MUA'JIR maupun sebaliknya, maka hak Dan kewajiban tersebut jatuh kepada ahli waris MUSTA'JIR Sesuai dengan ketentuan waris dalam Hukum Republik Indonesia.</p>`
    + `<p><b>5.</b> Segala kerusakan (kondisi) minus di awal rahn bertambah atau semakin rusak saat penebusan maka mua'jir dibebaskan dari tanggung jawab apapun karena barang jaminan di segel dan tidak dibuka sampai musta'jir menebus atau sampai masa jatuh tempo dijual.</p>`
    + `<p><b>6.</b> Apabila saat menebus ditemukan padam/hang/error atau kerusakan tambahan lainnya maka sepenuhnya menjadi tanggung jawab nasabah dan saya tidak menuntut kepada mua'jir di kemudian hari _____________(wajib paraf)</p>`;

  const addIjarahHP_R = `<p><b>7.</b> MUA'JIR memberikan fasilitas pemberitahuan jatuh tempo dan marhun akan di jual kepada nasabah hanya melalui<br>-Via telepon minimal 1 kali (sebelum dijual)<br>-Via WhatsApp minimal 1 kali maksimal 15 kali (sebelum jatuh tempo sampai dijual)<br>Apabila fasilitas tersebut tidak diterima atau nomer telepon MUSTA' JIR salah dan atau tidak dapat dihubungi(tidak dijawab) sampai marhun terjual, sepenuhnya tidak menjadi tanggung jawab MUA'JIR</p>`
    + `<p><b>8.</b> Setiap marhun yang dititipkan melewati waktu dan dijual oleh MUA'JIR , maka segala ketentuan dan kesepakatan kepada pembeli diserahkan sepenuhnya kepada MUA'JIR. Apabila terjadi ketidak sesuaian apapun di kemudian hari dari hasil kesepakatan tersebut, maka MUA'JIR dibebaskan dari tuntutan apapun oleh pihak nasabah _____________(wajib paraf)</p>`
    + `<p><b>9.</b> Dari penjualan marhun maka :<br>a. Jika terdapat uang kelebihan setelah dikurangi ujrah adalah milik MUSTA'JIR, jangka waktu pengambilan uang kelebihan adalah selama satu tahun sejak tanggal penjualan, dan jika lewat dari waktu yang ditentukan, MUSTA'JIR menyatakan sebagai sedekah yang pelaksanaannya diserahkan kepada MUA'JIR.<br>b. Jika tidak mencukupi unruk melunasi kewajiban MUSTA'JIR berupa ujrah maka MUSTA'JIR wajib membayar kekurangan tersebut.</p>`
    + `<p><b>10.</b> Apabila terjadi perselesihan dikemudian hari akan diselesaikan Secara musyawarah untuk mufakat dan apabila tidak tercapai Kesepakatan akan diselesaikan melalui Pengadilan Agama Setempat.</p>`;

  const addIjarahEmas_L = `<p><b>1.</b> MUSTA'JIR menyewa MA'JUR (Tempat Penyimpanan/Gudang) milik MUA'JIR.</p>`
    + `<p><b>2.</b> MUSTA'JIR menyatakan tunduk dan mengikuti segala Peraturan yang berlaku di MUA'JIR dan setuju dikenakan ujrah (Sewa Penyimpanan), dengan ketentuan tarif ujrah yang Berlaku di MUA'JIR atau sebesar yang tertuang dalam SURAT BUKTI RAHN(akad rahn)</p>`
    + `<p><b>3.</b> Biaya pemeliharaan dan penyimpanan emas (ujrah) dihitung perhari sesuai lama masa penyimpanan.</p>`
    + `<p><b>4.</b> Permintaan penundaan jual dari MUSTA'JIR dapat diberikan Tambahan hari penundaan sesuai ketentuan pada MUA'JIR dan Dikenakan ujrah sesuai dengan akad ijarah dan ketentuan yang Berlaku di MUA'JIR atau sebesar yang tercantum dalam SURAT BUKTI RAHN. Apabila MUSTA'JIR meninggal dan terdapat hak dan Kewajiban terhadap MUA'JIR maupun sebaliknya, maka hak Dan kewajiban tersebut jatuh kepada ahli waris MUSTA'JIR Sesuai dengan ketentuan waris dalam Hukum Republik Indonesia.</p>`
    + `<p><b>5.</b> Segala kerusakan (kondisi) minus di awal rahn bertambah atau semakin rusak saat penebusan maka mua'jir dibebaskan dari tanggung jawab apapun karena barang jaminan di segel dan tidak dibuka sampai musta'jir menebus atau sampai masa jatuh tempo dijual.</p>`
    + `<p><b>6.</b> MUA'JIR memberikan fasilitas pemberitahuan jatuh tempo dan marhun akan di jual kepada nasabah hanya melalui<br>-Via telepon minimal 1 kali (sebelum dijual)<br>-Via WhatsApp minimal 1 kali maksimal 15 kali (sebelum jatuh tempo sampai dijual)<br>Apabila fasilitas tersebut tidak diterima atau nomer telepon MUSTA' JIR salah dan atau tidak dapat dihubungi(tidak dijawab) sampai marhun terjual, sepenuhnya tidak menjadi tanggung jawab MUA'JIR</p>`;

  const addIjarahEmas_R = `<p><b>7.</b> Setiap marhun yang dititipkan melewati waktu dan dijual oleh MUA'JIR , maka segala ketentuan dan kesepakatan kepada pembeli diserahkan sepenuhnya kepada MUA'JIR. Apabila terjadi ketidak sesuaian apapun di kemudian hari dari hasil kesepakatan tersebut, maka MUA'JIR dibebaskan dari tuntutan apapun oleh pihak nasabah _____________(wajib paraf)</p>`
    + `<p><b>8.</b> Dari penjualan marhun maka :<br>a. Jika terdapat uang kelebihan setelah dikurangi ujrah adalah milik MUSTA'JIR, jangka waktu pengambilan uang kelebihan adalah selama satu tahun sejak tanggal penjualan, dan jika lewat dari waktu yang ditentukan, MUSTA'JIR menyatakan sebagai sedekah yang pelaksanaannya diserahkan kepada MUA'JIR.<br>b. Jika tidak mencukupi unruk melunasi kewajiban MUSTA'JIR berupa ujrah maka MUSTA'JIR wajib membayar kekurangan tersebut.</p>`
    + `<p><b>9.</b> Apabila terjadi perselesihan dikemudian hari akan diselesaikan Secara musyawarah untuk mufakat dan apabila tidak tercapai Kesepakatan akan diselesaikan melalui Pengadilan Agama Setempat.</p>`;

  const addSBR_L = `<p><b>1.</b> RAHIN menerima dan setuju terhadap uraian Marhun, penetapan taksiran Marhun, Marhun Bih,tarif ujrah, biaya adminitrasi yang tertetara pada Surat Bukti Rahn (Akad Rahn) dan Akad IJARAH sebagai tanda bukti yang sah penerimaan Marhun Bih.</p>`
    + `<p><b>2.</b> Marhun adalah milik RAHIN, milik pihak lain yang dikuasakan kepada RAHIN dan/atau kepemilikan sebagaimana pasal 1977 KUH Perdata dan menjamin bukan dari hasil kejahatan, tidak dalam atau obyek sengketa, dan/atau sita jaminan.</p>`
    + `<p><b>3.</b> RAHIN menyatakan telah berhutang kepada MURTAHIN dan berkewajiban untuk membayar pelunasan Marhun Bih dan ujrah dan biaya proses lelang jika ada.</p>`
    + `<p><b>4.</b> MURTAHIN akan memberikan ganti kerugian apabila Marhun yang berada dalam penguasaan MURTAHIN mengalami kerusakan atau hilang yang disebabkan oleh kelalaian MURTAHIN. Ganti rugi diberikan dalam bentuk uang sebesar taksiran maksimal MARHUN ditambah 25% dan akan diberikan selisih setelah diperhitungkan dengan Marhun Bih sesuai ketentuan penggantian yang berlaku di MURTAHIN. Untuk kenyamanan Bersama, MURTAHIN akan menyegel marhun selama akad rahn dan tidak akan membuka segel sebelum di tebus atau sebelum sampai tanggal jual marhun.`
    + (isEmas ? '' : `<br>Untuk itu maka MURTAHIN menyarankan utk marhun berupa barang elektronik saat akan di titipkan disarankan baterai sekurang- kurang nya 50% untuk menghindari marhun tidak bisa hidup saat di tebus. Apabila terjadi kerusakan saat di tebus, pihak MURTAHIN tidak bertanggung jawab karena barang dalam kondisi segel dan tidak dibuka salama masa akad RAHN. MURTAHIN juga tidak bertanggung jawab atas kehilangan data yang ada di barang elektronik yg dititipkan,maka sebaiknya semua data data dibackup oleh RAHIN`) + `</p>`
    + `<p><b>5.</b> RAHIN dapat mengansur Marhun Bih, menebus sebagian Marhun sebagai akad baru, sedangkan perpanjangan waktu (Rescheduling) tetap menggunakan akad lama yaitu dengan taksiran dan Marhun Bih lama. Jika terjadi penurunan atau kenaikan nilai marhun, maka mengacu kepada ketentuan yang berlaku di MURTAHIN.</p>`;

  const addSBR_R_HP = `<p><b>6.</b> Permintaan penundaan jual dapat dilayani sebelum jatuh tempo dengan memberitahu pihak ACEH GADAI.Penundaan jual Marhun dikenakan biaya sesuai ketentuan yang berlaku di MURTAHIN.</p>`;
  const addSBR_R_EMAS = `<p><b>6.</b> Permintaan penundaan jual dapat dilayani sebelum jatuh tempo dengan memberitahu pihak ACEH GADAI SYARIAH. Penundaan jual Marhun dikenakan biaya sesuai ketentuan yang berlaku di MURTAHIN.</p>`;
  const addSBR_R_common = `<p><b>7.</b> Terhadap Marhun yang telah dilunasi dan belum diambil oleh RAHIN sampai terhitung sejak terjadiya tanggal pelunasan sampai dengan sepuluh hari tidak dikenakan jasa penitipan. Bila telah melebihi sepuluh hari dari tanggal pelunasan, Marhun tetap belum diambil, maka RAHIN sepakat dikenakan jasa penitipan, besaran jasa penitipan sesuai dengan ketentuan yang berlaku di MURTAHIN.</p>`
    + `<p><b>8.</b> Apabila sampai dengan tangal jatuh tempo tidak dilakukan pelunasan, menebus Marhun, mengangsur Marhun Bih, penundaan jual maka MURTAHIN berhak melakukan penjualan Marhun.</p>`
    + `<p><b>9.</b> Hasil penjualan lelang marhun setelah dikurangi Marhun Bih,Ujrah, Biaya Proses jual (jika ada), Merupakan kelebihan yang menjadi hak RAHIN. Jangka waktu pengambilan uang kelebihan selama satu tahun sejak tanggal laku lelang, dan jika lewat dari jangka pengambilan uang kelebihan, RAHIN menyatakan setuju untuk menyalurkan uang kelebihan lelang tersebut sebagai sedekah yang pelaksanaanya diserahkan kepada MURTAHIN. Jika hasil penjualan Marhun tidak mencukupi melunasi kewajiban RAHIN berupa Marhun Bih, Ujrah, Biaya proses jual (jika ada) dan maka akan ditanggung oleh MURTAHIN.</p>`;

  function addendum(left: string, right: string): string {
    return `<div style="display:flex;gap:16px;margin-top:8px">`
      + `<div style="flex:1;font-size:8.5px;line-height:1.4">${left}</div>`
      + `<div style="flex:1;font-size:8.5px;line-height:1.4">${right}</div>`
      + `</div>`;
  }

  function footerIjarah(lembar: string): string {
    return `<div style="font-size:9px;margin-top:10px">Demikian akad ijarah yang berlaku antara MUA'JIR dan MUSTA'JIR Sejak Surat Bukti Rahn (SBR) ini ditandatangani oleh kedua belah Pihak pada kolom yang tersedia.</div>`
      + `<div style="display:flex;margin-top:16px;font-size:9px">`
      + `<div style="flex:1;text-align:center">Disepakati, ${r.kota || ''}<br><br><b>MUA'JIR</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.namaPerusahaan || 'PT ACEH GADAI SYARIAH'}</span></div>`
      + `<div style="flex:1;text-align:center"><br><br><b>MUSTA'JIR</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.nama || ''}</span></div>`
      + `</div><div style="text-align:right;font-size:8px;margin-top:4px">*) Lembar ${lembar}</div>`;
  }

  function footerSBR(lembar: string): string {
    return `<div style="font-size:9px;margin-top:10px">Demikian Akad Rahn ini berlaku dan mengikat MURTAHIN dengan RAHIN sejak Surat Bukti Rahn atau (SBR) ini ditanda tangani oleh kedua belah pihak pada kolom yang tersedia.</div>`
      + `<div style="display:flex;margin-top:16px;font-size:9px">`
      + `<div style="flex:1;text-align:center">Disepakati, ${r.kota || ''}<br><br><b>MURTAHIN</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.namaPerusahaan || 'PT ACEH GADAI SYARIAH'}</span></div>`
      + `<div style="flex:1;text-align:center"><br><br><b>RAHIN</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.nama || ''}</span></div>`
      + `</div><div style="text-align:right;font-size:8px;margin-top:4px">*) Lembar ${lembar}</div>`;
  }

  function page(barcode: string, akad: string, lembar: string): string {
    const judulAkad = akad === 'ijarah' ? `AKAD IJARAH (SEWA PENYIMPANAN)` : `SURAT BUKTI RAHN(AKAD RAHN)`;
    const sepakat   = akad === 'ijarah' ? `Sepakat membuat Akad ijarah sebagai berikut:` : `Sepakat membuat akad rahn sebagai berikut :`;
    const judul_add = `<p style="font-weight:bold;font-size:10px;text-align:right;margin-top:6px">ADDENDUM</p>`;
    let addLeft: string, addRight: string, footer: string;
    if (akad === 'ijarah') {
      addLeft  = isEmas ? addIjarahEmas_L : addIjarahHP_L;
      addRight = isEmas ? addIjarahEmas_R : addIjarahHP_R;
      footer   = footerIjarah(lembar);
    } else {
      addLeft  = addSBR_L;
      addRight = (isEmas ? addSBR_R_EMAS : addSBR_R_HP) + addSBR_R_common;
      footer   = footerSBR(lembar);
    }
    return `<div class="page">`
      + hdr(judulAkad, barcode, r.noFaktur)
      + bodyData(akad)
      + `<p style="font-size:9px;margin:4px 0">${sepakat}</p>`
      + judul_add
      + addendum(addLeft, addRight)
      + footer
      + `</div>`;
  }

  const pages = [
    page(r.barcodeA, 'ijarah', 'Customer'),
    page(r.barcodeA, 'sbr',    'Customer'),
    page(r.barcodeB, 'ijarah', 'Perusahaan'),
    page(r.barcodeB, 'sbr',    'Perusahaan'),
  ];

  const bcScript = _bcMap.map(item =>
    `try{JsBarcode(document.getElementById("${item.id}"),"${item.val}",{format:"CODE128",width:1.2,height:35,displayValue:false});}catch(e){}`
  ).join('\n');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">`
    + `<title>Dokumen Gadai ${r.noFaktur}</title>`
    + `<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script>`
    + `<style>${BASE_CSS}</style></head><body>`
    + `<div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button>`
    + `<button onclick="window.close()" style="padding:6px 16px">✕ Tutup</button>`
    + `&nbsp;&nbsp;<small>Total 4 lembar | Barcode A: <b>${r.barcodeA}</b> | Barcode B: <b>${r.barcodeB}</b></small></div>`
    + pages.join('')
    + `<script>window.onload=function(){${bcScript}};<\/script>`
    + `</body></html>`;
}

// ════════════════════════════════════════════════════════════
// 2. NOTA TEBUS / PERPANJANG / TAMBAH / KURANG / SITA / JUAL
//    Replika dari printTebusDoc() di tebus.html
// ════════════════════════════════════════════════════════════
export interface TebusData {
  idTebus: string; noFaktur: string; status: string;
  tglGadai: string; tglTebus: string; tglJTBaru?: string;
  namaNasabah: string; noKtp?: string; telp1?: string;
  kategori: string; barang: string; locationGudang?: string;
  jumlahGadai: number; ujrahBerjalan: number; hariAktual: number;
  totalTebusSistem: number; jumlahBayar: number;
  selisih: number; alasan?: string; idDiskon?: string;
  payment: string; cash?: number; bank?: number;
  kasir: string; outlet: string; alamat: string; kota: string; telpon: string;
  namaPerusahaan: string; waktuOperasional: string;
  tanpaSurat?: boolean; idKehilangan?: string;
}

export function buildTebusHtml(r: TebusData): string {
  const statusLabel: Record<string, string> = {
    'TEBUS':'PENEBUSAN', 'PERPANJANG':'PERPANJANGAN', 'TAMBAH':'PENAMBAHAN',
    'KURANG':'PENGURANGAN', 'SITA':'PENYITAAN', 'JUAL':'PENJUALAN',
  };
  const label = statusLabel[r.status] || r.status;
  const tglCetak = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  const alamat = `${r.alamat || 'Jl. Medan - Banda Aceh No.19, Biruen'}. Telepon/Wa: ${r.telpon || '0812307111'}`;

  function nota(lembar: string): string {
    return `<div class="page">`
      + `<div style="text-align:center;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:8px">`
      + `<div style="font-size:14px;font-weight:bold">NOTA PENEBUSAN BARANG</div>`
      + `<div style="font-size:13px;font-weight:bold">ACEH GADAI SYARIAH</div>`
      + `<div style="font-size:9px">Alamat: ${alamat}</div>`
      + `</div>`
      + `<table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:12px"><tbody>`
      + `<tr><td style="padding:3px 6px;width:45%">No Pelunasan</td><td style="padding:3px 6px">: <b>${r.idTebus || ''}</b></td></tr>`
      + `<tr><td style="padding:3px 6px">No Faktur (SBR)</td><td style="padding:3px 6px">: ${r.noFaktur || ''}</td></tr>`
      + `<tr><td style="padding:3px 6px">Tanggal Gadai</td><td style="padding:3px 6px">: ${r.tglGadai || ''}</td></tr>`
      + `<tr><td style="padding:3px 6px">Tanggal Pelunasan</td><td style="padding:3px 6px">: ${r.tglTebus || tglCetak}</td></tr>`
      + `<tr><td style="padding:3px 6px">Nama Nasabah</td><td style="padding:3px 6px">: <b>${r.namaNasabah || ''}</b></td></tr>`
      + `<tr><td style="padding:3px 6px">Barang</td><td style="padding:3px 6px">: ${r.kategori || ''} / ${r.barang || ''}</td></tr>`
      + (r.locationGudang ? `<tr><td style="padding:3px 6px;font-weight:bold">Lokasi Rak</td><td style="padding:3px 6px;font-weight:bold">: ${r.locationGudang || '—'}</td></tr>` : '')
      + `<tr><td style="padding:3px 6px">Jumlah Pinjaman</td><td style="padding:3px 6px">: ${fmtRpPlain(r.jumlahGadai)}</td></tr>`
      + `<tr><td style="padding:3px 6px">Ujrah</td><td style="padding:3px 6px">: ${fmtRpPlain(r.ujrahBerjalan)} (${r.hariAktual} hari)</td></tr>`
      + (r.selisih > 0 ? `<tr><td style="padding:3px 6px;color:green">Diskon</td><td style="padding:3px 6px;color:green">: ${fmtRpPlain(r.selisih)}${r.alasan ? ` (${r.alasan})` : ''}</td></tr>` : '')
      + `<tr style="border-top:2px solid #000;font-weight:bold"><td style="padding:3px 6px">Total Pembayaran</td><td style="padding:3px 6px;font-size:12px">: ${fmtRpPlain(r.jumlahBayar)}</td></tr>`
      + `<tr><td style="padding:3px 6px">Kasir</td><td style="padding:3px 6px">: ${r.kasir || ''}</td></tr>`
      + `<tr><td style="padding:3px 6px">Status</td><td style="padding:3px 6px">: <b>${label}</b></td></tr>`
      + (r.tanpaSurat ? `<tr><td style="padding:3px 6px;color:red" colspan="2">⚠️ Transaksi tanpa surat kontrak asli</td></tr>` : '')
      + `</tbody></table>`
      + `<div style="font-size:9px;font-style:italic;margin-bottom:16px">Barang telah diperiksa dan cocok dengan surat akad ijarah dan telah diserah terimakan kepada nasabah yg diberikan hak dengan baik serta keadaan masih bersegel.</div>`
      + `<div style="display:flex;margin-top:20px;font-size:10px">`
      + `<div style="flex:1;text-align:center">Petugas<br><br><br><br><span style="border-top:1px solid #000;padding-top:3px">${r.kasir || ''}</span></div>`
      + `<div style="flex:1;text-align:center">Nasabah<br><br><br><br><span style="border-top:1px solid #000;padding-top:3px">${r.namaNasabah || ''}</span></div>`
      + `</div>`
      + `<div style="text-align:right;font-size:9px;margin-top:8px">*) Lembar ${lembar}</div>`
      + `</div>`;
  }

  function suratKehilangan(): string {
    if (!r.tanpaSurat) return '';
    const noKHL = r.idKehilangan ? `No. ${r.idKehilangan}` : '';
    return `<div class="page">`
      + `<div style="display:flex;justify-content:flex-end;margin-bottom:4px"><span style="font-size:10px;font-family:monospace">${noKHL}</span></div>`
      + `<div style="text-align:center;font-size:15px;font-weight:bold;margin:10px 0 16px">SURAT PERNYATAAN KEHILANGAN SURAT GADAI</div>`
      + `<p style="font-size:10px;margin-bottom:12px">Saya yang bertanda tangan di bawah ini :</p>`
      + `<table style="font-size:10px;border-collapse:collapse;margin-bottom:16px;width:100%"><tbody>`
      + `<tr><td style="padding:3px 0;width:120px">Nama</td><td style="padding:3px 0">: <b>${r.namaNasabah || ''}</b></td></tr>`
      + `<tr><td style="padding:3px 0">NIK</td><td style="padding:3px 0">: ${r.noKtp || ''}</td></tr>`
      + `<tr><td style="padding:3px 0">Nomor HP</td><td style="padding:3px 0">: ${r.telp1 || ''}</td></tr>`
      + `</tbody></table>`
      + `<p style="font-size:10px;margin-bottom:8px">Dengan ini menyatakan bahwa saya adalah pemilik sah atas barang gadai dengan rincian sebagai berikut:</p>`
      + `<table style="font-size:10px;border-collapse:collapse;margin-bottom:16px"><tbody>`
      + `<tr><td style="padding:2px 0;width:220px">- Nomor Transaksi / No. Surat Gadai</td><td style="padding:2px 0">: ${r.noFaktur || ''}</td></tr>`
      + `<tr><td style="padding:2px 0">- Tanggal Gadai</td><td style="padding:2px 0">: ${r.tglGadai || r.tglTebus || '-'}</td></tr>`
      + `<tr><td style="padding:2px 0">- Jenis Barang Gadai</td><td style="padding:2px 0">: ${r.kategori || ''} / ${r.barang || ''}</td></tr>`
      + `<tr><td style="padding:2px 0">- Jumlah Pinjaman</td><td style="padding:2px 0">: ${fmtRpPlain(r.jumlahGadai)}</td></tr>`
      + `<tr><td style="padding:2px 0">TEBUS</td><td style="padding:2px 0">: ${fmtRpPlain(r.jumlahBayar)}</td></tr>`
      + `</tbody></table>`
      + `<p style="font-size:10px;margin-bottom:16px">Namun, pada saat ini saya kehilangan / tidak membawa surat gadai asli yang diterbitkan oleh PT Aceh Gadai Syariah sehingga saya tidak dapat menyerahkannya saat melakukan penebusan barang.</p>`
      + `<p style="font-size:10px;margin-bottom:8px">Saya menyatakan bahwa:</p>`
      + `<div style="font-size:10px;margin-bottom:16px">`
      + `<p style="margin-bottom:4px">1. Saya benar-benar pemilik sah dari barang tersebut dan merupakan pihak yang menggadaikannya.</p>`
      + `<p style="margin-bottom:4px">2. Saya bersedia menebus barang sesuai dengan ketentuan yang berlaku.</p>`
      + `<p style="margin-bottom:4px">3. Saya bertanggung jawab penuh apabila di kemudian hari timbul permasalahan hukum terkait dengan barang ini.</p>`
      + `<p style="margin-bottom:4px">4. Saya membebaskan [ACEH GADAI SYARIAH] dari segala bentuk tuntutan pihak ketiga atas penyerahan barang ini kepada saya.</p>`
      + `<p style="margin-bottom:4px">5. Apabila di kemudian hari terbukti bahwa pernyataan ini tidak benar, saya bersedia dituntut sesuai dengan hukum yang berlaku di Republik Indonesia.</p>`
      + `</div>`
      + `<p style="font-size:10px;margin-bottom:20px">Demikian surat pernyataan ini saya buat dengan sebenarnya, dalam keadaan sadar, tanpa tekanan dari pihak manapun.</p>`
      + `<div style="display:flex;margin-top:30px;font-size:10px">`
      + `<div style="flex:1">Yang membuat pernyataan :<br><br><br><br><br>`
      + `<span style="border-top:1px solid #000;padding-top:3px">${r.namaNasabah || ''}</span></div>`
      + `<div style="flex:1;text-align:center">disetujui oleh:<br><br><div style="font-weight:bold;font-size:12px">ACEH GADAI SYARIAH</div><br>`
      + `<span style="border-top:1px solid #000;padding-top:3px">${r.kasir || ''}</span></div>`
      + `</div></div>`;
  }

  function suratDiskon(): string {
    if ((parseFloat(String(r.selisih || 0))) <= 9000) return '';
    const noDiskon = r.idDiskon ? `No : ${r.idDiskon}` : '';
    const selisihVal = parseFloat(String(r.selisih || 0));
    const tglKota = `${r.kota || 'Lhokseumawe'}, ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })}`;
    return `<div class="page">`
      + `<div style="text-align:right;font-size:11px;font-family:monospace;margin-bottom:4px">${noDiskon}</div>`
      + `<div style="text-align:center;margin-bottom:16px">`
      + `<div style="font-size:14px;font-weight:bold;text-transform:uppercase">SURAT PERNYATAAN PERMOHONAN DISKON UJRAH</div>`
      + `<div style="font-size:11px;margin-top:4px">PT ACEH GADAI SYARIAH</div>`
      + `</div>`
      + `<p style="font-size:10px;margin-bottom:12px">Saya yang bertanda tangan di bawah ini:</p>`
      + `<table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:16px"><tbody>`
      + `<tr><td style="padding:3px 0;width:160px">Nama</td><td style="padding:3px 0">: <b>${r.namaNasabah || ''}</b></td></tr>`
      + `<tr><td style="padding:3px 0">No KTP</td><td style="padding:3px 0">: ${r.noKtp || ''}</td></tr>`
      + `<tr><td style="padding:3px 0">No Faktur</td><td style="padding:3px 0">: ${r.noFaktur || ''}</td></tr>`
      + `<tr><td style="padding:3px 0">Jumlah pinjaman</td><td style="padding:3px 0">: ${fmtRpPlain(r.jumlahGadai)}</td></tr>`
      + `<tr><td style="padding:3px 0">Ujrah berjalan</td><td style="padding:3px 0">: ${fmtRpPlain(r.ujrahBerjalan)}</td></tr>`
      + `<tr><td style="padding:3px 0">Lama masa titip</td><td style="padding:3px 0">: ${r.hariAktual || '-'} Hari</td></tr>`
      + `<tr><td style="padding:3px 0">Besaran potongan ujrah</td><td style="padding:3px 0">: <b>${fmtRpPlain(selisihVal)}</b></td></tr>`
      + `<tr><td style="padding:3px 0">Total yang dibayarkan</td><td style="padding:3px 0">: <b>${fmtRpPlain(r.jumlahBayar)}</b></td></tr>`
      + `<tr><td style="padding:3px 0">Status</td><td style="padding:3px 0">: ${r.status || ''}</td></tr>`
      + (r.alasan ? `<tr><td style="padding:3px 0">Alasan</td><td style="padding:3px 0">: <i>${r.alasan || ''}</i></td></tr>` : '')
      + `</tbody></table>`
      + `<p style="font-size:10px;margin-bottom:12px">Dengan ini menyatakan bahwa saya secara sadar dan tanpa paksaan dari pihak manapun, memohon keringanan/diskon biaya ujrah atas transaksi saya di PT ACEH GADAI SYARIAH.</p>`
      + `<p style="font-size:10px;margin-bottom:20px">Demikian surat pernyataan ini saya buat dengan sebenar-benarnya untuk digunakan sebagaimana mestinya.</p>`
      + `<div style="display:flex;font-size:10px">`
      + `<div style="flex:1;text-align:center"><div style="margin-bottom:55px">${tglKota}</div>`
      + `<div style="margin-bottom:6px">Konsumen</div>`
      + `<div style="border-top:1px solid #000;padding-top:4px">${r.namaNasabah || ''}</div></div>`
      + `<div style="flex:1;text-align:center"><div style="margin-bottom:55px">&nbsp;</div>`
      + `<div style="margin-bottom:4px">PT ACEH GADAI SYARIAH</div>`
      + `<div style="font-weight:bold">Teller</div>`
      + `<div style="border-top:1px solid #000;padding-top:4px;margin-top:36px">${r.kasir || ''}</div></div>`
      + `</div></div>`;
  }

  const pages = nota('Nasabah') + nota('Perusahaan') + suratKehilangan() + suratDiskon();

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Nota ${label} ${r.noFaktur || ''}</title>`
    + `<style>${NOTA_CSS}</style></head><body>`
    + `<div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button>`
    + `<button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button></div>`
    + pages
    + `</body></html>`;
}

// ════════════════════════════════════════════════════════════
// 3. BON RINGKASAN (untuk backup storage)
//    Replika dari buildBonDriveHTML_* di GAS
//    Format tabel sederhana, tidak perlu barcode
// ════════════════════════════════════════════════════════════
export function buildBonHtml(tipe: string, data: Record<string, unknown>): string {
  const colorMap: Record<string, string> = {
    GADAI:'#2563eb', SJB:'#d97706', TEBUS:'#059669', PERPANJANG:'#2563eb',
    TAMBAH:'#7c3aed', KURANG:'#d97706', JUAL:'#dc2626', SITA:'#6b7280', BUYBACK:'#0891b2',
  };
  const color = colorMap[tipe.toUpperCase()] || '#333';
  const now   = new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
  const noFaktur = String(data.noFaktur ?? data.noSJB ?? '');

  let rows: [string, string][] = [];
  if (tipe === 'GADAI') {
    rows = [
      ['No Faktur', noFaktur], ['Tgl Gadai', String(data.tglGadai??'')],
      ['Jatuh Tempo', String(data.tglJT??'')], ['Tgl Sita', String(data.tglSita??'')],
      ['Nama Nasabah', String(data.nama??'')], ['No KTP', String(data.noKtp??'')],
      ['Telepon 1', String(data.telp1??'')], ['Telepon 2', String(data.telp2??'')],
      ['Kategori', String(data.kategori??'')], ['Barang', String(data.barang??'')],
      ['Kelengkapan', String(data.kelengkapan??'')], ['Grade', String(data.grade??'')],
      ['IMEI/SN', String(data.imeiSn??'')], ['Taksiran', fmtRpPlain(Number(data.taksiran))],
      ['Jumlah Gadai', fmtRpPlain(Number(data.jumlahGadai))],
      ['Ujrah', fmtRpPlain(Number(data.ujrahNominal))],
      ['Biaya Admin', fmtRpPlain(Number(data.biayaAdmin??10000))],
      ['Payment', String(data.payment??'')], ['Barcode A', String(data.barcodeA??'')],
      ['Barcode B', String(data.barcodeB??'')], ['Lokasi Rak', String(data.locationGudang??'')],
      ['Kasir', String(data.kasir??'')], ['Outlet', String(data.outlet??'')],
    ];
  } else if (tipe === 'SJB') {
    rows = [
      ['No SJB', noFaktur], ['Tgl Akad', String(data.tglJual??'')],
      ['Jatuh Tempo', String(data.tglJT??'')],
      ['Nama Nasabah', String(data.nama??'')], ['No KTP', String(data.noKtp??'')],
      ['Telepon', String(data.telp1??'')],
      ['Kategori', String(data.kategori??'')], ['Barang', String(data.barang??'')],
      ['Grade', String(data.grade??'')], ['IMEI/SN', String(data.imeiSn??'')],
      ['Harga Jual', fmtRpPlain(Number(data.hargaJual))],
      ['Harga Buyback', fmtRpPlain(Number(data.hargaBuyback))],
      ['Lama Titip', `${data.lamaTitip ?? ''} hari`],
      ['Payment', String(data.payment??'')], ['Barcode A', String(data.barcodeA??'')],
      ['Lokasi Rak', String(data.locationGudang??'')],
      ['Kasir', String(data.kasir??'')], ['Outlet', String(data.outlet??'')],
    ];
  } else {
    // TEBUS / PERPANJANG / TAMBAH / KURANG / JUAL / SITA / BUYBACK
    rows = [
      ['ID Tebus', String(data.idTebus??'')], ['No Faktur', noFaktur],
      ['Status', tipe], ['Tgl Transaksi', String(data.tglTebus??'')],
      ['Nama Nasabah', String(data.namaNasabah??data.nama??'')],
      ['Kategori', String(data.kategori??'')], ['Barang', String(data.barang??'')],
      ['Jumlah Gadai Lama', fmtRpPlain(Number(data.jumlahGadai))],
      ['Jumlah Gadai Baru', data.jumlahGadaiBaru ? fmtRpPlain(Number(data.jumlahGadaiBaru)) : '-'],
      ['Ujrah Berjalan', fmtRpPlain(Number(data.ujrahBerjalan))],
      ['Total Tebus Sistem', fmtRpPlain(Number(data.totalTebusSistem))],
      ['Jumlah Bayar', fmtRpPlain(Number(data.jumlahBayar))],
      ['Diskon', data.selisih && Number(data.selisih) > 0 ? fmtRpPlain(Number(data.selisih)) : '-'],
      ['Payment', String(data.payment??'')],
      ['Tgl JT Baru', String(data.tglJTBaru??'-')],
      ['Kasir', String(data.kasir??'')], ['Outlet', String(data.outlet??'')],
    ];
  }

  const tblRows = rows.map(([label, val]) =>
    `<tr><td style="padding:3px 8px;border:1px solid #ddd;font-weight:bold;width:170px">${label}</td>`
    + `<td style="padding:3px 8px;border:1px solid #ddd">${val}</td></tr>`
  ).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">`
    + `<title>BON ${tipe} ${noFaktur}</title>`
    + `<style>body{font-family:Arial,sans-serif;font-size:12px;padding:20px}`
    + `h2{font-size:15px;margin-bottom:4px}table{border-collapse:collapse;width:100%}</style></head><body>`
    + `<h2>BON <span style="color:${color}">${tipe}</span> — ACEH GADAI SYARIAH</h2>`
    + `<p style="font-size:11px;color:#666;margin-bottom:10px">Disimpan otomatis: ${now}</p>`
    + `<table>${tblRows}</table></body></html>`;
}
