// Google Apps Script — Aplikasi Keuangan Sekolah SMK Maritim Nusantara Kupang
// Database: satu Google Spreadsheet (11 sheet sesuai spec), tanpa library eksternal.

const APP_VERSI = 'v16 · 2026-11-09';

// Naikkan setiap kali deploy supaya versi yang aktif bisa dipastikan
// lewat /exec?diag=1 (teks biasa, tidak butuh login).
// ============================================================
// ATURAN GLOBAL TANGGAL & JAM (berlaku untuk seluruh aplikasi)
// ------------------------------------------------------------
// 1. Zona waktu aplikasi: Asia/Makassar (WITA, UTC+08:00).
//    Timezone project Apps Script WAJIB Asia/Makassar (appsscript.json).
// 2. Penyimpanan (sheet):
//    - Tanggal murni  -> "YYYY-MM-DD"  (dipakai ID, filter bulan, rentang)
//    - Tanggal + jam  -> ISO 8601 dengan offset lokal
//                        "2026-11-01T14:05:00+08:00" (bukan UTC "Z")
// 3. Tampilan (UI): "31 Okt 2026", "31 Oktober 2026", "14:05 WITA".
// 4. Dilarang memakai Date.toISOString() untuk data bisnis karena
//    menghasilkan UTC; gunakan waktuIso_()/tanggalLokalIso_().
// ============================================================
const ZONA_APLIKASI = 'Asia/Makassar';
const LABEL_ZONA = 'WITA';

function duaDigit_(n) {
  return (Number(n) < 10 ? '0' : '') + Number(n);
}

// "YYYY-MM-DD" dari komponen waktu LOKAL (bukan UTC).
function tanggalLokalIso_(d) {
  const t = d || new Date();
  return t.getFullYear() + '-' + duaDigit_(t.getMonth() + 1) + '-' + duaDigit_(t.getDate());
}

// ISO 8601 dengan offset lokal, mis. 2026-11-01T14:05:00+08:00.
function waktuIso_(ketika) {
  const d = ketika || new Date();
  const offsetMenit = -d.getTimezoneOffset();
  const tanda = offsetMenit >= 0 ? '+' : '-';
  const mutlak = Math.abs(offsetMenit);
  return tanggalLokalIso_(d) + 'T' +
    duaDigit_(d.getHours()) + ':' + duaDigit_(d.getMinutes()) + ':' + duaDigit_(d.getSeconds()) +
    tanda + duaDigit_(Math.floor(mutlak / 60)) + ':' + duaDigit_(mutlak % 60);
}

function doGet(e) {
  const diag = e && e.parameter ? String(e.parameter.diag || '') : '';
  if (diag) {
    return ContentService
      .createTextOutput('KEUANGAN-SEKOLAH ' + APP_VERSI + ' · ' + waktuIso_())
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Keuangan Sekolah SMK Maritim Nusantara Kupang')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
