// ============================================================
// ACEH GADAI SYARIAH - Client-side Print Utility (COMPLETE)
// File: lib/print.ts
// Semua print functions dari GAS, kata per kata
// Header menggunakan outlet settings (alamat, telepon, kota)
// ============================================================

const fmtRp = (v: number | string) => 'Rp\u00a0' + (parseFloat(String(v || 0)) || 0).toLocaleString('id-ID');
const fmtTgl = (v: string) => {
  if (!v) return '\u2014';
  const d = new Date(v);
  return isNaN(d.getTime()) ? v : d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
const todayLong = () => {
  const d = new Date();
  const hari = ['Minggu','Senin','Selasa','Rabu','Kamis','Jumat','Sabtu'][d.getDay()];
  return hari + ', ' + d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

function openPrintWindow(html: string) {
  const win = window.open('', '_blank', 'width=900,height=700,scrollbars=yes');
  if (!win) { alert('Izinkan popup untuk halaman ini agar bisa mencetak.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 600);
}

const BASE_CSS = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:Arial,sans-serif;background:#ccc;padding:10px}.noprint{margin-bottom:10px;background:#fff;padding:8px;border-radius:4px}.page{background:#fff;width:210mm;min-height:297mm;padding:12mm 15mm;margin:0 auto 10px}.page:not(:last-child){page-break-after:always}.page:last-child{page-break-after:avoid}.page-half{background:#fff;width:210mm;min-height:148mm;padding:15mm;margin:0 auto 10px;page-break-after:always}.page-half:last-child{page-break-after:avoid}p{margin-bottom:3px}@media print{body{background:#fff;padding:0}.noprint{display:none}.page,.page-half{margin:0;padding:12mm 15mm}.page:not(:last-child),.page-half:not(:last-child){page-break-after:always}.page:last-child,.page-half:last-child{page-break-after:avoid}}`;

// ── SHARED ADDENDUM TEXTS ─────────────────────────────────────
function getAddendumTexts(isEmas: boolean) {
  const addIjarahHP_L = `<p><b>1.</b> MUSTA'JIR menyewa MA'JUR (Tempat Penyimpanan/Gudang) milik MUA'JIR.</p><p><b>2.</b> MUSTA'JIR menyatakan tunduk dan mengikuti segala Peraturan yang berlaku di MUA'JIR dan setuju dikenakan ujrah (Sewa Penyimpanan), dengan ketentuan tarif ujrah yang Berlaku di MUA'JIR atau sebesar yang tertuang dalam SURAT BUKTI RAHN(akad rahn)</p><p><b>3.</b> Tarif ujrah per 5 (lima) hari, untuk 1(satu) hari sampai Dengan 5 (lima) hari, dihitung sama dengan 5 (lima) Hari. 6 (enam) hari sampai dengan 10(sepuluh) hari dihitung sama dengan 10 hari,Dst</p><p><b>4.</b> Permintaan penundaan jual dari MUSTA'JIR dapat diberikan Tambahan hari penundaan sesuai ketentuan pada MUA'JIR dan Dikenakan ujrah sesuai dengan akad ijarah dan ketentuan yang Berlaku di MUA'JIR atau sebesar yang tercantum dalam SURAT BUKTI RAHN. Apabila MUSTA'JIR meninggal dan terdapat hak dan Kewajiban terhadap MUA'JIR maupun sebaliknya, maka hak Dan kewajiban tersebut jatuh kepada ahli waris MUSTA'JIR Sesuai dengan ketentuan waris dalam Hukum Republik Indonesia.</p><p><b>5.</b> Segala kerusakan (kondisi) minus di awal rahn bertambah atau semakin rusak saat penebusan maka mua'jir dibebaskan dari tanggung jawab apapun karena barang jaminan di segel dan tidak dibuka sampai musta'jir menebus atau sampai masa jatuh tempo dijual.</p><p><b>6.</b> Apabila saat menebus ditemukan padam/hang/error atau kerusakan tambahan lainnya maka sepenuhnya menjadi tanggung jawab nasabah dan saya tidak menuntut kepada mua'jir di kemudian hari _____________(wajib paraf)</p>`;
  const addIjarahHP_R = `<p><b>7.</b> MUA'JIR memberikan fasilitas pemberitahuan jatuh tempo dan marhun akan di jual kepada nasabah hanya melalui<br>-Via telepon minimal 1 kali (sebelum dijual)<br>-Via WhatsApp minimal 1 kali maksimal 15 kali (sebelum jatuh tempo sampai dijual)<br>Apabila fasilitas tersebut tidak diterima atau nomer telepon MUSTA' JIR salah dan atau tidak dapat dihubungi(tidak dijawab) sampai marhun terjual, sepenuhnya tidak menjadi tanggung jawab MUA'JIR</p><p><b>8.</b> Setiap marhun yang dititipkan melewati waktu dan dijual oleh MUA'JIR , maka segala ketentuan dan kesepakatan kepada pembeli diserahkan sepenuhnya kepada MUA'JIR. Apabila terjadi ketidak sesuaian apapun di kemudian hari dari hasil kesepakatan tersebut, maka MUA'JIR dibebaskan dari tuntutan apapun oleh pihak nasabah _____________(wajib paraf)</p><p><b>9.</b> Dari penjualan marhun maka :<br>a. Jika terdapat uang kelebihan setelah dikurangi ujrah adalah milik MUSTA'JIR, jangka waktu pengambilan uang kelebihan adalah selama satu tahun sejak tanggal penjualan, dan jika lewat dari waktu yang ditentukan, MUSTA'JIR menyatakan sebagai sedekah yang pelaksanaannya diserahkan kepada MUA'JIR.<br>b. Jika tidak mencukupi unruk melunasi kewajiban MUSTA'JIR berupa ujrah maka MUSTA'JIR wajib membayar kekurangan tersebut.</p><p><b>10.</b> Apabila terjadi perselesihan dikemudian hari akan diselesaikan Secara musyawarah untuk mufakat dan apabila tidak tercapai Kesepakatan akan diselesaikan melalui Pengadilan Agama Setempat.</p>`;
  const addIjarahEmas_L = `<p><b>1.</b> MUSTA'JIR menyewa MA'JUR (Tempat Penyimpanan/Gudang) milik MUA'JIR.</p><p><b>2.</b> MUSTA'JIR menyatakan tunduk dan mengikuti segala Peraturan yang berlaku di MUA'JIR dan setuju dikenakan ujrah (Sewa Penyimpanan), dengan ketentuan tarif ujrah yang Berlaku di MUA'JIR atau sebesar yang tertuang dalam SURAT BUKTI RAHN(akad rahn)</p><p><b>3.</b> Biaya pemeliharaan dan penyimpanan emas (ujrah) dihitung perhari sesuai lama masa penyimpanan.</p><p><b>4.</b> Permintaan penundaan jual dari MUSTA'JIR dapat diberikan Tambahan hari penundaan sesuai ketentuan pada MUA'JIR dan Dikenakan ujrah sesuai dengan akad ijarah dan ketentuan yang Berlaku di MUA'JIR atau sebesar yang tercantum dalam SURAT BUKTI RAHN. Apabila MUSTA'JIR meninggal dan terdapat hak dan Kewajiban terhadap MUA'JIR maupun sebaliknya, maka hak Dan kewajiban tersebut jatuh kepada ahli waris MUSTA'JIR Sesuai dengan ketentuan waris dalam Hukum Republik Indonesia.</p><p><b>5.</b> Segala kerusakan (kondisi) minus di awal rahn bertambah atau semakin rusak saat penebusan maka mua'jir dibebaskan dari tanggung jawab apapun karena barang jaminan di segel dan tidak dibuka sampai musta'jir menebus atau sampai masa jatuh tempo dijual.</p><p><b>6.</b> MUA'JIR memberikan fasilitas pemberitahuan jatuh tempo dan marhun akan di jual kepada nasabah hanya melalui<br>-Via telepon minimal 1 kali (sebelum dijual)<br>-Via WhatsApp minimal 1 kali maksimal 15 kali (sebelum jatuh tempo sampai dijual)<br>Apabila fasilitas tersebut tidak diterima atau nomer telepon MUSTA' JIR salah dan atau tidak dapat dihubungi(tidak dijawab) sampai marhun terjual, sepenuhnya tidak menjadi tanggung jawab MUA'JIR</p>`;
  const addIjarahEmas_R = `<p><b>7.</b> Setiap marhun yang dititipkan melewati waktu dan dijual oleh MUA'JIR , maka segala ketentuan dan kesepakatan kepada pembeli diserahkan sepenuhnya kepada MUA'JIR. Apabila terjadi ketidak sesuaian apapun di kemudian hari dari hasil kesepakatan tersebut, maka MUA'JIR dibebaskan dari tuntutan apapun oleh pihak nasabah _____________(wajib paraf)</p><p><b>8.</b> Dari penjualan marhun maka :<br>a. Jika terdapat uang kelebihan setelah dikurangi ujrah adalah milik MUSTA'JIR, jangka waktu pengambilan uang kelebihan adalah selama satu tahun sejak tanggal penjualan, dan jika lewat dari waktu yang ditentukan, MUSTA'JIR menyatakan sebagai sedekah yang pelaksanaannya diserahkan kepada MUA'JIR.<br>b. Jika tidak mencukupi unruk melunasi kewajiban MUSTA'JIR berupa ujrah maka MUSTA'JIR wajib membayar kekurangan tersebut.</p><p><b>9.</b> Apabila terjadi perselesihan dikemudian hari akan diselesaikan Secara musyawarah untuk mufakat dan apabila tidak tercapai Kesepakatan akan diselesaikan melalui Pengadilan Agama Setempat.</p>`;
  const addSBR_L = `<p><b>1.</b> RAHIN menerima dan setuju terhadap uraian Marhun, penetapan taksiran Marhun, Marhun Bih,tarif ujrah, biaya adminitrasi yang tertetara pada Surat Bukti Rahn (Akad Rahn) dan Akad IJARAH sebagai tanda bukti yang sah penerimaan Marhun Bih.</p><p><b>2.</b> Marhun adalah milik RAHIN, milik pihak lain yang dikuasakan kepada RAHIN dan/atau kepemilikan sebagaimana pasal 1977 KUH Perdata dan menjamin bukan dari hasil kejahatan, tidak dalam atau obyek sengketa, dan/atau sita jaminan.</p><p><b>3.</b> RAHIN menyatakan telah berhutang kepada MURTAHIN dan berkewajiban untuk membayar pelunasan Marhun Bih dan ujrah dan biaya proses lelang jika ada.</p><p><b>4.</b> MURTAHIN akan memberikan ganti kerugian apabila Marhun yang berada dalam penguasaan MURTAHIN mengalami kerusakan atau hilang yang disebabkan oleh kelalaian MURTAHIN. Ganti rugi diberikan dalam bentuk uang sebesar taksiran maksimal MARHUN ditambah 25% dan akan diberikan selisih setelah diperhitungkan dengan Marhun Bih sesuai ketentuan penggantian yang berlaku di MURTAHIN. Untuk kenyamanan Bersama, MURTAHIN akan menyegel marhun selama akad rahn dan tidak akan membuka segel sebelum di tebus atau sebelum sampai tanggal jual marhun.${isEmas ? '' : '<br>Untuk itu maka MURTAHIN menyarankan utk marhun berupa barang elektronik saat akan di titipkan disarankan baterai sekurang- kurang nya 50% untuk menghindari marhun tidak bisa hidup saat di tebus. Apabila terjadi kerusakan saat di tebus, pihak MURTAHIN tidak bertanggung jawab karena barang dalam kondisi segel dan tidak dibuka salama masa akad RAHN. MURTAHIN juga tidak bertanggung jawab atas kehilangan data yang ada di barang elektronik yg dititipkan,maka sebaiknya semua data data dibackup oleh RAHIN'}</p><p><b>5.</b> RAHIN dapat mengansur Marhun Bih, menebus sebagian Marhun sebagai akad baru, sedangkan perpanjangan waktu (Rescheduling) tetap menggunakan akad lama yaitu dengan taksiran dan Marhun Bih lama. Jika terjadi penurunan atau kenaikan nilai marhun, maka mengacu kepada ketentuan yang berlaku di MURTAHIN.</p>`;
  const addSBR_R_HP = `<p><b>6.</b> Permintaan penundaan jual dapat dilayani sebelum jatuh tempo dengan memberitahu pihak ACEH GADAI.Penundaan jual Marhun dikenakan biaya sesuai ketentuan yang berlaku di MURTAHIN.</p>`;
  const addSBR_R_EMAS = `<p><b>6.</b> Permintaan penundaan jual dapat dilayani sebelum jatuh tempo dengan memberitahu pihak ACEH GADAI SYARIAH. Penundaan jual Marhun dikenakan biaya sesuai ketentuan yang berlaku di MURTAHIN.</p>`;
  const addSBR_R_common = `<p><b>7.</b> Terhadap Marhun yang telah dilunasi dan belum diambil oleh RAHIN sampai terhitung sejak terjadiya tanggal pelunasan sampai dengan sepuluh hari tidak dikenakan jasa penitipan. Bila telah melebihi sepuluh hari dari tanggal pelunasan, Marhun tetap belum diambil, maka RAHIN sepakat dikenakan jasa penitipan, besaran jasa penitipan sesuai dengan ketentuan yang berlaku di MURTAHIN.</p><p><b>8.</b> Apabila sampai dengan tangal jatuh tempo tidak dilakukan pelunasan, menebus Marhun, mengangsur Marhun Bih, penundaan jual maka MURTAHIN berhak melakukan penjualan Marhun.</p><p><b>9.</b> Hasil penjualan lelang marhun setelah dikurangi Marhun Bih,Ujrah, Biaya Proses jual (jika ada), Merupakan kelebihan yang menjadi hak RAHIN. Jangka waktu pengambilan uang kelebihan selama satu tahun sejak tanggal laku lelang, dan jika lewat dari jangka pengambilan uang kelebihan, RAHIN menyatakan setuju untuk menyalurkan uang kelebihan lelang tersebut sebagai sedekah yang pelaksanaanya diserahkan kepada MURTAHIN. Jika hasil penjualan Marhun tidak mencukupi melunasi kewajiban RAHIN berupa Marhun Bih, Ujrah, Biaya proses jual (jika ada) dan maka akan ditanggung oleh MURTAHIN.</p>`;
  return { addIjarahHP_L, addIjarahHP_R, addIjarahEmas_L, addIjarahEmas_R, addSBR_L, addSBR_R_HP, addSBR_R_EMAS, addSBR_R_common };
}

function addendumHtml(left: string, right: string) {
  return `<div style="display:flex;gap:16px;margin-top:8px"><div style="flex:1;font-size:8.5px;line-height:1.4">${left}</div><div style="flex:1;font-size:8.5px;line-height:1.4">${right}</div></div>`;
}

// ════════════════════════════════════════════════════════════
// 1. CETAK SURAT KONTRAK GADAI (4 lembar A4)
//    Replika printGadaiDoc() dari gadai.html
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

// ── Shared builder: generates 4 A4 pages HTML string + barcode map ──
// Used by both printGadai() and kontrak baru in printTebus()
export function buildGadaiPages(r: GadaiPrintData, bcIdPrefix = 'bc'): { html: string; bcMap: {id:string;val:string}[] } {
  const isEmas = ['EMAS', 'EMAS PAUN'].includes((r.kategori || '').toUpperCase());
  const ujrahNom = parseFloat(String(r.ujrahNominal || 0));
  const ad = getAddendumTexts(isEmas);

  let bd: number[] | null = null;
  if (!isEmas && ujrahNom > 0) {
    const pp = Math.ceil(ujrahNom / 6 / 1000) * 1000;
    bd = [1,2,3,4,5,6].map(i => pp * i);
  }
  const ujrahPerHariVal = isEmas ? Math.ceil(ujrahNom / 30 / 1000) * 1000 : 0;

  let bcCtr = 0;
  const bcMap: {id:string;val:string}[] = [];

  function hdr(judul: string, barcode: string) {
    bcCtr++;
    const bcId = `${bcIdPrefix}-${bcCtr}`;
    bcMap.push({id:bcId,val:barcode});
    const isBcB = barcode === r.barcodeB;
    const rak = isBcB && r.locationGudang && r.locationGudang !== '\u2014'
      ? `<div style="margin-top:4px;font-size:26px;font-weight:900;letter-spacing:3px;border:2px solid #000;padding:3px 8px;display:inline-block">${r.locationGudang}</div>` : '';
    return `<div style="display:flex;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:6px;margin-bottom:8px">`
      +`<div style="width:60px;min-width:60px;text-align:center"><div style="border:1px solid #000;width:50px;height:50px;margin:auto;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:bold">AG</div></div>`
      +`<div style="flex:1;text-align:center"><div style="font-size:13px;font-weight:bold">${judul}</div><div style="font-size:12px;font-weight:bold">${r.namaPerusahaan||'ACEH GADAI SYARIAH'}</div><div style="font-size:9px">Alamat: ${r.alamat||''} | Telp/WA: ${r.telpon||''}</div><div style="font-size:9px">Waktu Operasional Kerja: ${r.waktuOperasional||''}</div></div>`
      +`<div style="text-align:right;min-width:130px"><svg id="${bcId}" style="height:40px"></svg><div style="font-size:9px">${barcode}</div>${rak}</div></div>`
      +`<div style="display:flex;justify-content:flex-end;font-size:10px;margin-bottom:6px"><span style="border:1px solid #000;padding:2px 8px"><b>No. SBR :</b>&nbsp;&nbsp;${r.noFaktur}</span></div>`;
  }

  function bodyData(akad: string) {
    const penanda = akad==='ijarah'
      ? `Kami yang bertanda tangan pada Surat AKAD IJARAH ini, yakni MUA'JIR (Pemberi sewa dalam hal ini PT. ACEH GADAI SYARIAH), dan`
      : `Kami yang bertanda tangan di bawah ini pada Surat Bukti Rahn (SBR) ini.<br>Yakni MURTAHIN (Penerima Gadai dalam hal ini PT ACEH GADAI SYARIAH) Dan`;
    const peran = akad==='ijarah'
      ? `Dalam hal ini sebagai MUSTA'JIR (Penyewa atau kuasa dari marhun)`
      : `Sebagai RAHIN ( pemilik Marhun atau kuasa dari pemilik Marhun),`;
    let h = `<p style="font-size:9px;margin:0 0 6px">${penanda}</p>`;
    h += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px"><tbody>`;
    h += `<tr><td style="padding:1px 4px;width:160px">Nama</td><td style="padding:1px 4px">: <b>${r.nama}</b></td></tr>`;
    h += `<tr><td style="padding:1px 4px">No. Identitas</td><td style="padding:1px 4px">: ${r.noKtp||'\u2014'}</td></tr>`;
    h += `<tr><td style="padding:1px 4px">No. Handphone</td><td style="padding:1px 4px">: ${r.telp1||'\u2014'}${r.telp2?' / '+r.telp2:''}</td></tr>`;
    h += `</tbody></table><p style="font-size:9px;margin:0 0 4px">${peran}</p>`;
    h += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:2px"><tbody><tr>`;
    h += `<td style="padding:1px 4px;width:80px">Kategori</td><td style="padding:1px 4px;width:130px">: <b>${r.kategori}</b></td>`;
    h += `<td style="padding:1px 4px;width:60px">Barang</td><td style="padding:1px 4px">: ${r.barang}</td>`;
    h += isEmas ? `<td style="padding:1px 4px;width:40px">Berat</td><td style="padding:1px 4px;width:70px">: ${r.grade||''} Gram</td>` : `<td style="padding:1px 4px;width:40px">Grade</td><td style="padding:1px 4px;width:70px">: ${r.grade||''}</td>`;
    h += `</tr><tr>`;
    h += isEmas ? `<td style="padding:1px 4px">Kadar</td><td style="padding:1px 4px">: ${r.imeiSn||''}</td>` : `<td style="padding:1px 4px">IMEI/SN</td><td style="padding:1px 4px">: ${r.imeiSn||''}</td>`;
    h += `<td style="padding:1px 4px">Kelengkapan</td><td style="padding:1px 4px" colspan="3">: ${r.kelengkapan||''}</td></tr></tbody></table>`;
    h += `<p style="font-size:9px;margin:4px 0 2px">Dengan</p>`;
    h += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px"><tbody>`;
    h += `<tr><td style="padding:1px 4px;width:170px">Taksiran maksimal MARHUN</td><td style="padding:1px 4px;width:130px">: ${fmtRp(r.taksiran)}</td><td style="padding:1px 4px;width:90px">Biaya Admin</td><td style="padding:1px 4px">: <b>${fmtRp(r.biayaAdmin||10000)}</b></td></tr>`;
    h += `<tr><td style="padding:1px 4px">MARHUN BIH (pinjaman)</td><td style="padding:1px 4px">: ${fmtRp(r.jumlahGadai)}</td><td style="padding:1px 4px">Tanggal Jatuh Tempo</td><td style="padding:1px 4px">: <b>${fmtTgl(r.tglJT)}</b></td></tr>`;
    h += `<tr><td></td><td></td><td style="padding:1px 4px">Tanggal Marhun dijual</td><td style="padding:1px 4px">: <b>${fmtTgl(r.tglSita)}</b></td></tr></tbody></table>`;
    if (isEmas) { h += `<table style="width:100%;border-collapse:collapse;font-size:9px;margin-bottom:4px"><tbody><tr><td style="padding:1px 4px">Biaya pemeliharaan dan penyimpanan emas (ujrah) / hari :</td><td style="padding:1px 4px;font-weight:bold">${fmtRp(ujrahPerHariVal)}</td></tr></tbody></table>`; }
    else if (bd) { h += `<p style="font-size:9px;font-weight:bold;margin:4px 0 2px">Biaya ujrah</p><table style="font-size:9px;border-collapse:collapse;margin-bottom:4px"><tbody><tr><td style="padding:1px 6px;white-space:nowrap">1-5 hari : <b>${fmtRp(bd[0])}</b></td><td style="padding:1px 6px;white-space:nowrap">6-10 hari : <b>${fmtRp(bd[1])}</b></td><td style="padding:1px 6px;white-space:nowrap">11-15 hari : <b>${fmtRp(bd[2])}</b></td></tr><tr><td style="padding:1px 6px;white-space:nowrap">16-20 hari: <b>${fmtRp(bd[3])}</b></td><td style="padding:1px 6px;white-space:nowrap">21-25 hari: <b>${fmtRp(bd[4])}</b></td><td style="padding:1px 6px;white-space:nowrap">26-30 hari: <b>${fmtRp(bd[5])}</b></td></tr></tbody></table>`; }
    return h;
  }

  function footerIjarah(lembar: string) {
    return `<div style="font-size:9px;margin-top:10px">Demikian akad ijarah yang berlaku antara MUA'JIR dan MUSTA'JIR Sejak Surat Bukti Rahn (SBR) ini ditandatangani oleh kedua belah Pihak pada kolom yang tersedia.</div><div style="display:flex;margin-top:16px;font-size:9px"><div style="flex:1;text-align:center">Disepakati, ${r.kota||''}<br><br><b>MUA'JIR</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.namaPerusahaan||'PT ACEH GADAI SYARIAH'}</span></div><div style="flex:1;text-align:center"><br><br><b>MUSTA'JIR</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.nama}</span></div></div><div style="text-align:right;font-size:8px;margin-top:4px">*) Lembar ${lembar}</div>`;
  }
  function footerSBR(lembar: string) {
    return `<div style="font-size:9px;margin-top:10px">Demikian Akad Rahn ini berlaku dan mengikat MURTAHIN dengan RAHIN sejak Surat Bukti Rahn atau (SBR) ini ditanda tangani oleh kedua belah pihak pada kolom yang tersedia.</div><div style="display:flex;margin-top:16px;font-size:9px"><div style="flex:1;text-align:center">Disepakati, ${r.kota||''}<br><br><b>MURTAHIN</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.namaPerusahaan||'PT ACEH GADAI SYARIAH'}</span></div><div style="flex:1;text-align:center"><br><br><b>RAHIN</b><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px;font-size:8px">${r.nama}</span></div></div><div style="text-align:right;font-size:8px;margin-top:4px">*) Lembar ${lembar}</div>`;
  }

  function page(barcode: string, akad: 'ijarah'|'sbr', lembar: string) {
    const judul = akad==='ijarah' ? 'AKAD IJARAH (SEWA PENYIMPANAN)' : 'SURAT BUKTI RAHN(AKAD RAHN)';
    const sepakat = akad==='ijarah' ? 'Sepakat membuat Akad ijarah sebagai berikut:' : 'Sepakat membuat akad rahn sebagai berikut :';
    let addL: string, addR: string, ft: string;
    if (akad==='ijarah') { addL=isEmas?ad.addIjarahEmas_L:ad.addIjarahHP_L; addR=isEmas?ad.addIjarahEmas_R:ad.addIjarahHP_R; ft=footerIjarah(lembar); }
    else { addL=ad.addSBR_L; addR=(isEmas?ad.addSBR_R_EMAS:ad.addSBR_R_HP)+ad.addSBR_R_common; ft=footerSBR(lembar); }
    return `<div class="page">${hdr(judul,barcode)}${bodyData(akad)}<p style="font-size:9px;margin:4px 0">${sepakat}</p><p style="font-weight:bold;font-size:10px;text-align:right;margin-top:6px">ADDENDUM</p>${addendumHtml(addL,addR)}${ft}</div>`;
  }

  const pagesHtml = [page(r.barcodeA,'ijarah','Customer'),page(r.barcodeA,'sbr','Customer'),page(r.barcodeB,'ijarah','Perusahaan'),page(r.barcodeB,'sbr','Perusahaan')].join('');
  return { html: pagesHtml, bcMap };
}

export function printGadai(r: GadaiPrintData) {
  const { html, bcMap } = buildGadaiPages(r);
  const bcScript = bcMap.map(b=>`try{JsBarcode(document.getElementById("${b.id}"),"${b.val}",{format:"CODE128",width:1.2,height:35,displayValue:false});}catch(e){}`).join('\n');
  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dokumen Gadai ${r.noFaktur}</title><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script><style>${BASE_CSS}</style></head><body><div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button><button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button>&nbsp;&nbsp;<small>4 lembar | Barcode A: <b>${r.barcodeA}</b> | Barcode B: <b>${r.barcodeB}</b></small></div>${html}<script>window.onload=function(){${bcScript}};<\/script></body></html>`);
}

// ════════════════════════════════════════════════════════════
// 2. CETAK NOTA TEBUS + SURAT KEHILANGAN + SURAT DISKON
//    + KONTRAK BARU (PERPANJANG/TAMBAH/KURANG)
//    Replika printTebusDoc() + printKontrakBaruHtml() dari tebus.html
// ════════════════════════════════════════════════════════════
export interface TebusPrintData {
  idTebus: string; noFaktur: string; status: string;
  tglGadai?: string; tglTebus: string; namaNasabah: string; noKtp?: string; telp1?: string;
  kategori: string; barang: string; kelengkapan?: string; grade?: string; imeiSn?: string;
  locationGudang?: string; jumlahGadai: number; ujrahBerjalan: number; hariAktual: number;
  totalTebusSistem: number; jumlahBayar: number; selisih?: number; alasan?: string;
  idDiskon?: string; idKehilangan?: string; tanpaSurat?: boolean;
  payment: string; kasir: string;
  outlet: string; alamat: string; kota: string; telpon: string;
  namaPerusahaan: string; waktuOperasional?: string;
  taksiran?: number;
  // Kontrak baru fields (PERPANJANG/TAMBAH/KURANG)
  cetakKontrak?: boolean; barcodeA?: string; barcodeB?: string;
  tglGadaiBaru?: string; tglJTBaru?: string; tglSitaBaru?: string;
  jumlahGadaiBaru?: number; ujrahBaru?: number;
}

export function printTebus(r: TebusPrintData) {
  const statusLabel: Record<string,string> = {TEBUS:'PENEBUSAN',PERPANJANG:'PERPANJANGAN',TAMBAH:'PENAMBAHAN',KURANG:'PENGURANGAN',SITA:'PENYITAAN',JUAL:'PENJUALAN'};
  const label = statusLabel[r.status] || r.status;
  const alamatLine = (r.alamat||'') + '. Telepon/Wa: ' + (r.telpon||'');

  function notaInner(lembar: string) {
    return `<div style="padding:8mm 0"><div style="text-align:center;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:8px"><div style="font-size:14px;font-weight:bold">NOTA PENEBUSAN BARANG</div><div style="font-size:13px;font-weight:bold">${r.namaPerusahaan||'ACEH GADAI SYARIAH'}</div><div style="font-size:9px">Alamat: ${alamatLine}</div></div>`
      +`<table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:12px"><tbody>`
      +`<tr><td style="padding:3px 6px;width:45%">No Pelunasan</td><td style="padding:3px 6px">: <b>${r.idTebus||''}</b></td></tr>`
      +`<tr><td style="padding:3px 6px">No Faktur (SBR)</td><td style="padding:3px 6px">: ${r.noFaktur||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Tanggal Gadai</td><td style="padding:3px 6px">: ${fmtTgl(r.tglGadai||'')}</td></tr>`
      +`<tr><td style="padding:3px 6px">Tanggal Pelunasan</td><td style="padding:3px 6px">: ${r.tglTebus||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Nama Nasabah</td><td style="padding:3px 6px">: <b>${r.namaNasabah||''}</b></td></tr>`
      +`<tr><td style="padding:3px 6px">Barang</td><td style="padding:3px 6px">: ${r.kategori||''} / ${r.barang||''}</td></tr>`
      +(r.locationGudang?`<tr><td style="padding:3px 6px;font-weight:bold">Lokasi Rak</td><td style="padding:3px 6px;font-weight:bold">: ${r.locationGudang}</td></tr>`:'')
      +`<tr><td style="padding:3px 6px">Jumlah Pinjaman</td><td style="padding:3px 6px">: ${fmtRp(r.jumlahGadai)}</td></tr>`
      +`<tr><td style="padding:3px 6px">Ujrah</td><td style="padding:3px 6px">: ${fmtRp(r.ujrahBerjalan)} (${r.hariAktual} hari)</td></tr>`
      +((r.selisih||0)>0?`<tr><td style="padding:3px 6px;color:green">Diskon</td><td style="padding:3px 6px;color:green">: ${fmtRp(r.selisih||0)}${r.alasan?' ('+r.alasan+')':''}</td></tr>`:'')
      +`<tr style="border-top:2px solid #000;font-weight:bold"><td style="padding:3px 6px">Total Pembayaran</td><td style="padding:3px 6px;font-size:12px">: ${fmtRp(r.jumlahBayar)}</td></tr>`
      +`<tr><td style="padding:3px 6px">Kasir</td><td style="padding:3px 6px">: ${r.kasir||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Status</td><td style="padding:3px 6px">: <b>${label}</b></td></tr>`
      +(r.tanpaSurat?`<tr><td style="padding:3px 6px;color:red" colspan="2">⚠️ Transaksi tanpa surat kontrak asli</td></tr>`:'')
      +`</tbody></table>`
      +`<div style="font-size:9px;font-style:italic;margin-bottom:10px">Barang telah diperiksa dan cocok dengan surat akad ijarah dan telah diserah terimakan kepada nasabah yg diberikan hak dengan baik serta keadaan masih bersegel.</div>`
      +`<div style="display:flex;margin-top:12px;font-size:10px"><div style="flex:1;text-align:center">Petugas<br><br><br><span style="border-top:1px solid #000;padding-top:3px">${r.kasir||''}</span></div><div style="flex:1;text-align:center">Nasabah<br><br><br><span style="border-top:1px solid #000;padding-top:3px">${r.namaNasabah||''}</span></div></div>`
      +`<div style="text-align:right;font-size:9px;margin-top:4px">*) Lembar ${lembar}</div></div>`;
  }

  function suratKehilangan() {
    if (!r.tanpaSurat) return '';
    const noKHL = r.idKehilangan ? 'No. '+r.idKehilangan : '';
    return `<div class="page"><div style="display:flex;justify-content:flex-end;margin-bottom:4px"><span style="font-size:10px;font-family:monospace">${noKHL}</span></div>`
      +`<div style="text-align:center;font-size:15px;font-weight:bold;margin:10px 0 16px">SURAT PERNYATAAN KEHILANGAN SURAT GADAI</div>`
      +`<p style="font-size:10px;margin-bottom:12px">Saya yang bertanda tangan di bawah ini :</p>`
      +`<table style="font-size:10px;border-collapse:collapse;margin-bottom:16px;width:100%"><tbody><tr><td style="padding:3px 0;width:120px">Nama</td><td style="padding:3px 0">: <b>${r.namaNasabah||''}</b></td></tr><tr><td style="padding:3px 0">NIK</td><td style="padding:3px 0">: ${r.noKtp||''}</td></tr><tr><td style="padding:3px 0">Nomor HP</td><td style="padding:3px 0">: ${r.telp1||''}</td></tr></tbody></table>`
      +`<p style="font-size:10px;margin-bottom:8px">Dengan ini menyatakan bahwa saya adalah pemilik sah atas barang gadai dengan rincian sebagai berikut:</p>`
      +`<table style="font-size:10px;border-collapse:collapse;margin-bottom:16px"><tbody><tr><td style="padding:2px 0;width:220px">- Nomor Transaksi / No. Surat Gadai</td><td style="padding:2px 0">: ${r.noFaktur||''}</td></tr><tr><td style="padding:2px 0">- Tanggal Gadai</td><td style="padding:2px 0">: ${r.tglGadai||r.tglTebus||'-'}</td></tr><tr><td style="padding:2px 0">- Jenis Barang Gadai</td><td style="padding:2px 0">: ${r.kategori||''} / ${r.barang||''}</td></tr><tr><td style="padding:2px 0">- Jumlah Pinjaman</td><td style="padding:2px 0">: ${fmtRp(r.jumlahGadai)}</td></tr><tr><td style="padding:2px 0">TEBUS</td><td style="padding:2px 0">: ${fmtRp(r.jumlahBayar)}</td></tr></tbody></table>`
      +`<p style="font-size:10px;margin-bottom:16px">Namun, pada saat ini saya kehilangan / tidak membawa surat gadai asli yang diterbitkan oleh PT Aceh Gadai Syariah sehingga saya tidak dapat menyerahkannya saat melakukan penebusan barang.</p>`
      +`<p style="font-size:10px;margin-bottom:8px">Saya menyatakan bahwa:</p>`
      +`<div style="font-size:10px;margin-bottom:16px"><p style="margin-bottom:4px">1. Saya benar-benar pemilik sah dari barang tersebut dan merupakan pihak yang menggadaikannya.</p><p style="margin-bottom:4px">2. Saya bersedia menebus barang sesuai dengan ketentuan yang berlaku.</p><p style="margin-bottom:4px">3. Saya bertanggung jawab penuh apabila di kemudian hari timbul permasalahan hukum terkait dengan barang ini.</p><p style="margin-bottom:4px">4. Saya membebaskan [ACEH GADAI SYARIAH] dari segala bentuk tuntutan pihak ketiga atas penyerahan barang ini kepada saya.</p><p style="margin-bottom:4px">5. Apabila di kemudian hari terbukti bahwa pernyataan ini tidak benar, saya bersedia dituntut sesuai dengan hukum yang berlaku di Republik Indonesia.</p></div>`
      +`<p style="font-size:10px;margin-bottom:20px">Demikian surat pernyataan ini saya buat dengan sebenarnya, dalam keadaan sadar, tanpa tekanan dari pihak manapun.</p>`
      +`<div style="display:flex;margin-top:30px;font-size:10px"><div style="flex:1">Yang membuat pernyataan :<br><br><br><br><br><span style="border-top:1px solid #000;padding-top:3px">${r.namaNasabah||''}</span></div><div style="flex:1;text-align:center">disetujui oleh:<br><br><div style="font-weight:bold;font-size:12px">ACEH GADAI SYARIAH</div><br><span style="border-top:1px solid #000;padding-top:3px">${r.kasir||''}</span></div></div></div>`;
  }

  function suratDiskon() {
    if ((parseFloat(String(r.selisih||0))) <= 9000) return '';
    const noDiskon = r.idDiskon ? 'No : '+r.idDiskon : '';
    const selisihVal = parseFloat(String(r.selisih||0));
    const tglKota = (r.kota||'Lhokseumawe')+', '+new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    return `<div class="page"><div style="text-align:right;font-size:11px;font-family:monospace;margin-bottom:4px">${noDiskon}</div>`
      +`<div style="text-align:center;margin-bottom:16px"><div style="font-size:14px;font-weight:bold;text-transform:uppercase">SURAT PERNYATAAN PERMOHONAN DISKON UJRAH</div><div style="font-size:11px;margin-top:4px">PT ACEH GADAI SYARIAH</div></div>`
      +`<p style="font-size:10px;margin-bottom:12px">Saya yang bertanda tangan di bawah ini:</p>`
      +`<table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:16px"><tbody>`
      +`<tr><td style="padding:3px 0;width:160px">Nama</td><td style="padding:3px 0">: <b>${r.namaNasabah||''}</b></td></tr>`
      +`<tr><td style="padding:3px 0">No KTP</td><td style="padding:3px 0">: ${r.noKtp||''}</td></tr>`
      +`<tr><td style="padding:3px 0">No Faktur</td><td style="padding:3px 0">: ${r.noFaktur||''}</td></tr>`
      +`<tr><td style="padding:3px 0">Jumlah pinjaman</td><td style="padding:3px 0">: ${fmtRp(r.jumlahGadai)}</td></tr>`
      +`<tr><td style="padding:3px 0">Ujrah berjalan</td><td style="padding:3px 0">: ${fmtRp(r.ujrahBerjalan)}</td></tr>`
      +`<tr><td style="padding:3px 0">Lama masa titip</td><td style="padding:3px 0">: ${r.hariAktual||'-'} Hari</td></tr>`
      +`<tr><td style="padding:3px 0">Besaran potongan ujrah</td><td style="padding:3px 0">: <b>${fmtRp(selisihVal)}</b></td></tr>`
      +`<tr><td style="padding:3px 0">Total yang dibayarkan</td><td style="padding:3px 0">: <b>${fmtRp(r.jumlahBayar)}</b></td></tr>`
      +`<tr><td style="padding:3px 0">Status</td><td style="padding:3px 0">: ${r.status||''}</td></tr>`
      +(r.alasan?`<tr><td style="padding:3px 0">Alasan</td><td style="padding:3px 0">: <i>${r.alasan}</i></td></tr>`:'')
      +`</tbody></table>`
      +`<p style="font-size:10px;margin-bottom:12px">Dengan ini menyatakan bahwa saya secara sadar dan tanpa paksaan dari pihak manapun, memohon keringanan/diskon biaya ujrah atas transaksi saya di PT ACEH GADAI SYARIAH.</p>`
      +`<p style="font-size:10px;margin-bottom:20px">Demikian surat pernyataan ini saya buat dengan sebenar-benarnya untuk digunakan sebagaimana mestinya.</p>`
      +`<div style="display:flex;font-size:10px"><div style="flex:1;text-align:center"><div style="margin-bottom:55px">${tglKota}</div><div style="margin-bottom:6px">Konsumen</div><div style="border-top:1px solid #000;padding-top:4px">${r.namaNasabah||''}</div></div><div style="flex:1;text-align:center"><div style="margin-bottom:55px">&nbsp;</div><div style="margin-bottom:4px">PT ACEH GADAI SYARIAH</div><div style="font-weight:bold">Teller</div><div style="border-top:1px solid #000;padding-top:4px;margin-top:36px">${r.kasir||''}</div></div></div></div>`;
  }

  // Kontrak baru untuk PERPANJANG/TAMBAH/KURANG — reuse buildGadaiPages() 
  // agar layout 100% identik dengan kontrak asli
  let kontrakPages = '';
  const kontrakBcMap: {id:string;val:string}[] = [];

  if (r.cetakKontrak && r.barcodeA && r.barcodeB) {
    const jmlGadaiK = (r.jumlahGadaiBaru && r.jumlahGadaiBaru > 0) ? r.jumlahGadaiBaru : r.jumlahGadai;
    const ujrahK = r.ujrahBaru || r.ujrahBerjalan || 0;

    const { html: kbHtml, bcMap: kbBcItems } = buildGadaiPages({
      noFaktur: r.noFaktur,
      tglGadai: r.tglGadaiBaru || r.tglTebus || '',
      tglJT: r.tglJTBaru || '',
      tglSita: r.tglSitaBaru || '',
      nama: r.namaNasabah,
      noKtp: r.noKtp || '',
      telp1: r.telp1 || '',
      kategori: r.kategori,
      barang: r.barang,
      kelengkapan: r.kelengkapan || '',
      grade: r.grade || '',
      imeiSn: r.imeiSn || '',
      taksiran: r.taksiran || 0,
      jumlahGadai: jmlGadaiK,
      ujrahNominal: ujrahK,
      ujrahPersen: 0,
      barcodeA: r.barcodeA,
      barcodeB: r.barcodeB,
      locationGudang: r.locationGudang || '',
      kasir: r.kasir,
      outlet: r.outlet,
      alamat: r.alamat,
      kota: r.kota,
      telpon: r.telpon,
      namaPerusahaan: r.namaPerusahaan,
      waktuOperasional: r.waktuOperasional || '',
    }, 'kb');

    kontrakPages = kbHtml;
    kontrakBcMap.push(...kbBcItems);
  }

  // Nota: 2 nota (Nasabah + Perusahaan) dalam 1 halaman A4
  const notaPage = `<div class="page" style="padding:8mm 15mm">${notaInner('Nasabah')}<div style="border-top:1px dashed #999;margin:4mm 0"></div>${notaInner('Perusahaan')}</div>`;
  const pages = notaPage + suratKehilangan() + suratDiskon();
  const kbBcScript = kontrakBcMap.length > 0
    ? `<script>window.addEventListener('load',function(){${kontrakBcMap.map(b => `try{JsBarcode(document.getElementById("${b.id}"),"${b.val}",{format:"CODE128",width:1.2,height:35,displayValue:false});}catch(e){}`).join('\n')}});<\/script>`
    : '';
  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Nota ${label} ${r.noFaktur||''}</title><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script><style>${BASE_CSS}</style></head><body><div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button><button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button>${r.cetakKontrak?'<span style="font-size:11px;margin-left:12px;color:#888">Termasuk kontrak baru (4 lembar)</span>':''}</div>${pages}${kontrakPages}${kbBcScript}</body></html>`);
}

// ════════════════════════════════════════════════════════════
// 3. CETAK SURAT SJB (2 lembar A4 — Jual Beli Kembali)
//    Replika printSJBDoc() dari jualtitip.html
// ════════════════════════════════════════════════════════════
export interface SJBPrintData {
  noSJB: string; idSJB?: string; nama: string; noKtp?: string; telp1?: string;
  alamatNasabah?: string;
  kategori: string; barang: string; kelengkapan?: string; grade?: string; imeiSn?: string;
  hargaJual: number; hargaBuyback: number; lamaTitip: number;
  tglJual: string; tglJT: string; locationGudang?: string;
  barcodeA: string; barcodeB?: string;
  kasir: string; outlet: string; alamat: string; kota: string;
  telpon: string; namaPerusahaan: string; waktuOperasional?: string;
}

export function printSJB(r: SJBPrintData) {
  const namaPerusahaan = r.namaPerusahaan || 'PT. ACEH GADAI SYARIAH';
  const alamatPerusahaan = r.alamat || '';
  const telponPerusahaan = r.telpon || '';
  const kotaPerusahaan = r.kota || '';
  const hargaJual = parseFloat(String(r.hargaJual || 0));
  const hargaBuyback = parseFloat(String(r.hargaBuyback || 0)) || Math.round(hargaJual * 1.1);
  const lamaTitip = parseInt(String(r.lamaTitip || 30));
  const tglFmt = todayLong();

  let _pgCtr = 0;
  const _bcMap: {id:string;val:string}[] = [];

  function hdr(barcode: string, isPerusahaan: boolean) {
    _pgCtr++;
    const bcId = 'sjb-bc-' + _pgCtr;
    _bcMap.push({id: bcId, val: String(barcode)});
    const rakLabel = isPerusahaan && r.locationGudang && r.locationGudang !== '\u2014'
      ? `<div style="margin-top:5px;font-size:30px;font-weight:900;letter-spacing:4px;border:3px solid #000;padding:4px 12px;display:inline-block">${r.locationGudang}</div>` : '';
    return `<div style="display:flex;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:10px">`
      +`<div style="width:62px;min-width:62px;text-align:center"><div style="border:2px solid #000;width:54px;height:54px;margin:auto;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;line-height:1">AG<br><span style="font-size:8px">SYARIAH</span></div></div>`
      +`<div style="flex:1;text-align:center;padding:0 8px">`
      +`<div style="font-size:14px;font-weight:900;letter-spacing:.5px">SURAT PERJANJIAN JUAL DAN BELI KEMBALI</div>`
      +`<div style="font-size:13px;font-weight:800">${namaPerusahaan}</div>`
      +`<div style="font-size:9px">Telpon / WA Pusat ${telponPerusahaan}</div>`
      +`<div style="font-size:9px">Alamat: ${alamatPerusahaan}. Telepon/Wa: ${telponPerusahaan}</div>`
      +`<div style="font-size:9px">Waktu Operasional Kerja: ${r.waktuOperasional||'Senin-Minggu & Libur Nasional : 10.00 - 22.00 WIB'}</div>`
      +`</div>`
      +`<div style="text-align:right;min-width:120px"><svg id="${bcId}" style="height:40px;display:block;margin-left:auto"></svg><div style="font-size:9px;text-align:right">${barcode}</div>${rakLabel}</div></div>`
      +`<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><div style="border:1px solid #000;padding:3px 14px;font-size:10px"><b>No. Faktur :</b>&nbsp;&nbsp;<b style="font-size:12px">${r.noSJB}</b></div></div>`;
  }

  function page(barcode: string, isPerusahaan: boolean) {
    const lembar = isPerusahaan ? '*) Lembar Perusahaan' : '*) Lembar Customer';
    let h = hdr(barcode, isPerusahaan);
    h += `<p style="font-size:10px;margin-bottom:10px">Pada hari ini <b>${tglFmt}</b> yang bertanda tangan dibawah ini :</p>`;
    h += `<p style="font-size:10px;font-weight:700;margin-bottom:4px">PIHAK PERTAMA (Penjual)</p>`;
    h += `<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px"><tbody>`;
    h += `<tr><td style="width:120px;padding:1px 4px">Nama</td><td style="padding:1px 4px">: <b>${r.nama||''}</b></td><td style="width:55px;padding:1px 4px">No. HP</td><td style="padding:1px 4px">: ${r.telp1||''}</td></tr>`;
    h += `<tr><td style="padding:1px 4px">Alamat</td><td colspan="3" style="padding:1px 4px">: ${r.alamatNasabah||''}</td></tr>`;
    h += `<tr><td style="padding:1px 4px">No. KTP</td><td colspan="3" style="padding:1px 4px">: ${r.noKtp||''}</td></tr></tbody></table>`;
    h += `<p style="font-size:10px;font-weight:700;margin-bottom:4px">PIHAK KEDUA (Pembeli)</p>`;
    h += `<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:10px"><tbody>`;
    h += `<tr><td style="width:120px;padding:1px 4px">Nama Perusahaan</td><td style="padding:1px 4px">: <b>${namaPerusahaan}</b></td></tr>`;
    h += `<tr><td style="padding:1px 4px">Alamat</td><td style="padding:1px 4px">: ${alamatPerusahaan}</td></tr>`;
    h += `<tr><td style="padding:1px 4px">Diwakili Oleh</td><td style="padding:1px 4px">: <b>${r.kasir||''}</b></td></tr>`;
    h += `<tr><td style="padding:1px 4px">Jabatan</td><td style="padding:1px 4px">: Kasir/Teller</td></tr></tbody></table>`;
    h += `<p style="font-size:10px;margin-bottom:10px">Dengan ini menyatakan sepakat mengadakan perjanjian jual dan beli kembali <i>(buyback)</i> barang dengan ketentuan sebagai berikut :</p>`;
    h += `<p style="font-size:10px;font-weight:700;margin-bottom:5px">Pasal 1 - Objek Transaksi</p>`;
    h += `<p style="font-size:10px;margin-bottom:6px">PIHAK PERTAMA telah menjual kepada PIHAK KEDUA barang berupa :</p>`;
    h += `<table style="width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px"><tbody>`;
    h += `<tr><td style="width:120px;padding:1px 4px">Nama Barang</td><td style="padding:1px 4px">: <b>${r.barang||''}</b></td></tr>`;
    h += `<tr><td style="padding:1px 4px">Kondisi</td><td style="padding:1px 4px">: ${r.kelengkapan||''}</td><td style="width:55px;padding:1px 4px">Grade</td><td style="padding:1px 4px">: <u><b>${r.grade||''}</b></u></td></tr>`;
    h += `<tr><td style="padding:1px 4px">Harga Jual</td><td style="padding:1px 4px">: <b>${fmtRp(hargaJual)}</b></td></tr></tbody></table>`;
    h += `<p style="font-size:9px;font-style:italic;margin-bottom:10px">Barang tersebut telah diterima dan diperiksa oleh PIHAK KEDUA dalam kondisi sesuai.</p>`;
    h += `<p style="font-size:10px;font-weight:700;margin-bottom:5px">Pasal 2 - Hak Beli Kembali</p>`;
    h += `<p style="font-size:10px;margin-bottom:4px">PIHAK PERTAMA memiliki hak untuk membeli kembali barang tersebut dalam jangka waktu paling lambat &nbsp;&nbsp;<b>${lamaTitip}</b>&nbsp;&nbsp;hari kalender terhitung sejak tanggal perjanjian ini, yaitu sampai dengan tanggal&nbsp;&nbsp;<b>${fmtTgl(r.tglJT)}</b>&nbsp;&nbsp;.</p>`;
    h += `<p style="font-size:10px;margin-bottom:10px">Harga beli kembali ditetapkan sebesar:&nbsp;&nbsp;<b style="font-size:13px">${fmtRp(hargaBuyback)}</b></p>`;
    h += `<p style="font-size:10px;font-weight:700;margin-bottom:5px">Pasal 3 - Ketentuan Lain</p>`;
    h += `<p style="font-size:9.5px;margin-bottom:3px">1. Apabila PIHAK PERTAMA tidak melakukan pembelian kembali hingga tanggal yang telah ditentukan, maka barang sepenuhnya menjadi milik PT Aceh Gadai Syariah dan tidak dapat dituntut kembali.</p>`;
    h += `<p style="font-size:9.5px;margin-bottom:3px">2. PIHAK KEDUA berhak menjual barang kepada pihak lain setelah tanggal batas buyback berakhir.</p>`;
    h += `<p style="font-size:9.5px;margin-bottom:3px">3. Semua biaya terkait transaksi ini sepenuhnya menjadi tanggung jawab masing-masing pihak sesuai ketentuan.</p>`;
    h += `<p style="font-size:9.5px;margin-bottom:12px">4. Surat perjanjian ini BUKAN merupakan surat GADAI. PIHAK PERTAMA telah menjual barang dan menerima uang secara utuh dari PIHAK KEDUA. Sehingga PIHAK KEDUA berhak menjual setelah tanggal buyback berakhir tanpa pemberitahuan apapun.</p>`;
    h += `<p style="font-size:10px;margin-bottom:16px">Demikian surat perjanjian ini dibuat dalam rangkap dua dan ditandatangani oleh kedua belah pihak dalam keadaan sadar, tanpa adanya paksaan dari pihak manapun.</p>`;
    h += `<p style="font-size:10px;margin-bottom:22px">${kotaPerusahaan},&nbsp;&nbsp;${tglFmt}</p>`;
    h += `<table style="width:100%;font-size:10px"><tbody><tr><td style="width:50%;text-align:center;padding-bottom:44px"><b>PIHAK PERTAMA</b></td><td style="text-align:center;padding-bottom:44px"><b>PIHAK KEDUA</b></td></tr>`;
    h += `<tr><td style="text-align:center"><b>${r.nama||''}</b></td><td style="text-align:center"><div><b>${r.kasir||''}</b></div><div style="font-size:9px;color:#555">${namaPerusahaan}</div><div style="font-size:9px;color:#555">Telpon / WA Pusat ${telponPerusahaan}</div></td></tr>`;
    h += `<tr><td></td><td style="text-align:right;font-size:9px;color:#555;padding-top:4px">${lembar}</td></tr></tbody></table>`;
    return `<div class="page">${h}</div>`;
  }

  const barcodeA = String(r.barcodeA || '');
  const barcodeB = String(r.barcodeB || r.idSJB || '');
  const pages = [page(barcodeA, false), page(barcodeB, true)];
  const bcScript = _bcMap.map(b => `try{JsBarcode(document.getElementById("${b.id}"),"${b.val}",{format:"CODE128",width:1.4,height:40,displayValue:false});}catch(e){}`).join('\n');

  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SJB ${r.noSJB}</title><script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js"><\/script><style>${BASE_CSS}</style></head><body><div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button><button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button>&nbsp;&nbsp;<small>Barcode A: <b>${barcodeA}</b> | Barcode B: <b>${barcodeB}</b></small></div>${pages.join('')}<script>window.onload=function(){${bcScript}};<\/script></body></html>`);
}

// ════════════════════════════════════════════════════════════
// 4. CETAK NOTA BUYBACK SJB + SURAT DISKON
//    Replika printSJBTebusDoc() dari jualtitip.html
// ════════════════════════════════════════════════════════════
export interface SJBTebusPrintData {
  idBB?: string; idTebus?: string; noSJB?: string; noFaktur?: string;
  status: string; tglJual?: string; tglGadai?: string; tglBB?: string; tglTebus?: string;
  nama?: string; namaNasabah?: string;
  kategori: string; barang: string; hargaJual: number;
  hariAktual?: number; ujrahBerjalan?: number; totalSistem?: number;
  jumlahBayar: number; selisih?: number; alasan?: string;
  idDiskon?: string; tanpaSurat?: boolean;
  kasir: string; outlet: string; alamat: string; kota: string; telpon: string;
  namaPerusahaan: string;
}

export function printSJBTebus(r: SJBTebusPrintData) {
  const statusLabel: Record<string,string> = {BUYBACK:'BELI KEMBALI',PERPANJANG:'PERPANJANGAN',SITA:'PENYITAAN'};
  const label = statusLabel[r.status] || r.status;
  const alamatLine = (r.alamat||'') + (r.telpon ? '. Telepon/Wa: '+r.telpon : '');
  const namaDisplay = r.nama || r.namaNasabah || '';

  function nota(lembar: string) {
    return `<div style="padding:8mm 0"><div style="text-align:center;margin-bottom:10px;border-bottom:2px solid #000;padding-bottom:8px"><div style="font-size:14px;font-weight:bold">NOTA BELI KEMBALI (BUYBACK)</div><div style="font-size:13px;font-weight:bold">${r.namaPerusahaan||'ACEH GADAI SYARIAH'}</div><div style="font-size:9px">Alamat: ${alamatLine}</div></div>`
      +`<table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:12px"><tbody>`
      +`<tr><td style="padding:3px 6px;width:45%">No Transaksi</td><td style="padding:3px 6px">: <b>${r.idBB||r.idTebus||''}</b></td></tr>`
      +`<tr><td style="padding:3px 6px">No SJB</td><td style="padding:3px 6px">: ${r.noSJB||r.noFaktur||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Tanggal Jual Titip</td><td style="padding:3px 6px">: ${r.tglJual||r.tglGadai||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Tanggal Beli Kembali</td><td style="padding:3px 6px">: ${r.tglBB||r.tglTebus||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Nama Pemilik</td><td style="padding:3px 6px">: <b>${namaDisplay}</b></td></tr>`
      +`<tr><td style="padding:3px 6px">Barang</td><td style="padding:3px 6px">: ${r.kategori||''} / ${r.barang||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Harga Jual (dulu)</td><td style="padding:3px 6px">: ${fmtRp(r.hargaJual)}</td></tr>`
      +`<tr><td style="padding:3px 6px">Lama Titip</td><td style="padding:3px 6px">: ${r.hariAktual||'-'} hari</td></tr>`
      +`<tr><td style="padding:3px 6px">Total Sistem</td><td style="padding:3px 6px">: ${fmtRp(r.ujrahBerjalan||r.totalSistem||0)}</td></tr>`
      +((parseFloat(String(r.selisih||0)))>0?`<tr><td style="padding:3px 6px;color:green">Diskon</td><td style="padding:3px 6px;color:green">: ${fmtRp(r.selisih||0)}${r.alasan?' ('+r.alasan+')':''}</td></tr>`:'')
      +`<tr style="border-top:2px solid #000;font-weight:bold"><td style="padding:3px 6px">Total Pembayaran</td><td style="padding:3px 6px;font-size:12px">: ${fmtRp(r.jumlahBayar)}</td></tr>`
      +`<tr><td style="padding:3px 6px">Kasir</td><td style="padding:3px 6px">: ${r.kasir||''}</td></tr>`
      +`<tr><td style="padding:3px 6px">Status</td><td style="padding:3px 6px">: <b>${label}</b></td></tr>`
      +(r.tanpaSurat?`<tr><td style="padding:3px 6px;color:red" colspan="2">⚠️ Transaksi tanpa surat SJB asli</td></tr>`:'')
      +`</tbody></table>`
      +`<div style="font-size:9px;font-style:italic;margin-bottom:10px">Barang telah diperiksa dan cocok dengan surat perjanjian jual titip dan telah diserah terimakan kepada pemilik yang diberikan hak dengan baik.</div>`
      +`<div style="display:flex;margin-top:12px;font-size:10px"><div style="flex:1;text-align:center">Petugas<br><br><br><span style="border-top:1px solid #000;padding-top:3px">${r.kasir||''}</span></div><div style="flex:1;text-align:center">Pemilik<br><br><br><span style="border-top:1px solid #000;padding-top:3px">${namaDisplay}</span></div></div>`
      +`<div style="text-align:right;font-size:9px;margin-top:4px">*) Lembar ${lembar}</div></div>`;
  }

  function suratDiskon() {
    const selisihVal = parseFloat(String(r.selisih||0));
    if (selisihVal <= 9000) return '';
    const noDiskon = r.idDiskon ? 'No : '+r.idDiskon : '';
    const tglKota = (r.kota||'Lhokseumawe')+', '+new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'});
    return `<div class="page"><div style="text-align:right;font-size:11px;font-family:monospace;margin-bottom:4px">${noDiskon}</div>`
      +`<div style="text-align:center;margin-bottom:16px"><div style="font-size:14px;font-weight:bold;text-transform:uppercase">SURAT PERNYATAAN PERMOHONAN DISKON</div><div style="font-size:11px;margin-top:4px">${r.namaPerusahaan||'PT ACEH GADAI SYARIAH'}</div></div>`
      +`<p style="font-size:10px;margin-bottom:12px">Saya yang bertanda tangan di bawah ini:</p>`
      +`<table style="width:100%;font-size:10px;border-collapse:collapse;margin-bottom:16px"><tbody>`
      +`<tr><td style="padding:3px 0;width:160px">Nama</td><td style="padding:3px 0">: <b>${namaDisplay}</b></td></tr>`
      +`<tr><td style="padding:3px 0">No SJB</td><td style="padding:3px 0">: ${r.noSJB||r.noFaktur||''}</td></tr>`
      +`<tr><td style="padding:3px 0">Harga Jual Titip</td><td style="padding:3px 0">: ${fmtRp(r.hargaJual)}</td></tr>`
      +`<tr><td style="padding:3px 0">Lama titip</td><td style="padding:3px 0">: ${r.hariAktual||'-'} Hari</td></tr>`
      +`<tr><td style="padding:3px 0">Total seharusnya</td><td style="padding:3px 0">: ${fmtRp(r.ujrahBerjalan||r.totalSistem||0)}</td></tr>`
      +`<tr><td style="padding:3px 0">Besaran diskon</td><td style="padding:3px 0">: <b>${fmtRp(selisihVal)}</b></td></tr>`
      +`<tr><td style="padding:3px 0">Total yang dibayarkan</td><td style="padding:3px 0">: <b>${fmtRp(r.jumlahBayar)}</b></td></tr>`
      +`<tr><td style="padding:3px 0">Status</td><td style="padding:3px 0">: ${r.status||''}</td></tr>`
      +(r.alasan?`<tr><td style="padding:3px 0">Alasan</td><td style="padding:3px 0">: <i>${r.alasan}</i></td></tr>`:'')
      +`</tbody></table>`
      +`<p style="font-size:10px;margin-bottom:12px">Dengan ini menyatakan bahwa saya secara sadar dan tanpa paksaan dari pihak manapun, memohon keringanan/diskon atas transaksi beli kembali (buyback) saya di PT ACEH GADAI SYARIAH.</p>`
      +`<p style="font-size:10px;margin-bottom:20px">Demikian surat pernyataan ini saya buat dengan sebenar-benarnya untuk digunakan sebagaimana mestinya.</p>`
      +`<div style="display:flex;font-size:10px"><div style="flex:1;text-align:center"><div style="margin-bottom:55px">${tglKota}</div><div style="margin-bottom:6px">Konsumen</div><div style="border-top:1px solid #000;padding-top:4px">${namaDisplay}</div></div><div style="flex:1;text-align:center"><div style="margin-bottom:55px">&nbsp;</div><div style="margin-bottom:4px">${r.namaPerusahaan||'PT ACEH GADAI SYARIAH'}</div><div style="font-weight:bold">Teller</div><div style="border-top:1px solid #000;padding-top:4px;margin-top:36px">${r.kasir||''}</div></div></div></div>`;
  }

  const notaPage = `<div class="page" style="padding:8mm 15mm">${nota('Nasabah')}<div style="border-top:1px dashed #999;margin:4mm 0"></div>${nota('Perusahaan')}</div>`;
  const pages = notaPage + suratDiskon();
  const hasDiskon = (parseFloat(String(r.selisih||0))) > 9000;
  openPrintWindow(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Nota ${label} ${r.noSJB||r.noFaktur||''}</title><style>${BASE_CSS}</style></head><body><div class="noprint"><button onclick="window.print()" style="padding:6px 16px;margin-right:8px">🖨️ Print</button><button onclick="window.close()" style="padding:6px 12px">✕ Tutup</button>${hasDiskon?'<span style="font-size:11px;margin-left:12px;color:green">✔ Surat Diskon Disertakan</span>':''}</div>${pages}</body></html>`);
}
