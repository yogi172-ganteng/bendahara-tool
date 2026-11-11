// ============================================================
// DATA TARUNA
// ============================================================

// Satu baris sheet TARUNA -> objek untuk klien (tanpa kolom audit).
function barisanTaruna_(r) {
  const ambil = function (k) {
    return String(r[k] === null || r[k] === undefined ? '' : r[k]).trim();
  };
  return {
    nisn: ambil('NISN'),
    nit: ambil('NIT'),
    nama: ambil('Nama'),
    jenisKelamin: ambil('Jenis Kelamin'),
    angkatan: ambil('Angkatan'),
    tingkat: ambil('Tingkat'),
    program: ambil('Program'),
    rombel: ambil('Rombel'),
    kelas: ambil('Kelas'),
    emailSiswa: ambil('EmailSiswa'),
    emailOrtu: ambil('EmailOrtu'),
    status: ambil('Status'),
    tanggalMasuk: ambil('TanggalMasuk'),
    catatan: ambil('Catatan')
  };
}

// Kelas terformat: "X NKPI A" (Rombel boleh kosong).
function kelasTaruna_(tingkat, program, rombel) {
  return [tingkat, program, rombel].filter(function (x) { return x; }).join(' ');
}

// Apakah taruna berada di kelas wali (mis. "X NKPI A").
// Wali "X NKN" (tanpa rombel) mengawasi semua rombel tingkat+program itu.
function dalamKelasWali_(t, kelasWali) {
  const bagian = teks_(kelasWali).toUpperCase().split(/\s+/).filter(function (x) { return x; });
  if (bagian.length < 2) return false;
  if (teks_(t.tingkat).toUpperCase() !== bagian[0]) return false;
  if (teks_(t.program).toUpperCase() !== bagian[1]) return false;
  if (bagian[2] && teks_(t.rombel).toUpperCase() !== bagian[2]) return false;
  return true;
}

// ============================================================
// ATURAN GLOBAL NAMA KELAS
// ------------------------------------------------------------
// Huruf rombel hanya ditampilkan bila satu (tingkat, program) punya
// LEBIH DARI SATU rombel:
//   - X NKN (hanya rombel A)      -> "X NKN"
//   - X TKN (rombel A dan B)      -> "X TKN A", "X TKN B"
// Nilai ini kolektif, jadi harus dihitung ulang setiap daftar taruna
// berubah (simpan/ubah/hapus/impor) lewat hitungUlangKelas_.
// ============================================================
function kelasEfektif_(tingkat, program, rombel, jumlahRombel) {
  const dasar = [teks_(tingkat), teks_(program)].filter(function (x) { return x; }).join(' ');
  const r = teks_(rombel).toUpperCase();
  if (!dasar) return '';
  if (!r) return dasar;
  return Number(jumlahRombel) > 1 ? dasar + ' ' + r : dasar;
}

// Hitung ulang kolom Kelas untuk SELURUH baris TARUNA.
// Balikan { diubah: jumlah baris yang nilainya diperbaiki }.
function hitungUlangKelas_() {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName('TARUNA');
  if (!sheet || sheet.getLastRow() < 2) return { diubah: 0 };

  const nilai = sheet.getDataRange().getValues();
  const headers = nilai[0].map(function (h) { return String(h).trim(); });
  const iTingkat = headers.indexOf('Tingkat');
  const iProgram = headers.indexOf('Program');
  const iRombel = headers.indexOf('Rombel');
  const iKelas = headers.indexOf('Kelas');
  if (iTingkat === -1 || iProgram === -1 || iRombel === -1 || iKelas === -1) {
    return { diubah: 0 };
  }

  // 1) Kumpulkan rombel unik per (tingkat|program).
  const peta = {};
  for (let i = 1; i < nilai.length; i++) {
    const tingkat = String(nilai[i][iTingkat] || '').trim().toUpperCase();
    const program = String(nilai[i][iProgram] || '').trim().toUpperCase();
    const rombel = String(nilai[i][iRombel] || '').trim().toUpperCase();
    if (!tingkat || !program) continue;
    const kunci = tingkat + '|' + program;
    if (!peta[kunci]) peta[kunci] = {};
    if (rombel) peta[kunci][rombel] = true;
  }

  // 2) Tulis Kelas yang benar sekaligus (satu setValues).
  const kolomKelas = nilai.map(function (baris) { return baris[iKelas]; });
  let diubah = 0;
  for (let i = 1; i < nilai.length; i++) {
    const tingkat = String(nilai[i][iTingkat] || '').trim().toUpperCase();
    const program = String(nilai[i][iProgram] || '').trim().toUpperCase();
    const rombel = String(nilai[i][iRombel] || '').trim().toUpperCase();
    if (!tingkat || !program) continue;
    const jumlah = Object.keys(peta[tingkat + '|' + program] || {}).length;
    const baru = kelasEfektif_(tingkat, program, rombel, jumlah);
    if (String(nilai[i][iKelas] || '').trim() !== baru) {
      kolomKelas[i] = baru;
      diubah++;
    }
  }
  if (diubah) {
    sheet.getRange(2, iKelas + 1, kolomKelas.length - 1, 1)
      .setValues(kolomKelas.slice(1).map(function (v) { return [v === undefined ? '' : v]; }));
  }
  return { diubah: diubah };
}

// Migrasi sekali jalan setelah deploy: rapikan seluruh Kelas lama.
function migrasiKelas_() {
  try {
    if (teks_(petaPengaturan_().KelasV2) === 'ya') return;
    const hasil = hitungUlangKelas_();
    const ada = ubahBarisCocok_('PENGATURAN', function (r) {
      return teks_(r.Kunci) === 'KelasV2';
    }, { Kunci: 'KelasV2', Nilai: 'ya' });
    if (!ada) tulisBaris_('PENGATURAN', { Kunci: 'KelasV2', Nilai: 'ya' });
    catatLog_('Migrasi nama kelas', 'TARUNA', { diubah: hasil.diubah });
  } catch (e) {
    /* migrasi tidak boleh menggagalkan pemuatan aplikasi */
  }
}

// Angkatan = tahun masuk. Bila admin tidak mengisinya, turunkan dari tingkat
// dan tahun ajaran aktif (X = tahun awal TA, XI = setahun sebelum, XII = dua tahun).
// tahunAjaran opsional: impor massal membacanya sekali, bukan per baris.
function angkatanDariTingkat_(tingkat, tahunAjaran) {
  const ta = tahunAjaran || tahunAjaranAktif_();
  const m = /^(\d{4})\/\d{4}$/.exec(ta);
  const tahunAwal = m ? Number(m[1]) : new Date().getFullYear();
  const selisih = { X: 0, XI: 1, XII: 2 }[String(tingkat || '').trim().toUpperCase()];
  if (selisih === undefined) return '';
  return String(tahunAwal - selisih);
}

// Status keluar yang tidak boleh disimpan selama masih ada tunggakan.
const STATUS_KELUAR_TARUNA = ['PINDAH', 'DO', 'WAFAT'];

// C2: status taruna AKTIF/CUTI/LULUS/PINDAH/DO/WAFAT (kosong = AKTIF).
// Mengembalikan nilai baku, atau '' bila tidak dikenal.
function statusTaruna_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  if (!s) return 'AKTIF';
  if (s === 'MENINGGAL') return 'WAFAT';
  return ['AKTIF', 'CUTI', 'LULUS', 'PINDAH', 'DO', 'WAFAT'].indexOf(s) !== -1 ? s : '';
}

// Langkah migrasi: NISN yang masih berstatus lama "Keluar" (baca saja).
function cekStatusKeluarTaruna_() {
  return bacaTabel_('TARUNA')
    .filter(function (r) { return teks_(r.Status).toLowerCase() === 'keluar'; })
    .map(function (r) { return teks_(r.NISN); });
}

// Sah -> { sah: true, data: baris bersih }; tidak -> { sah: false, field, alasan }.
function validasiTaruna_(d) {
  const data = d || {};
  const nisn = String(data.nisn === null || data.nisn === undefined ? '' : data.nisn).trim();
  if (!nisn) return { sah: false, field: 'nisn', alasan: 'NISN wajib diisi.' };
  if (!/^\d{10}$/.test(nisn)) {
    return { sah: false, field: 'nisn', alasan: 'NISN harus 10 digit angka.' };
  }

  const nama = String(data.nama === null || data.nama === undefined ? '' : data.nama).trim();
  if (!nama) return { sah: false, field: 'nama', alasan: 'Nama wajib diisi.' };

  const tingkat = String(data.tingkat === null || data.tingkat === undefined ? '' : data.tingkat).trim().toUpperCase();
  if (['X', 'XI', 'XII'].indexOf(tingkat) === -1) {
    return { sah: false, field: 'tingkat', alasan: 'Tingkat harus X/XI/XII.' };
  }

  // Angkatan opsional: diturunkan dari tingkat + tahun ajaran bila kosong.
  let angkatan = String(data.angkatan === null || data.angkatan === undefined ? '' : data.angkatan).trim().replace(/\D/g, '');
  if (!angkatan) angkatan = angkatanDariTingkat_(tingkat);
  if (angkatan.length !== 4) {
    return { sah: false, field: 'angkatan', alasan: 'Tahun masuk harus 4 digit tahun (mis. 2026).' };
  }

  const program = String(data.program === null || data.program === undefined ? '' : data.program).trim().toUpperCase();
  if (['NKPI', 'TKN', 'NKN'].indexOf(program) === -1) {
    return { sah: false, field: 'program', alasan: 'Program harus NKPI/TKN/NKN.' };
  }

  const rombel = String(data.rombel === null || data.rombel === undefined ? '' : data.rombel).trim().toUpperCase();
  let jk = String(data.jenisKelamin === null || data.jenisKelamin === undefined ? '' : data.jenisKelamin).trim();
  const awalJk = jk ? jk.charAt(0).toUpperCase() : '';
  if (awalJk === 'L') jk = 'Laki-laki';
  else if (awalJk === 'P') jk = 'Perempuan';

  const status = statusTaruna_(data.status);
  if (!status) return { sah: false, field: 'status', alasan: 'Status harus AKTIF/CUTI/LULUS/PINDAH/DO/WAFAT.' };

  return {
    sah: true,
    data: {
      nisn: nisn,
      nit: String(data.nit === null || data.nit === undefined ? '' : data.nit).trim(),
      nama: nama,
      jenisKelamin: jk,
      angkatan: angkatan,
      tingkat: tingkat,
      program: program,
      rombel: rombel,
      kelas: kelasTaruna_(tingkat, program, rombel),
      emailSiswa: keyEmail_(data.emailSiswa),
      emailOrtu: keyEmail_(data.emailOrtu),
      status: status,
      tanggalMasuk: String(data.tanggalMasuk === null || data.tanggalMasuk === undefined ? '' : data.tanggalMasuk).trim(),
      catatan: String(data.catatan === null || data.catatan === undefined ? '' : data.catatan).trim()
    }
  };
}

// Timpa nisn juga dipakai saat cek unik. kecualiNisn dipakai perbarui.
function nisnTerdaftar_(daftar, nisn, kecualiNisn) {
  return daftar.some(function (t) {
    return t.nisn === nisn && (!kecualiNisn || nisn !== kecualiNisn);
  });
}

function getTaruna(filter) {
  try {
    const tolakan = wajibLihatTaruna_();
    if (tolakan) return tolakan;

    const f = filter || {};
    const q = String(f.q || '').trim().toLowerCase();
    const angkatan = String(f.angkatan || '').trim();
    const tingkat = String(f.tingkat || '').trim();
    const status = String(f.status || '').trim();
    const kelasWali = teks_((getSesi().data || {}).kelasWali);

    const hasil = bacaTabel_('TARUNA').map(barisanTaruna_).filter(function (t) {
      if (kelasWali && !dalamKelasWali_(t, kelasWali)) return false;
      if (q && (t.nama + ' ' + t.nisn + ' ' + t.nit).toLowerCase().indexOf(q) === -1) return false;
      if (angkatan && t.angkatan !== angkatan) return false;
      if (tingkat && t.tingkat !== tingkat) return false;
      if (status && t.status !== status) return false;
      return true;
    });
    hasil.sort(function (a, b) {
      return a.nama.localeCompare(b.nama, 'id') || a.nisn.localeCompare(b.nisn);
    });
    return { success: true, data: halaman_(hasil, f) };
  } catch (e) {
    return { success: false, message: 'Gagal membaca data taruna: ' + e.message };
  }
}

// Tulis taruna memegang script lock: dua admin yang menyimpan/menghapus
// bersamaan tidak boleh saling menimpa atau menulis ke baris yang bergeser.
function simpanTaruna(d) {
  return denganKunci_(function () { return simpanTarunaIsi_(d); });
}

function simpanTarunaIsi_(d) {
  try {
    const tolakan = wajibKelolaTaruna_('Menyimpan data taruna');
    if (tolakan) return tolakan;

    const hasil = validasiTaruna_(d);
    if (!hasil.sah) return { success: false, message: hasil.alasan };
    const data = hasil.data;

    const sesi = getSesi().data || {};
    if (sesi.peran === 'Wali Kelas' && !dalamKelasWali_(data, sesi.kelasWali)) {
      return {
        success: false,
        message: 'Wali kelas hanya boleh menambah taruna di kelas ' + sesi.kelasWali + '.'
      };
    }

    const semua = bacaTabel_('TARUNA').map(barisanTaruna_);
    if (nisnTerdaftar_(semua, data.nisn)) {
      return { success: false, message: 'NISN ' + data.nisn + ' sudah terdaftar.' };
    }

    tulisBaris_('TARUNA', Object.assign({
      DicatatOleh: teks_((getSesi().data || {}).email) || emailAktif(),
      Waktu: waktuIso_()
    }, {
      NISN: data.nisn, NIT: data.nit, Nama: data.nama, 'Jenis Kelamin': data.jenisKelamin,
      Angkatan: data.angkatan, Tingkat: data.tingkat, Program: data.program,
      Rombel: data.rombel, Kelas: data.kelas, EmailSiswa: data.emailSiswa,
      EmailOrtu: data.emailOrtu, Status: data.status, TanggalMasuk: data.tanggalMasuk,
      Catatan: data.catatan
    }));
    hitungUlangKelas_();
    hapusCacheDashboard_();
    const tersimpan = bacaTabel_('TARUNA').filter(function (r) {
      return String(r.NISN === null || r.NISN === undefined ? '' : r.NISN).trim() === data.nisn;
    })[0] || {};
    const kelasFinal = String(tersimpan.Kelas || data.kelas || '').trim();
    catatLog_('Simpan taruna', data.nisn, { nisn: data.nisn, nama: data.nama, kelas: kelasFinal });
    return { success: true, message: 'Data taruna tersimpan.', data: { nisn: data.nisn, kelas: kelasFinal } };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan data taruna: ' + e.message };
  }
}

function perbaruiTaruna(d, nisnLama) {
  return denganKunci_(function () { return perbaruiTarunaIsi_(d, nisnLama); });
}

function perbaruiTarunaIsi_(d, nisnLama) {
  try {
    const tolakan = wajibKelolaTaruna_('Memperbarui data taruna');
    if (tolakan) return tolakan;

    const kunciLama = String(nisnLama === null || nisnLama === undefined ? '' : nisnLama).trim();
    if (!kunciLama) return { success: false, message: 'NISN lama wajib disertakan untuk memperbarui.' };

    const hasil = validasiTaruna_(d);
    if (!hasil.sah) return { success: false, message: hasil.alasan };
    const data = hasil.data;

    const daftar = bacaTabel_('TARUNA').map(barisanTaruna_);
    const lama = daftar.filter(function (t) { return t.nisn === kunciLama; })[0];
    if (!lama) {
      return { success: false, message: 'NISN ' + kunciLama + ' tidak ditemukan.' };
    }

    const sesi = getSesi().data || {};
    if (sesi.peran === 'Wali Kelas') {
      if (!dalamKelasWali_(lama, sesi.kelasWali)) {
        return { success: false, message: 'Taruna ini bukan anggota kelas ' + sesi.kelasWali + '.' };
      }
      if (!dalamKelasWali_(data, sesi.kelasWali)) {
        return {
          success: false,
          message: 'Wali kelas tidak boleh memindahkan taruna keluar dari kelas ' + sesi.kelasWali + '.'
        };
      }
    }

    // Taruna yang masih menunggak tidak boleh dikeluarkan dulu.
    const jadiKeluar = teks_(data.status).toLowerCase() === 'keluar';
    const sudahKeluar = teks_(lama.status).toLowerCase() === 'keluar';
    if (jadiKeluar && !sudahKeluar) {
      const belum = bacaTabel_('TAGIHAN').map(barisTagihan_).filter(function (t) {
        return t.nisn === kunciLama && t.status !== 'Lunas' && t.sisa > 0;
      });
      if (belum.length) {
        const sisa = belum.reduce(function (a, t) { return a + t.sisa; }, 0);
        const tunggu = belum.reduce(function (a, t) { return a + (t.menungguVerifikasi || 0); }, 0);
        return {
          success: false,
          message: 'Status tidak bisa diubah menjadi Keluar: masih ada ' + belum.length +
            ' tagihan belum lunas dengan sisa Rp ' + sisa +
            (tunggu ? ' (Rp ' + tunggu + ' menunggu verifikasi)' : '') +
            '. Lunasi dulu, atau biarkan status Aktif/Lulus.'
        };
      }
    }

    // C2: PINDAH/DO/WAFAT tidak boleh disimpan selama masih ada tunggakan.
    // WAFAT butuh pemutihan yang belum ada alurnya (ditolak dengan pesan khusus).
    const statusBaru = statusTaruna_(data.status) || data.status;
    const statusLama = statusTaruna_(lama.status) || lama.status;
    const punyaTunggakan = bacaTabel_('TAGIHAN').map(barisTagihan_).some(function (t) {
      return t.nisn === kunciLama && t.status !== 'Lunas' && t.sisa > 0;
    });

    if (STATUS_KELUAR_TARUNA.indexOf(statusBaru) !== -1 && statusBaru !== statusLama && punyaTunggakan) {
      if (statusBaru === 'WAFAT') {
        return {
          success: false,
          message: 'Taruna WAFAT dengan tunggakan hanya bisa setelah pengajuan pemutihan disetujui. Pemutihan belum tersedia.'
        };
      }
      return {
        success: false,
        message: 'Status ' + statusBaru + ' tidak bisa disimpan: taruna masih punya tunggakan. Lunasi dulu.'
      };
    }

    if (data.nisn !== kunciLama && nisnTerdaftar_(daftar, data.nisn)) {
      return { success: false, message: 'NISN ' + data.nisn + ' sudah terdaftar.' };
    }

    // NISN yang sudah dipakai riwayat/akun tidak boleh diganti: semua
    // TAGIHAN/PEMBAYARAN/POTONGAN dan akun ortu menunjuk NISN lama.
    if (data.nisn !== kunciLama) {
      const riwayat = ['TAGIHAN', 'PEMBAYARAN', 'POTONGAN'].filter(function (nama) {
        return bacaTabel_(nama).some(function (r) { return teks_(r.NISN) === kunciLama; });
      });
      const dipakaiAkun = bacaTabel_('PENGGUNA').some(function (r) {
        return teks_(r.NISN).split(',').map(function (s) { return s.trim(); })
          .indexOf(kunciLama) !== -1;
      });
      if (riwayat.length || dipakaiAkun) {
        return {
          success: false,
          message: 'NISN ' + kunciLama + ' tidak bisa diubah karena masih dipakai ' +
            (riwayat.length ? 'riwayat ' + riwayat.join(', ') : '') +
            (riwayat.length && dipakaiAkun ? ' dan ' : '') +
            (dipakaiAkun ? 'akun siswa/ortu' : '') +
            '. NISN hanya boleh diperbaiki untuk taruna tanpa riwayat dan tanpa akun terkait.'
        };
      }
    }

    const diubah = ubahBaris_('TARUNA', 'NISN', kunciLama, {
      NISN: data.nisn, NIT: data.nit, Nama: data.nama, 'Jenis Kelamin': data.jenisKelamin,
      Angkatan: data.angkatan, Tingkat: data.tingkat, Program: data.program,
      Rombel: data.rombel, Kelas: data.kelas, EmailSiswa: data.emailSiswa,
      EmailOrtu: data.emailOrtu, Status: data.status, TanggalMasuk: data.tanggalMasuk,
      Catatan: data.catatan
    });
    if (!diubah) return { success: false, message: 'NISN ' + kunciLama + ' tidak ditemukan.' };

    hitungUlangKelas_();
    hapusCacheDashboard_();
    catatLog_('Perbarui taruna', data.nisn, { lama: kunciLama, baru: data.nisn, nama: data.nama });
    return { success: true, message: 'Perubahan data taruna tersimpan.', data: { nisn: data.nisn } };
  } catch (e) {
    return { success: false, message: 'Gagal memperbarui data taruna: ' + e.message };
  }
}

// Hapus baris berdasarkan kolom kunci. true = ketemu & dihapus.
function hapusBaris_(nama, kolomKunci, nilaiKunci) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(nama);
  if (!sheet || sheet.getLastRow() < 2) return false;

  const nilai = sheet.getDataRange().getValues();
  const headers = nilai[0].map(function (h) { return String(h).trim(); });
  const idx = headers.indexOf(kolomKunci);
  if (idx === -1) return false;

  for (let i = 1; i < nilai.length; i++) {
    if (String(nilai[i][idx]).trim() !== String(nilaiKunci).trim()) continue;
    sheet.deleteRow(i + 1);
    return true;
  }
  return false;
}

function hapusTaruna(nisn) {
  return denganKunci_(function () { return hapusTarunaIsi_(nisn); });
}

function hapusTarunaIsi_(nisn) {
  try {
    const tolakan = wajibTulis_('Menghapus data taruna');
    if (tolakan) return tolakan;

    const nisnBersih = String(nisn === null || nisn === undefined ? '' : nisn).trim();
    if (!nisnBersih) return { success: false, message: 'NISN wajib disertakan untuk menghapus.' };

    // Taruna berriwayat keuangan tidak boleh dihapus: tunggakan/pembayaran
    // lama akan kehilangan pemilik. Pakai Status Lulus/Keluar.
    const riwayat = ['TAGIHAN', 'PEMBAYARAN', 'POTONGAN'].filter(function (nama) {
      return bacaTabel_(nama).some(function (r) { return teks_(r.NISN) === nisnBersih; });
    });
    if (riwayat.length) {
      return {
        success: false,
        message: 'Taruna ' + nisnBersih + ' sudah punya riwayat (' + riwayat.join(', ') +
          '). Ubah Status menjadi Lulus/Keluar, jangan dihapus.'
      };
    }

    // Akun siswa/ortu yang menunjuk NISN ini akan menjadi yatim bila dihapus.
    const akunTerkait = bacaTabel_('PENGGUNA').some(function (r) {
      return teks_(r.NISN).split(',').map(function (s) { return s.trim(); })
        .indexOf(nisnBersih) !== -1;
    });
    if (akunTerkait) {
      return {
        success: false,
        message: 'Taruna ' + nisnBersih + ' masih terhubung ke akun siswa/ortu. ' +
          'Hapus NISN ini dari akun tersebut dulu, lalu hapus taruna.'
      };
    }

    if (!hapusBaris_('TARUNA', 'NISN', nisnBersih)) {
      return { success: false, message: 'NISN ' + nisnBersih + ' tidak ditemukan.' };
    }
    hitungUlangKelas_();
    hapusCacheDashboard_();
    catatLog_('Hapus taruna', nisnBersih, {});
    return { success: true, message: 'Data taruna dihapus.', data: { nisn: nisnBersih } };
  } catch (e) {
    return { success: false, message: 'Gagal menghapus data taruna: ' + e.message };
  }
}
