// ============================================================
// SPREADSHEET
// ============================================================
// Urutan: Script Properties -> SPREADSHEET_ID -> buat spreadsheet baru.
// Handle di-cache per eksekusi: openById tidak diulang untuk tiap baca/tulis.
let SS_MEMO_ = null;
function getSpreadsheet() {
  if (SS_MEMO_) return SS_MEMO_;
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty(PROP_SS_ID) || SPREADSHEET_ID;

  if (!id) {
    const ssBaru = SpreadsheetApp.create(NAMA_SPREADSHEET);
    props.setProperty(PROP_SS_ID, ssBaru.getId());
    SS_MEMO_ = ssBaru;
    return ssBaru;
  }

  // Google sesekali butuh waktu singkat sebelum file baru bisa dibuka.
  let lastError = null;
  for (let i = 0; i < 3; i++) {
    try {
      const ssDibuka = SpreadsheetApp.openById(id);
      SS_MEMO_ = ssDibuka;
      return ssDibuka;
    } catch (e) {
      lastError = e;
      if (i < 2) Utilities.sleep(1200);
    }
  }

  // ID spreadsheet tidak ikut ditampilkan: pesan galat sampai ke klien.
  const sebab = String((lastError && lastError.message) || '').split(id).join('[id]');
  throw new Error(
    'Akun ini tidak punya izin ke spreadsheet database. Jalankan cekDatabase() lalu ' +
    'setupDatabase() di editor Apps Script, atau bagikan spreadsheet ke akun ini sebagai Editor. ' +
    'Akun: ' + (emailAktif() || 'tidak diketahui') + '. Penyebab: ' + sebab
  );
}

// Jalankan sekali dari editor Apps Script. Aman dijalankan berulang (idempoten).
// Sheet PENGGUNA sudah berisi akun? Dipakai untuk mengunci setup/cek database.
function ssPunyaAkun_(ss) {
  try {
    const sheet = ss.getSheetByName('PENGGUNA');
    return !!(sheet && sheet.getLastRow() > 1);
  } catch (e) {
    return false;
  }
}

function setupDatabase() {
  try {
    const pelaku = keyEmail_(emailAktif());
    if (!pelaku) {
      return {
        success: false,
        message: 'setupDatabase harus dijalankan dari editor Apps Script: email akun tidak terbaca dari browser mode ini.'
      };
    }
    const props = PropertiesService.getScriptProperties();
    const idTersimpan = props.getProperty(PROP_SS_ID) || SPREADSHEET_ID;
    let ss = null;
    let keterangan = '';

    if (idTersimpan) {
      // Database lama tidak boleh diganti diam-diam: gagal buka = berhenti.
      try {
        ss = SpreadsheetApp.openById(idTersimpan);
      } catch (e) {
        return {
          success: false,
          message: 'Spreadsheet database (' + idTersimpan + ') tidak bisa dibuka: ' + e.message +
            '. SPREADSHEET_ID tidak diubah; periksa izin atau pulihkan spreadsheet lama.'
        };
      }
      if (ssPunyaAkun_(ss)) {
        // Setup ulang hanya Admin. Konteks editor tidak punya sesi webapp,
        // jadi admin juga dikenali dari baris PENGGUNA aktif yang cocok
        // dengan email editor; pengunjung webapp anonim tetap ditolak.
        const sesiSetup = getSesi().data || {};
        const editor = keyEmail_(emailAktif());
        const adminEditor = editor && bacaTabel_('PENGGUNA').some(function (r) {
          return keyEmail_(r.Email) === editor && aktifBenar_(r.Aktif) &&
            String(r.Peran || '').trim() === 'Admin';
        });
        const boleh = adminEditor || (sesiSetup.status === 'ok' && sesiSetup.peran === 'Admin');
        if (!boleh) return tolak_('Setup database', 'Admin');
      }
      keterangan = 'Memakai spreadsheet yang sudah ada.';
    }

    if (!ss) {
      ss = SpreadsheetApp.create(NAMA_SPREADSHEET);
      props.setProperty(PROP_SS_ID, ss.getId());
      keterangan = 'Database baru dibuat.';
    }

    ensureAllSheets_(ss);
    catatAdminPertama_(ss);
    // Trigger backup dipasang dari editor, bukan oleh pengunjung anonim.
    try { pasangBackupHarian_(); } catch (e) { /* di luar editor: lewati */ }
    // PIN awal hanya lewat nilai balik; log eksekusi menetap di Stackdriver.
    const pinAwal = pastikanPinBootstrap_();

    const data = {
      keterangan: keterangan,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      pinAwal: pinAwal,
      sheet: ss.getSheets().map(function (s) { return s.getName(); })
    };
    Logger.log(JSON.stringify({ spreadsheetId: data.spreadsheetId, sheet: data.sheet }, null, 2));
    return { success: true, message: 'Database siap dipakai.', data: data };
  } catch (e) {
    return { success: false, message: 'Gagal menyiapkan database: ' + e.message };
  }
}

// ============================================================
// BACKUP HARIAN (salinan spreadsheet ke Drive)
// ============================================================
function folderBackup_() {
  const ada = DriveApp.getFoldersByName(BACKUP_FOLDER);
  return ada.hasNext() ? ada.next() : DriveApp.createFolder(BACKUP_FOLDER);
}

// Salinan harian penuh: satu file per tanggal, simpan BACKUP_SIMPAN_HARI hari.
function backupHarian_() {
  try {
    const folder = folderBackup_();
    const nama = 'KEUANGAN-SEKOLAH-' + hariIniIso_();
    if (folder.getFilesByName(nama).hasNext()) {
      return { success: true, message: 'Backup hari ini sudah ada: ' + nama };
    }
    DriveApp.getFileById(getSpreadsheet().getId()).makeCopy(nama, folder);

    const batas = new Date(Date.now() - BACKUP_SIMPAN_HARI * 24 * 60 * 60 * 1000);
    const berkas = folder.getFiles();
    while (berkas.hasNext()) {
      const f = berkas.next();
      if (f.getName().indexOf('KEUANGAN-SEKOLAH-') !== 0) continue;
      if (f.getDateCreated() < batas) f.setTrashed(true);
    }

    catatLog_('Backup harian', nama, { folder: BACKUP_FOLDER });
    return { success: true, message: 'Backup dibuat: ' + nama };
  } catch (e) {
    return { success: false, message: 'Gagal membuat backup: ' + e.message };
  }
}

// Arsip tahun ajaran: salinan permanen spreadsheet di folder backup.
// Retensi tidak menyentuh berkas berawalan "ARSIP KEUANGAN ".
function arsipkanTahunAjaran(tahunAjaran) {
  try {
    const tolakAudit = cekPeriodeAudit_('Arsip tahun ajaran');
    if (tolakAudit) return tolakAudit;
    const tolakan = wajibAdmin_('Arsip tahun ajaran');
    if (tolakan) return tolakan;

    const ta = teks_(tahunAjaran) || tahunAjaranAktif_();
    if (!/^\d{4}\/\d{4}$/.test(ta)) {
      return { success: false, message: 'Tahun ajaran harus berbentuk 2026/2027.' };
    }
    const folder = folderBackup_();
    const nama = 'ARSIP KEUANGAN ' + ta.replace('/', '-');
    if (folder.getFilesByName(nama).hasNext()) {
      return { success: true, message: 'Arsip ' + ta + ' sudah ada: ' + nama };
    }
    DriveApp.getFileById(getSpreadsheet().getId()).makeCopy(nama, folder);
    catatLog_('Arsip tahun ajaran', ta, { folder: BACKUP_FOLDER, nama: nama });
    return { success: true, message: 'Arsip ' + ta + ' dibuat: ' + nama };
  } catch (e) {
    return { success: false, message: 'Gagal membuat arsip: ' + e.message };
  }
}

// Pasang trigger harian sekali; aman dipanggil berulang.
function pasangBackupHarian_() {
  try {
    const semua = ScriptApp.getProjectTriggers();
    // Trigger lama (nama tanpa _) dihapus agar tidak ganda, lalu pasang yang baru.
    semua.forEach(function (t) {
      if (t.getHandlerFunction() === 'backupHarian') ScriptApp.deleteTrigger(t);
    });
    const ada = semua.some(function (t) {
      return t.getHandlerFunction() === 'backupHarian_';
    });
    if (!ada) {
      ScriptApp.newTrigger('backupHarian_').timeBased().atHour(23).everyDays(1).create();
    }
    return { success: true, message: 'Backup harian aktif pukul 23.00 WITA.' };
  } catch (e) {
    return { success: false, message: 'Gagal memasang backup harian: ' + e.message };
  }
}

// Diagnosis cepat dari editor Apps Script (tidak membuat/mengubah apa pun).
function cekDatabase() {
  try {
    if (!keyEmail_(emailAktif())) {
      return { success: false, message: 'cekDatabase harus dijalankan dari editor Apps Script.' };
    }
    const props = PropertiesService.getScriptProperties();
    const id = props.getProperty(PROP_SS_ID) || SPREADSHEET_ID;
    const data = {
      akun: emailAktif(),
      spreadsheetId: id || '(kosong)',
      siap: false,
      sheet: [],
      kurang: Object.keys(SHEET_HEADERS)
    };

    if (id) {
      try {
        const ss = SpreadsheetApp.openById(id);
        if (ssPunyaAkun_(ss)) {
          const tolakan = wajibAdmin_('Cek database');
          if (tolakan) return tolakan;
        }
        data.spreadsheetNama = ss.getName();
        data.sheet = ss.getSheets().map(function (s) { return s.getName(); });
        data.kurang = Object.keys(SHEET_HEADERS).filter(function (nama) {
          return !ss.getSheetByName(nama);
        });
        data.siap = data.kurang.length === 0;
      } catch (e) {
        data.errorSpreadsheet = e.message;
      }
    } else {
      data.errorSpreadsheet = 'SPREADSHEET_ID belum diatur; jalankan setupDatabase().';
    }

    return { success: true, data: data };
  } catch (e) {
    return { success: false, message: 'Gagal memeriksa database: ' + e.message };
  }
}

// ============================================================
// SKEMA SHEET & DATA BAWAAN
// ============================================================
function ensureAllSheets_(ss) {
  Object.keys(SHEET_HEADERS).forEach(function (nama) {
    const sheet = lembar_(ss, nama);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(SHEET_HEADERS[nama]);
      hiasHeader_(sheet, SHEET_HEADERS[nama].length);
      aturKolomTeks_(sheet, SHEET_HEADERS[nama]);
      return;
    }
    pastikanHeaderLengkap_(sheet, SHEET_HEADERS[nama]);
  });

  isiDataBawaan_(ss);
  hapusSheetKosong_(ss);
  return ss;
}

// Baca saja: memeriksa header semua sheet terhadap SHEET_HEADERS. Tidak menulis apa pun.
function cekSemuaHeader_() {
  const id = PropertiesService.getScriptProperties().getProperty(PROP_SS_ID) || SPREADSHEET_ID;
  if (!id) return { success: false, message: 'SPREADSHEET_ID belum ada.' };

  let ss;
  try {
    ss = SpreadsheetApp.openById(id);
  } catch (e) {
    return { success: false, message: 'Spreadsheet tidak bisa dibuka: ' + e.message };
  }

  const laporan = {};
  Object.keys(SHEET_HEADERS).forEach(function (nama) {
    const sheet = ss.getSheetByName(nama);
    if (!sheet) {
      laporan[nama] = { status: 'SHEET_HILANG', kurang: [], casingBeda: [] };
      return;
    }
    const lebar = Math.max(1, sheet.getLastColumn());
    const ada = sheet.getRange(1, 1, 1, lebar).getValues()[0]
      .map(function (h) { return String(h).trim(); });
    const kurang = SHEET_HEADERS[nama].filter(function (h) { return ada.indexOf(h) === -1; });
    const casingBeda = kurang.filter(function (h) {
      return ada.some(function (a) { return a.toLowerCase() === h.toLowerCase(); });
    });
    laporan[nama] = { status: kurang.length ? 'KURANG' : 'OK', kurang: kurang, casingBeda: casingBeda };
  });

  return { success: true, message: 'Pemeriksaan header selesai (baca saja).', data: laporan };
}

// Pembungkus publik: fungsi berakhiran "_" tidak muncul di dropdown Run editor.
function cekHeaderDev() {
  const hasil = cekSemuaHeader_();
  Logger.log(JSON.stringify(hasil, null, 2));
  return hasil;
}

// Hanya untuk DEV. Membuat PIN awal Admin sekali dan menampilkannya di dialog.
function aturPinAwalDev_() {
  const lingkungan = PropertiesService.getScriptProperties().getProperty('LINGKUNGAN');
  if (lingkungan !== 'DEV') {
    return { success: false, message: 'Hanya untuk DEV (Script Property LINGKUNGAN harus DEV).' };
  }

  // Cek UI dulu: jika dialog tidak bisa ditampilkan, PIN tidak boleh dibuat.
  let ui;
  try {
    ui = SpreadsheetApp.getUi();
  } catch (e) {
    return { success: false, message: 'Harus dijalankan dari editor spreadsheet DEV.' };
  }

  const pelaku = keyEmail_(emailAktif());
  const admin = pelaku && bacaTabel_('PENGGUNA').some(function (r) {
    return keyEmail_(r.Email) === pelaku && aktifBenar_(r.Aktif) &&
      String(r.Peran || '').trim() === 'Admin';
  });
  if (!admin) return { success: false, message: 'Akun editor bukan Admin aktif di PENGGUNA.' };

  if (adaPin_()) return { success: false, message: 'PIN sudah ada. Tidak dibuat ulang.' };

  const pin = pastikanPinBootstrap_(); // hanya menyimpan hash, tidak mencatat log
  if (!pin) return { success: false, message: 'PIN tidak dibuat.' };

  ui.alert('PIN awal DEV', 'Catat sekarang. PIN ini tidak ditampilkan lagi:\n\n' + pin,
    ui.ButtonSet.OK);
  return { success: true, message: 'PIN awal dibuat dan ditampilkan sekali.' };
}

// Tambahkan kolom header yang belum ada tanpa menyentuh data lama
// (dipakai untuk migrasi, mis. kolom PIN/Salt pada sheet PENGGUNA).
function pastikanHeaderLengkap_(sheet, headers) {
  const lebar = Math.max(1, sheet.getLastColumn());
  const ada = sheet.getRange(1, 1, 1, lebar).getValues()[0]
    .map(function (h) { return String(h).trim(); });
  const kurang = headers.filter(function (h) { return ada.indexOf(h) === -1; });
  if (!kurang.length) return;
  sheet.getRange(1, ada.length + 1, 1, kurang.length).setValues([kurang]);
  hiasHeader_(sheet, headers.length);
}

function hiasHeader_(sheet, jumlahKolom) {
  sheet.getRange(1, 1, 1, jumlahKolom)
    .setFontWeight('bold')
    .setBackground(WARNA_HEADER)
    .setFontColor('#ffffff');
  sheet.setFrozenRows(1);
}

function aturKolomTeks_(sheet, headers) {
  headers.forEach(function (h, i) {
    if (KOLOM_TEKS.indexOf(h) !== -1) {
      sheet.getRange(1, i + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    }
  });
}

function isiDataBawaan_(ss) {
  if (bacaTabelSs_(ss, 'JENIS_BIAYA').length === 0) {
    JENIS_BIAYA_DEFAULT.forEach(function (baris) {
      lembar_(ss, 'JENIS_BIAYA').appendRow(baris.slice());
    });
  }

  if (bacaTabelSs_(ss, 'KATEGORI_PENGELUARAN').length === 0) {
    KATEGORI_DEFAULT.forEach(function (baris) {
      lembar_(ss, 'KATEGORI_PENGELUARAN').appendRow(baris.slice());
    });
  }

  // PENGATURAN: lengkapi kunci yang belum ada, jangan timpa nilai admin.
  const kunciAda = {};
  bacaTabelSs_(ss, 'PENGATURAN').forEach(function (r) { kunciAda[String(r.Kunci)] = true; });
  PENGATURAN_DEFAULT.forEach(function (baris) {
    if (!kunciAda[baris[0]]) {
      tulisBarisSs_(ss, 'PENGATURAN', { Kunci: baris[0], Nilai: baris[1] });
    }
  });
}

function catatAdminPertama_(ss) {
  const email = keyEmail_(emailAktif());
  if (!email) return;

  // Catat siapa yang menginisialisasi database (jejak dukungan, bukan
  // gerbang otorisasi: akses admin ditentukan PIN + peran di sheet PENGGUNA).
  const pengaturanAda = bacaTabelSs_(ss, 'PENGATURAN').some(function (r) {
    return teks_(r.Kunci) === 'BootstrapEmail';
  });
  if (!pengaturanAda) {
    tulisBarisSs_(ss, 'PENGATURAN', { Kunci: 'BootstrapEmail', Nilai: email });
  }

  const sudahAda = bacaTabelSs_(ss, 'PENGGUNA').some(function (r) {
    return keyEmail_(r.Email) === email;
  });
  if (sudahAda) return;

  tulisBarisSs_(ss, 'PENGGUNA', {
    Email: email,
    Nama: email,
    Peran: 'Admin',
    Aktif: 'Ya',
    DicatatOleh: 'setupDatabase',
    Waktu: waktuIso_()
  });
}

// PIN awal pemilik script. Dibuat hanya saat belum ada PIN sama sekali;
// pemilik membacanya dari log setupDatabase lalu wajib menggantinya.
function pastikanPinBootstrap_() {
  if (adaPin_()) return '';
  const email = keyEmail_(emailAktif());
  if (!email) return '';
  const pin = Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const salt = buatSalt_();
  ubahBarisCocok_('PENGGUNA', function (r) { return keyEmail_(r.Email) === email; },
    { PIN: hashPin_(pin, salt), Salt: salt, Gagal: 0, TerkunciSampai: '' });
  return pin;
}

// D5: bootstrap Super Admin pertama, dijalankan sekali dari editor Apps Script.
// Email & PIN awal dibaca dari Script Properties (diisi pemilik di editor lalu
// dihapus) — BUKAN dari argumen klien, dan PIN tidak pernah dicatat ke log.
const BOOTSTRAP_EMAIL_PROP = 'BOOTSTRAP_EMAIL';
const BOOTSTRAP_PIN_PROP = 'BOOTSTRAP_PIN_AWAL';

function bootstrapSuperAdmin_() {
  try {
    const sudahAda = bacaTabel_('PENGGUNA').some(function (r) {
      return teks_(r.Peran) === 'Super Admin';
    });
    if (sudahAda) return { success: false, message: 'Super Admin sudah ada.' };
    const props = PropertiesService.getScriptProperties();
    const email = keyEmail_(props.getProperty(BOOTSTRAP_EMAIL_PROP) || '');
    const pinAwal = String(props.getProperty(BOOTSTRAP_PIN_PROP) || '');
    if (!email) return { success: false, message: 'Email bootstrap belum diatur di Script Properties.' };
    if (pinAwal.length < PIN_MIN) {
      return { success: false, message: 'PIN awal minimal ' + PIN_MIN + ' karakter.' };
    }
    const salt = buatSalt_();
    tulisBaris_('PENGGUNA', {
      Email: email, Nama: 'Super Admin', Peran: 'Super Admin', Kelas: '',
      Aktif: 'Ya', PIN: hashPin_(pinAwal, salt), Salt: salt,
      Gagal: 0, TerkunciSampai: '', WajibGantiPin: 'Ya'
    });
    props.deleteProperty(BOOTSTRAP_PIN_PROP);
    return { success: true, message: 'Super Admin dibuat. Ganti PIN saat login pertama.' };
  } catch (e) {
    return { success: false, message: 'Gagal bootstrap Super Admin: ' + e.message };
  }
}

function hapusSheetKosong_(ss) {
  ['Sheet1', 'Sheet 1'].forEach(function (nama) {
    const sheet = ss.getSheetByName(nama);
    if (sheet && ss.getSheets().length > 1 && sheet.getLastRow() === 0) {
      ss.deleteSheet(sheet);
    }
  });
}

// ============================================================
// HELPER SHEET
// ============================================================
function lembar_(ss, nama) {
  return ss.getSheetByName(nama) || ss.insertSheet(nama);
}

// Baca sheet sebagai objek dengan header sebagai kunci. Sheet tak dikenal -> [].
function bacaTabel_(nama) {
  return bacaTabelSs_(getSpreadsheet(), nama);
}

function bacaTabelSs_(ss, nama) {
  const sheet = ss.getSheetByName(nama);
  if (!sheet || sheet.getLastRow() < 1) return [];

  const nilai = sheet.getDataRange().getValues();
  const headers = nilai[0].map(function (h) { return String(h).trim(); });
  const hasil = [];

  for (let i = 1; i < nilai.length; i++) {
    const baris = nilai[i];
    const adaIsi = baris.some(function (v) {
      return v !== '' && v !== null && v !== undefined;
    });
    if (!adaIsi) continue;
    const obj = {};
    headers.forEach(function (h, j) {
      if (!h) return;
      obj[h] = baris[j] === undefined ? '' : baris[j];
    });
    hasil.push(obj);
  }
  return hasil;
}

function tulisBaris_(nama, obj) {
  return tulisBarisSs_(getSpreadsheet(), nama, obj);
}

function tulisBarisSs_(ss, nama, obj) {
  const headers = headerLembar_(ss, nama);
  const baris = headers.map(function (h) {
    return obj && obj[h] !== undefined && obj[h] !== null ? periksaTeks_(obj[h]) : '';
  });
  lembar_(ss, nama).appendRow(baris);
  return true;
}

// Tulis banyak baris sekaligus (satu setValues) agar impor/generate tidak
// memanggil SpreadsheetApp ribuan kali.
function tulisBanyak_(nama, daftar) {
  return tulisBanyakSs_(getSpreadsheet(), nama, daftar);
}

function tulisBanyakSs_(ss, nama, daftar) {
  if (!daftar || !daftar.length) return 0;
  const headers = headerLembar_(ss, nama);
  const matriks = daftar.map(function (obj) {
    return headers.map(function (h) {
      return obj && obj[h] !== undefined && obj[h] !== null ? periksaTeks_(obj[h]) : '';
    });
  });
  const sheet = lembar_(ss, nama);
  sheet.getRange(sheet.getLastRow() + 1, 1, matriks.length, headers.length).setValues(matriks);
  return matriks.length;
}

// Ubah satu baris berdasarkan kolom kunci. true = ketemu & diubah.
function ubahBaris_(nama, kolomKunci, nilaiKunci, obj) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(nama);
  if (!sheet || sheet.getLastRow() < 1) return false;

  const nilai = sheet.getDataRange().getValues();
  const headers = nilai[0].map(function (h) { return String(h).trim(); });
  const idxKunci = headers.indexOf(kolomKunci);
  if (idxKunci === -1) return false;

  for (let i = 1; i < nilai.length; i++) {
    if (String(nilai[i][idxKunci]).trim() !== String(nilaiKunci).trim()) continue;
    const barisBaru = nilai[i].slice();
    Object.keys(obj || {}).forEach(function (k) {
      const j = headers.indexOf(k);
      if (j !== -1) barisBaru[j] = obj[k];
    });
    // Range 1 x headers.length: panjang baris harus persis sama.
    const keluaran = headers.map(function (_, j) {
      return barisBaru[j] === undefined ? '' : periksaTeks_(barisBaru[j]);
    });
    sheet.getRange(i + 1, 1, 1, headers.length).setValues([keluaran]);
    return true;
  }
  return false;
}

// Pastikan sheet punya header; buat bila belum ada.
function headerLembar_(ss, nama) {
  const bawaan = SHEET_HEADERS[nama];
  if (!bawaan) throw new Error('Sheet tidak dikenal: ' + nama);

  const sheet = lembar_(ss, nama);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(bawaan);
    hiasHeader_(sheet, bawaan.length);
    aturKolomTeks_(sheet, bawaan);
  }
  return sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), bawaan.length))
    .getValues()[0]
    .map(function (h) { return String(h).trim(); });
}
