// ============================================================
// AUTENTIKASI: PIN + sesi per pengunjung
// Web app "Execute as: Me" tidak memberi email pengunjung, jadi identitas
// diambil dari PIN yang diverifikasi server. Sesi diikat ke
// Session.getTemporaryActiveUserKey() (kunci anonim per pengunjung).
// ============================================================
const SESI_TTL_MS = 12 * 60 * 60 * 1000;
const MAKS_GAGAL_LOGIN = 5;
const KUNCI_TERKUNCI_MS = 15 * 60 * 1000;
// PIN lama 4 sampai 6 karakter tetap sah untuk login.
// PIN_MIN = 7 hanya berlaku saat simpanPengguna menyimpan PIN baru.
const PIN_MIN = 7;
const PIN_MAKS = 32;
const PESAN_GAGAL_LOGIN = 'Email atau PIN salah.';
// Dipakai untuk: email tidak ada, belum ada PIN, akun nonaktif, dan PIN salah.
// Lockout tetap memakai pesan terpisah.

// Kunci identitas pengunjung; jatuh ke email bila API tidak tersedia.
// null = tidak ada cara mengikat sesi per pengunjung — sesi TIDAK boleh
// dibuat/dibaca dengan kunci bersama ('anon' pernah menjadi bypass auth).
function kunciSesi_() {
  try {
    if (typeof Session !== 'undefined' && Session.getTemporaryActiveUserKey) {
      const k = Session.getTemporaryActiveUserKey();
      if (k) return 'K:' + k;
    }
  } catch (e) { /* abaikan */ }
  return null; // tanpa fallback email: sesi harus terikat kunci pengunjung
}

function buatSalt_() {
  // UUID v4 berasal dari CSPRNG; Math.random() hanya cadangan bila API absen.
  // Kegagalan getUuid dibiarkan naik: salt lemah tidak boleh dibuat diam-diam.
  if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
    return Utilities.getUuid().replace(/-/g, '');
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// SHA-256 berulang (1.000 putaran) agar PIN pendek tidak mudah ditebak offline.
function hashPin_(pin, salt) {
  const algo = (typeof Utilities !== 'undefined' && Utilities.DigestAlgorithm)
    ? Utilities.DigestAlgorithm.SHA_256 : 'SHA_256';
  let nilai = String(salt) + '::' + String(pin);
  for (let i = 0; i < 1000; i++) {
    const digest = Utilities.computeDigest(algo, nilai);
    nilai = digest.map(function (b) {
      const v = b < 0 ? b + 256 : b;
      return (v < 16 ? '0' : '') + v.toString(16);
    }).join('');
  }
  return nilai;
}

// false = tanpa kunci unik, sesi tidak bisa diikat (login gagal jelas).
function simpanSesi_(email) {
  const kunci = kunciSesi_();
  if (!kunci) return false;
  const isi = JSON.stringify({
    email: keyEmail_(email),
    exp: Date.now() + SESI_TTL_MS
  });
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SESI:' + kunci, isi);
  bersihkanSesiKedaluwarsa_();
  return true;
}

// Buang sesi kedaluwarsa agar Script Properties tidak menumpuk (kuota 500 KB).
function bersihkanSesiKedaluwarsa_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const kini = Date.now();
    // getProperties() = satu pembacaan, bukan satu per kunci: penting saat
    // ratusan sesi ortu aktif (quota baca properti ikut membengkak).
    const semua = props.getProperties();
    Object.keys(semua).forEach(function (k) {
      if (k.indexOf('SESI:') !== 0) return;
      let isi = null;
      try { isi = JSON.parse(semua[k] || ''); } catch (e) { isi = null; }
      if (!isi || !isi.exp || Number(isi.exp) < kini) props.deleteProperty(k);
    });
  } catch (e) { /* pembersihan tidak boleh menggagalkan login */ }
}

function bacaSesiTersimpan_() {
  const kunci = kunciSesi_();
  if (!kunci) return null;
  try {
    const mentah = PropertiesService.getScriptProperties()
      .getProperty('SESI:' + kunci);
    if (!mentah) return null;
    const data = JSON.parse(mentah);
    if (!data || !data.email) return null;
    if (data.exp && Number(data.exp) < Date.now()) {
      PropertiesService.getScriptProperties().deleteProperty('SESI:' + kunci);
      return null;
    }
    return data;
  } catch (e) {
    return null;
  }
}

function hapusSesi_() {
  const kunci = kunciSesi_();
  if (!kunci) return;
  try {
    PropertiesService.getScriptProperties().deleteProperty('SESI:' + kunci);
  } catch (e) { /* abaikan */ }
}

// Cabut semua sesi milik satu email (dipakai saat PIN diganti atau akun
// dinonaktifkan): sesi lama tidak boleh tetap sah sampai 12 jam.
function cabutSesiEmail_(email) {
  const kunci = keyEmail_(email);
  if (!kunci) return;
  try {
    const props = PropertiesService.getScriptProperties();
    const semua = props.getProperties();
    Object.keys(semua).forEach(function (k) {
      if (k.indexOf('SESI:') !== 0) return;
      let isi = null;
      try { isi = JSON.parse(semua[k] || ''); } catch (e) { isi = null; }
      if (isi && keyEmail_(isi.email) === kunci) props.deleteProperty(k);
    });
  } catch (e) { /* jangan gagalkan penyimpanan */ }
}

// true selama belum ada satu pun akun yang punya PIN (= instalasi baru).
function adaPin_() {
  return bacaTabel_('PENGGUNA').some(function (r) { return teks_(r.PIN) !== ''; });
}

// Pastikan sheet PENGGUNA punya kolom PIN/Salt/NISN walau setupDatabase
// belum dijalankan ulang setelah pembaruan (migrasi otomatis saat login).
function pastikanSkemaPengguna_() {
  try {
    const ss = getSpreadsheet();
    pastikanHeaderLengkap_(lembar_(ss, 'PENGGUNA'), SHEET_HEADERS.PENGGUNA);
  } catch (e) {
    /* biarkan: kegagalan migrasi tidak boleh mengunci login */
  }
}

function login(d) {
  try {
    pastikanSkemaPengguna_();
    const data = d || {};
    const email = keyEmail_(data.email);
    const pin = teks_(data.pin);
    if (!email) return { success: false, message: 'Email wajib diisi.' };
    if (!pin) return { success: false, message: 'PIN wajib diisi.' };

    // Baca ulang + verifikasi + update counter di dalam lock: percobaan
    // paralel tidak boleh saling menimpa Gagal (lockout 5x jadi lemah).
    return denganKunci_(function () {
      const baris = bacaTabel_('PENGGUNA').filter(function (r) {
        return keyEmail_(r.Email) === email;
      })[0];
      if (!baris) return { success: false, message: PESAN_GAGAL_LOGIN };
      if (!aktifBenar_(baris.Aktif)) {
        return { success: false, message: PESAN_GAGAL_LOGIN };
      }
      if (!teks_(baris.PIN)) {
        return { success: false, message: PESAN_GAGAL_LOGIN };
      }

      const terkunciSampai = Date.parse(teks_(baris.TerkunciSampai) || '');
      if (isFinite(terkunciSampai) && terkunciSampai > Date.now()) {
        return { success: false, message: 'Terlalu banyak percobaan. Coba lagi 15 menit lagi.' };
      }

      if (hashPin_(pin, teks_(baris.Salt)) !== teks_(baris.PIN)) {
        const gagal = (Number(baris.Gagal) || 0) + 1;
        const ubah = { Gagal: gagal };
        if (gagal >= MAKS_GAGAL_LOGIN) {
          ubah.TerkunciSampai = waktuIso_(new Date(Date.now() + KUNCI_TERKUNCI_MS));
        }
        ubahBaris_('PENGGUNA', 'Email', baris.Email, ubah);
        catatLog_('Login gagal', email, { percobaan: gagal }, email);
        return { success: false, message: PESAN_GAGAL_LOGIN };
      }

      ubahBaris_('PENGGUNA', 'Email', baris.Email, { Gagal: 0, TerkunciSampai: '' });
      migrasiKelas_(); // sekali saja, hanya setelah login staf berhasil (A8)
      if (!simpanSesi_(email)) {
        return { success: false, message: 'Tidak bisa membuat sesi. Muat ulang halaman lalu coba lagi.' };
      }
      catatLog_('Login', email, {}, email);
      return bacaSesi_();
    });
  } catch (e) {
    return { success: false, message: 'Gagal login: ' + e.message };
  }
}

function logout() {
  hapusSesi_();
  return { success: true, message: 'Sudah keluar.' };
}

// CacheService dibungkus agar server tetap jalan di harness uji (tanpa CacheService).
const CACHE_MEMORI_ = {};
function cacheBucket_() {
  if (typeof CacheService !== 'undefined' && CacheService &&
      typeof CacheService.getScriptCache === 'function') {
    return CacheService.getScriptCache();
  }
  return {
    get: function (k) {
      return Object.prototype.hasOwnProperty.call(CACHE_MEMORI_, k) ? CACHE_MEMORI_[k] : null;
    },
    put: function (k, v) { CACHE_MEMORI_[k] = String(v); },
    remove: function (k) { delete CACHE_MEMORI_[k]; }
  };
}

// ============================================================
// SESI & PERAN (B3/B4/B5/B6)
// ============================================================
function getSesi() {
  try {
    const hasil = bacaSesi_();
    if (hasil && hasil.data) hasil.data.versi = APP_VERSI;
    return hasil;
  } catch (e) {
    // Gagal baca = perlakukan sebagai ditolak (fail closed).
    return { success: false, message: 'Gagal membaca sesi: ' + e.message };
  }
}

function bacaSesi_() {
  const tersimpan = bacaSesiTersimpan_();
  // Identitas hanya dari sesi hasil verifikasi PIN — emailAktif() tidak
  // boleh jadi pintu masuk (bisa auto-login tanpa PIN di deploy Workspace).
  const email = keyEmail_(tersimpan && tersimpan.email);

  // Belum login: minta PIN (email pengunjung tidak tersedia di mode execute-as-me).
  if (!email) {
    return {
      success: true,
      data: {
        status: 'belum_login',
        email: '',
        nama: '',
        peran: '',
        bisaTulis: false,
        modeSiswa: false,
        tarunaTerkait: [],
        antrean: { terima: 0, keluar: 0 }
      }
    };
  }

  // Unggul PENGGUNA (hanya baris aktif).
  const pengguna = bacaTabel_('PENGGUNA').filter(function (r) {
    return keyEmail_(r.Email) === email && aktifBenar_(r.Aktif);
  });
  if (pengguna.length) {
    const peran = String(pengguna[0].Peran || '').trim();

    // Akun ortu/siswa terdaftar: taruna terkait dari kolom NISN.
    if (peran === 'Siswa/Ortu') {
      const daftarNisn = String(pengguna[0].NISN === null || pengguna[0].NISN === undefined
        ? '' : pengguna[0].NISN).split(',').map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
      const terkait = bacaTabel_('TARUNA').filter(function (r) {
        return daftarNisn.indexOf(String(r.NISN === null || r.NISN === undefined ? '' : r.NISN).trim()) !== -1;
      }).map(function (r) {
        return {
          nisn: String(r.NISN === null || r.NISN === undefined ? '' : r.NISN).trim(),
          nama: String(r.Nama === null || r.Nama === undefined ? '' : r.Nama).trim(),
          kelas: String(r.Kelas === null || r.Kelas === undefined ? '' : r.Kelas).trim()
        };
      });
      return {
        success: true,
        data: {
          status: 'ok',
          email: email,
          nama: String(pengguna[0].Nama || '').trim(),
          peran: 'Siswa/Ortu',
          bisaTulis: false,
          modeSiswa: true,
          tarunaTerkait: terkait,
          antrean: { terima: 0, keluar: 0 }
        }
      };
    }

    if (PERAN_STAF.indexOf(peran) === -1) return sesiDitolak_(email);
    const kelasWali = peran === 'Wali Kelas' ? teks_(pengguna[0].Kelas) : '';
    // Wali kelas tanpa kelas tidak boleh mendapat akses apa pun.
    if (peran === 'Wali Kelas' && !kelasWali) return sesiDitolak_(email);
    return {
      success: true,
      data: {
        status: 'ok',
        email: email,
        nama: String(pengguna[0].Nama || '').trim(),
        peran: peran,
        kelasWali: kelasWali,
        bisaTulis: PERAN_TULIS.indexOf(peran) !== -1,
        wajibGantiPin: aktifBenar_(pengguna[0].WajibGantiPin),
        bisaKelolaTaruna: PERAN_TULIS.indexOf(peran) !== -1 || peran === 'Wali Kelas',
        modeSiswa: false,
        tarunaTerkait: [],
        antrean: peran === 'Wali Kelas' ? { terima: 0, keluar: 0 } : antrean_()
      }
    };
  }

  // Lalu EmailSiswa/EmailOrtu di TARUNA (satu email boleh cocok beberapa taruna).
  const taruna = bacaTabel_('TARUNA').filter(function (r) {
    return keyEmail_(r.EmailSiswa) === email || keyEmail_(r.EmailOrtu) === email;
  });
  if (taruna.length) {
    return {
      success: true,
      data: {
        status: 'ok',
        email: email,
        nama: String(taruna[0].Nama || '').trim(),
        peran: 'Siswa/Ortu',
        bisaTulis: false,
        modeSiswa: true,
        tarunaTerkait: taruna.map(function (r) {
          return {
            nisn: String(r.NISN === null || r.NISN === undefined ? '' : r.NISN).trim(),
            nama: String(r.Nama === null || r.Nama === undefined ? '' : r.Nama).trim(),
            kelas: String(r.Kelas === null || r.Kelas === undefined ? '' : r.Kelas).trim()
          };
        }),
        antrean: { terima: 0, keluar: 0 }
      }
    };
  }

  return sesiDitolak_(email);
}

// Layar tolak hanya membawa identitas; tanpa angka keuangan apa pun (B5).
function sesiDitolak_(email) {
  return {
    success: true,
    data: {
      status: 'ditolak',
      email: email || '',
      bisaTulis: false,
      modeSiswa: false
    }
  };
}

function antrean_() {
  const hitung = function (nama) {
    return bacaTabel_(nama).filter(function (r) {
      return String(r.Status || '').trim() === STATUS_MENUNGGU;
    }).length;
  };
  return { terima: hitung('PEMBAYARAN'), keluar: hitung('PENGELUARAN') };
}

// Kunci periode audit: TERKUNCI menutup semua tulis, baca tetap jalan.
// Gagal baca pengaturan = anggap TERKUNCI (fail-closed): tulis ditolak
// sampai pembacaan normal lagi. Baca tidak terpengaruh (tidak lewat cek ini).
function cekPeriodeAudit_(aksi) {
  let status = '';
  try {
    status = teks_(petaPengaturan_().PERIODE_AUDIT_STATUS);
  } catch (e) {
    status = 'TERKUNCI';
  }
  if (status !== 'TERKUNCI') return null;
  catatLog_('Tolak periode audit', aksi, {});
  return { success: false, message: 'Periode audit terkunci. Tidak ada penulisan sampai audit selesai.' };
}

// Satu-satunya jalur mengubah kunci (Super Admin, sengaja melewati kunci).
function setPeriodeAudit(d) {
  const sesi = getSesi().data || {};
  if (sesi.status !== 'ok' || sesi.peran !== 'Super Admin') {
    return { success: false, message: 'Hanya Super Admin yang bisa mengubah periode audit.' };
  }
  const status = teks_((d || {}).status).toUpperCase();
  if (['TERBUKA', 'TERKUNCI'].indexOf(status) === -1) {
    return { success: false, message: 'Status harus TERBUKA atau TERKUNCI.' };
  }
  return denganKunci_(function () {
    const diubah = ubahBaris_('PENGATURAN', 'Kunci', 'PERIODE_AUDIT_STATUS', { Nilai: status });
    if (!diubah) tulisBaris_('PENGATURAN', { Kunci: 'PERIODE_AUDIT_STATUS', Nilai: status });
    catatLog_('Ubah periode audit', status, { oleh: sesi.email });
    return { success: true, message: 'Periode audit ' + status + '.' };
  });
}

// null = boleh; selain itu objek penolakan siap dikembalikan ke klien.
function wajibTulis_(aksi) {
  const tolakAudit = cekPeriodeAudit_(aksi);
  if (tolakAudit) return tolakAudit;
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && sesi.bisaTulis) return null;
  return tolak_(aksi, 'Admin/Bendahara');
}

// Gerbang kedua khusus transaksi (D2): hanya Bendahara.
const PERAN_TRANSAKSI = ['Bendahara'];

function wajibTransaksi_(aksi) {
  const tolakAudit = cekPeriodeAudit_(aksi);
  if (tolakAudit) return tolakAudit;
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && PERAN_TRANSAKSI.indexOf(sesi.peran) !== -1) return null;
  return tolak_(aksi, 'Bendahara');
}

// D4: verifikasi boleh oleh Bendahara atau Kepsek; simpan/batal tetap Bendahara.
const PERAN_VERIFIKATOR = ['Bendahara', 'Kepsek'];

function wajibVerifikasi_(aksi) {
  const tolakAudit = cekPeriodeAudit_(aksi);
  if (tolakAudit) return tolakAudit;
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && PERAN_VERIFIKATOR.indexOf(sesi.peran) !== -1) return null;
  return tolak_(aksi, 'Bendahara/Kepsek');
}

// Peran baca-laporan: boleh laporan agregat, ditolak di baca per baris.
const PERAN_LAPORAN = ['Yayasan', 'Auditor'];

function wajibLaporan_(aksi) {
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && PERAN_LAPORAN.indexOf(sesi.peran) !== -1) return null;
  return tolak_(aksi, 'Yayasan/Auditor');
}

function wajibAdmin_(aksi) {
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && !sesi.modeSiswa && sesi.peran === 'Admin') return null;
  return tolak_(aksi, 'Admin');
}

// Gerbang umum: sesi harus login dan perannya termasuk dalam daftar.
function wajibPeranDalam_(sesi, daftar, aksi) {
  const tolakAudit = cekPeriodeAudit_(aksi);
  if (tolakAudit) return tolakAudit;
  if (sesi && sesi.status === 'ok' && daftar.indexOf(sesi.peran) !== -1) return null;
  return tolak_(aksi, daftar.join('/'));
}

// Kelola pengguna (tulis): audit dulu, lalu Admin seperti sebelumnya.
function wajibKelolaPengguna_(aksi) {
  const tolakAudit = cekPeriodeAudit_(aksi);
  if (tolakAudit) return tolakAudit;
  return wajibAdmin_(aksi);
}

// Semua baca global (dashboard, laporan, daftar transaksi) memakai ini.
// Wali kelas hanya mengelola taruna kelasnya, bukan data keuangan sekolah.
function wajibStaf_() {
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && !sesi.modeSiswa && sesi.peran !== 'Wali Kelas') return null;
  return {
    success: false,
    message: 'Akses ditolak: halaman ini hanya untuk petugas sekolah.'
  };
}

// Daftar taruna boleh dilihat semua staf, termasuk wali kelas (difilter kelasnya).
function wajibLihatTaruna_() {
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && !sesi.modeSiswa) return null;
  return {
    success: false,
    message: 'Akses ditolak: halaman ini hanya untuk petugas sekolah.'
  };
}

// Cetak per taruna: data per orang hanya untuk peran yang berhak membaca per taruna.
// Tidak memanggil cekPeriodeAudit_, agar cetak tetap berjalan saat terkunci.
const PERAN_CETAK_PER_TARUNA = ['Admin', 'Bendahara', 'Kasir', 'Kepsek', 'Viewer', 'Super Admin'];

function wajibCetakPerTaruna_(aksi) {
  const sesi = getSesi().data || {};
  if (sesi.status === 'ok' && PERAN_CETAK_PER_TARUNA.indexOf(sesi.peran) !== -1) return null;
  return tolak_(aksi, 'Admin/Bendahara/Kasir/Kepsek/Viewer');
}

// Tambah/ubah taruna: Admin, Bendahara, atau wali kelas (kelasnya sendiri).
function wajibKelolaTaruna_(aksi) {
  const tolakAudit = cekPeriodeAudit_(aksi);
  if (tolakAudit) return tolakAudit;
  const sesi = getSesi().data || {};
  const boleh = sesi.status === 'ok' && !sesi.modeSiswa &&
    (PERAN_TULIS.indexOf(sesi.peran) !== -1 ||
      (sesi.peran === 'Wali Kelas' && !!teks_(sesi.kelasWali)));
  return boleh ? null : tolak_(aksi, 'Admin/Bendahara/Wali Kelas');
}

function tolak_(aksi, siapa) {
  const nama = String(aksi || '').trim();
  return {
    success: false,
    message: 'Akses ditolak: ' + (nama ? nama + ' ' : '') + 'hanya boleh dilakukan ' + siapa + '.'
  };
}

// Jalankan fn sambil memegang script lock. Bila lock tidak didapat,
// tolak dengan pesan siap kirim agar tidak ada dua petugas menulis bersamaan.
function denganKunci_(fn) {
  const lock = LockService.getScriptLock();
  let kunci = false;
  // Satu percobaan tunggu 15 detik: tryLock + waitLock berarti 20 detik dan
  // memakan budget eksekusi 6 menit.
  try {
    kunci = !!(lock && lock.tryLock && lock.tryLock(15000));
  } catch (e) {
    kunci = false;
  }
  if (!kunci) return { success: false, message: 'Server sedang sibuk. Coba lagi beberapa saat.' };
  try {
    return fn();
  } finally {
    try { lock.releaseLock(); } catch (e) { /* abaikan */ }
  }
}
