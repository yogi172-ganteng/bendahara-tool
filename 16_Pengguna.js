// ============================================================
// PENGGUNA & PERAN (admin) + LOG AUDIT (admin)
// ============================================================
function barisPengguna_(r) {
  return {
    email: keyEmail_(r.Email),
    nama: teks_(r.Nama),
    peran: teks_(r.Peran),
    kelas: teks_(r.Kelas),
    aktif: aktifBenar_(r.Aktif),
    nisn: teks_(r.NISN),
    punyaPin: teks_(r.PIN) !== '',
    dicatatOleh: teks_(r.DicatatOleh),
    waktu: teks_(r.Waktu)
  };
}

// Daftar kelas yang benar-benar ada di TARUNA (untuk validasi wali kelas).
function daftarKelas_() {
  const unik = {};
  bacaTabel_('TARUNA').forEach(function (r) {
    const k = teks_(r.Kelas);
    if (k) unik[k] = true;
  });
  return Object.keys(unik).sort(function (a, b) { return a.localeCompare(b, 'id'); });
}

// Jumlah admin aktif selain email tertentu; 0 = email itu admin aktif terakhir.
function adminAktifSelain_(email) {
  const kunci = keyEmail_(email);
  return bacaTabel_('PENGGUNA').filter(function (r) {
    return keyEmail_(r.Email) !== kunci && aktifBenar_(r.Aktif) && teks_(r.Peran) === 'Admin';
  }).length;
}

// Pesan penolakan bila target adalah admin aktif terakhir; '' = boleh dinonaktifkan.
function tolakNonaktifAdminTerakhir_(email) {
  const kunci = keyEmail_(email);
  const target = bacaTabel_('PENGGUNA').filter(function (r) {
    return keyEmail_(r.Email) === kunci;
  })[0];
  if (!target || !aktifBenar_(target.Aktif) || teks_(target.Peran) !== 'Admin') return '';
  return adminAktifSelain_(email) === 0
    ? 'Tidak bisa: ini satu-satunya admin aktif. Angkat admin lain dulu.' : '';
}

function getPengguna() {
  try {
    const tolakan = wajibAdmin_('Lihat pengguna');
    if (tolakan) return tolakan;
    const hasil = bacaTabel_('PENGGUNA').map(barisPengguna_).filter(function (p) {
      return p.email !== '';
    });
    hasil.sort(function (a, b) { return String(a.nama).localeCompare(String(b.nama), 'id'); });
    return { success: true, data: hasil };
  } catch (e) {
    return { success: false, message: 'Gagal membaca pengguna: ' + e.message };
  }
}

function simpanPengguna(d) {
  try {
    const tolakan = wajibKelolaPengguna_('Simpan pengguna');
    if (tolakan) return tolakan;

    const data = d || {};
    const email = keyEmail_(data.email);
    const nama = teks_(data.nama);
    const peran = teks_(data.peran);
    const pin = teks_(data.pin);
    const nisn = teks_(data.nisn);
    const kelas = teks_(data.kelas).toUpperCase();
    const aktif = data.aktif === undefined || data.aktif === null || data.aktif === ''
      ? true : aktifBenar_(data.aktif);

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { success: false, message: 'Email pengguna tidak valid.' };
    }

    // Nama/peran/NISN boleh tidak dikirim saat hanya menyetel PIN.
    const barisAda = bacaTabel_('PENGGUNA').filter(function (r) {
      return keyEmail_(r.Email) === email;
    })[0];
    const namaFinal = nama || teks_(barisAda && barisAda.Nama);
    const peranFinal = peran || teks_(barisAda && barisAda.Peran);
    const pelaku = teks_((getSesi().data || {}).email);

    // Akun sendiri: peran/status/PIN tidak boleh diubah lewat form ini
    // (ganti PIN lewat alur khusus; peran/status lewat admin lain).
    if (email === keyEmail_(pelaku) &&
        (peranFinal !== teks_(barisAda && barisAda.Peran) || aktif === false || pin)) {
      return { success: false, message: 'Peran, status, dan PIN akun sendiri tidak bisa diubah di sini.' };
    }

    if (!namaFinal) return { success: false, message: 'Nama pengguna wajib diisi.' };
    if (PERAN_STAF.indexOf(peranFinal) === -1 && peranFinal !== 'Siswa/Ortu') {
      return { success: false, message: 'Peran harus Admin/Bendahara/Kepsek/Viewer/Wali Kelas/Siswa/Ortu.' };
    }

    // Wali kelas: tepat satu kelas yang ada, dan belum dipegang wali aktif lain.
    let kelasFinal = '';
    if (peranFinal === 'Wali Kelas') {
      kelasFinal = kelas || teks_(barisAda && barisAda.Kelas);
      if (!kelasFinal) {
        return { success: false, message: 'Wali kelas wajib diisi kelasnya.' };
      }
      const kelasSah = daftarKelas_();
      if (kelasSah.indexOf(kelasFinal) === -1) {
        return {
          success: false,
          message: 'Kelas ' + kelasFinal + ' tidak ditemukan. Pilihan: ' + kelasSah.join(', ') + '.'
        };
      }
      const bentrok = bacaTabel_('PENGGUNA').filter(function (r) {
        return keyEmail_(r.Email) !== email && aktifBenar_(r.Aktif) &&
          teks_(r.Peran) === 'Wali Kelas' && teks_(r.Kelas) === kelasFinal;
      })[0];
      if (bentrok) {
        return {
          success: false,
          message: 'Kelas ' + kelasFinal + ' sudah dipegang wali kelas ' +
            (teks_(bentrok.Nama) || keyEmail_(bentrok.Email)) + '.'
        };
      }
    }

    // Akun siswa/ortu wajib menunjuk minimal satu NISN yang terdaftar.
    let daftarNisn = teks_(barisAda && barisAda.NISN);
    if (peranFinal === 'Siswa/Ortu') {
      const daftar = (nisn || daftarNisn).split(',').map(function (s) { return s.trim(); })
        .filter(function (s) { return s; });
      if (!daftar.length) {
        return { success: false, message: 'Akun Siswa/Ortu wajib diisi NISN (pisahkan dengan koma).' };
      }
      const terdaftar = {};
      bacaTabel_('TARUNA').forEach(function (r) {
        terdaftar[teks_(r.NISN)] = true;
      });
      const asing = daftar.filter(function (n) { return !terdaftar[n]; });
      if (asing.length) {
        return { success: false, message: 'NISN tidak terdaftar: ' + asing.join(', ') };
      }
      daftarNisn = daftar.join(',');
    }

    if (pin && (pin.length < PIN_MIN || pin.length > PIN_MAKS)) {
      return { success: false, message: 'PIN harus ' + PIN_MIN + '-' + PIN_MAKS + ' karakter.' };
    }

    // Akun siswa/ortu baru wajib ber-PIN: email Google mereka tidak terbaca
    // di web app, jadi email + PIN satu-satunya jalan masuk.
    if (peranFinal === 'Siswa/Ortu' && !barisAda && !pin) {
      return {
        success: false,
        message: 'Akun siswa/ortu baru wajib diberi PIN (minimal ' + PIN_MIN + ' karakter).'
      };
    }

    const tetapAdmin = aktif && peranFinal === 'Admin';
    const isi = {
      Email: email, Nama: namaFinal, Peran: peranFinal, Kelas: kelasFinal,
      Aktif: aktif ? 'Ya' : 'Tidak',
      DicatatOleh: pelaku, Waktu: waktuIso_()
    };
    // NISN hanya bermakna untuk akun Siswa/Ortu; jangan tinggalkan rujukan
    // basi yang menghalangi hapus/perbaikan NISN taruna.
    isi.NISN = peranFinal === 'Siswa/Ortu' ? daftarNisn : '';
    if (pin) {
      const salt = buatSalt_();
      isi.Salt = salt;
      isi.PIN = hashPin_(pin, salt);
      isi.Gagal = 0;
      isi.TerkunciSampai = '';
      isi.WajibGantiPin = 'Tidak';
    }

    return denganKunci_(function () {
      // Baca ulang di dalam lock: menurunkan peran dan menonaktifkan admin
      // tidak boleh berjalan bersamaan sampai menyisakan nol admin aktif.
      const kini = bacaTabel_('PENGGUNA').filter(function (r) {
        return keyEmail_(r.Email) === email;
      })[0];
      const adminKini = !!(kini && aktifBenar_(kini.Aktif) && teks_(kini.Peran) === 'Admin');
      if (adminKini && !tetapAdmin && adminAktifSelain_(email) === 0) {
        return {
          success: false,
          message: 'Tidak bisa: ini satu-satunya admin aktif. Angkat admin lain dulu.'
        };
      }

      const ada = ubahBarisCocok_('PENGGUNA', function (r) {
        return keyEmail_(r.Email) === email;
      }, isi);
      if (!ada) tulisBaris_('PENGGUNA', isi);
      if (pin) cabutSesiEmail_(email);

      catatLog_('Simpan pengguna', email, {
        nama: namaFinal, peran: peranFinal, kelas: kelasFinal, aktif: aktif, pinDiatur: !!pin
      });
      return {
        success: true,
        data: {
          email: email, nama: namaFinal, peran: peranFinal, kelas: kelasFinal,
          aktif: aktif, pinDiatur: !!pin
        }
      };
    });
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan pengguna: ' + e.message };
  }
}

function nonaktifkanPengguna(email) {
  try {
    const tolakan = wajibKelolaPengguna_('Nonaktifkan pengguna');
    if (tolakan) return tolakan;

    const emailBersih = keyEmail_(email);
    if (!emailBersih) return { success: false, message: 'Email pengguna wajib diisi.' };
    if (emailBersih === keyEmail_((getSesi().data || {}).email)) {
      return { success: false, message: 'Tidak bisa menonaktifkan akun sendiri.' };
    }
    return denganKunci_(function () {
      const target = bacaTabel_('PENGGUNA').filter(function (r) {
        return keyEmail_(r.Email) === emailBersih;
      })[0];
      if (!target) {
        return { success: false, message: 'Pengguna ' + emailBersih + ' tidak ditemukan.' };
      }
      const tolakanAdmin = tolakNonaktifAdminTerakhir_(emailBersih);
      if (tolakanAdmin) return { success: false, message: tolakanAdmin };
      ubahBarisCocok_('PENGGUNA', function (r) {
        return keyEmail_(r.Email) === emailBersih;
      }, { Aktif: 'Tidak' });
      cabutSesiEmail_(emailBersih);
      catatLog_('Nonaktifkan pengguna', emailBersih, {});
      return { success: true, message: 'Pengguna dinonaktifkan.' };
    });
  } catch (e) {
    return { success: false, message: 'Gagal menonaktifkan pengguna: ' + e.message };
  }
}

function getLog(filter) {
  try {
    const tolakan = wajibAdmin_('Lihat log audit');
    if (tolakan) return tolakan;

    const f = filter || {};
    const q = teks_(f.q).toLowerCase();
    const aksi = teks_(f.aksi);
    const akun = keyEmail_(f.akun);
    const batas = Math.min(500, Math.max(1, Number(f.limit) || 100));

    const hasil = bacaTabel_('LOG').map(function (r) {
      return {
        waktu: teks_(r.Waktu), akun: keyEmail_(r.Akun),
        aksi: teks_(r.Aksi), objek: teks_(r.Objek), detail: teks_(r.Detail)
      };
    }).filter(function (r) {
      if (aksi && r.aksi !== aksi) return false;
      if (akun && r.akun !== akun) return false;
      if (q) {
        const cari = (r.akun + ' ' + r.aksi + ' ' + r.objek + ' ' + r.detail).toLowerCase();
        if (cari.indexOf(q) === -1) return false;
      }
      return true;
    });

    hasil.sort(function (a, b) {
      return String(b.waktu).localeCompare(String(a.waktu), 'id');
    });
    return { success: true, data: hasil.slice(0, batas) };
  } catch (e) {
    return { success: false, message: 'Gagal membaca log audit: ' + e.message };
  }
}