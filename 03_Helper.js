// ============================================================
// HELPER UMUM
// ============================================================
function emailAktif() {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch (e) {
    return '';
  }
}

function keyEmail_(s) {
  return String(s === null || s === undefined ? '' : s).trim().toLowerCase();
}

function aktifBenar_(v) {
  if (v === true) return true;
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  return ['ya', 'y', 'true', 'aktif', '1'].indexOf(s) !== -1;
}

// Sheets mengeksekusi sel yang diawali = + - @ (atau tab/CR) sebagai formula.
// Dipakai di dua tempat: tolak di batas masuk dan pagar di lapisan tulis.
function formulaBahaya_(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return /^[=+@\t\r]/.test(s);
}

// Versi ketat untuk impor: Sheets membaca "-A1" / "-2+3" sebagai operator,
// sedangkan pada ketikan manual "-cicilan tahap 2" adalah teks biasa.
function formulaBahayaKetat_(v) {
  const s = String(v === null || v === undefined ? '' : v);
  return formulaBahaya_(s) || (s.charAt(0) === '-' && s.length > 1);
}

// Pagar terakhir sebelum sel ditulis: lebih baik gagal jelas daripada
// menyimpan teks yang berubah jadi formula saat spreadsheet dibuka.
function periksaTeks_(v) {
  if (typeof v === 'string' && formulaBahaya_(v)) {
    throw new Error('Nilai teks tidak boleh diawali = + - @: ' + v.slice(0, 30));
  }
  return v;
}

// Potong daftar bila klien meminta halaman (limit > 0). Tanpa limit,
// kembalikan semua agar pemanggil lama (dropdown) tidak berubah perilaku.
function halaman_(daftar, filter) {
  const f = filter || {};
  const limit = Math.max(0, Number(f.limit) || 0);
  if (!limit) return daftar;
  const offset = Math.max(0, Number(f.offset) || 0);
  return daftar.slice(offset, offset + limit);
}

// ID lokal tanpa Utilities.getUuid (tidak tersedia di harness uji).
function uid_() {
  return 'ID' + Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 8).toUpperCase();
}
