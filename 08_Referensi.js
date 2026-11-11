// ============================================================
// PENGATURAN & REFERENSI
// Jenis biaya, tarif per angkatan (B13), kategori pengeluaran,
// dan pengaturan sekolah + saldo awal (B18).
// Seluruh fungsi tulis di sini wajibAdmin_ (R2); baca untuk staf
// (mode siswa/ortu tidak boleh melihat nilai global sekolah).
// ============================================================

const PERIODE_JENIS_BIAYA = ['Bulanan', 'Tahunan', 'Sekali'];

// Satu baris sheet JENIS_BIAYA -> objek untuk klien (tanpa kolom audit).
function barisJenisBiaya_(r) {
  return {
    kode: String(r.Kode === null || r.Kode === undefined ? '' : r.Kode).trim(),
    nama: String(r.Nama === null || r.Nama === undefined ? '' : r.Nama).trim(),
    periode: String(r.Periode === null || r.Periode === undefined ? '' : r.Periode).trim(),
    urutan: Number(r.Urutan) || 0,
    aktif: aktifBenar_(r.Aktif)
  };
}

// Satu baris sheet TARIF -> objek untuk klien. Nominal selalu angka.
function barisTarif_(r) {
  return {
    jenisBiaya: String(r.JenisBiaya === null || r.JenisBiaya === undefined ? '' : r.JenisBiaya).trim(),
    angkatan: String(r.Angkatan === null || r.Angkatan === undefined ? '' : r.Angkatan).trim(),
    tahunAjaran: String(r.TahunAjaran === null || r.TahunAjaran === undefined ? '' : r.TahunAjaran).trim(),
    nominal: Number(r.Nominal) || 0
  };
}

// Satu baris sheet KATEGORI_PENGELUARAN -> objek untuk klien.
function barisKategoriPengeluaran_(r) {
  return {
    nama: String(r.Nama === null || r.Nama === undefined ? '' : r.Nama).trim(),
    aktif: aktifBenar_(r.Aktif)
  };
}

// Sheet PENGATURAN (kunci–nilai) -> objek sederhana { Kunci: Nilai }.
function petaPengaturan_() {
  const peta = {};
  bacaTabel_('PENGATURAN').forEach(function (r) {
    peta[String(r.Kunci === null || r.Kunci === undefined ? '' : r.Kunci).trim()] = r.Nilai;
  });
  return peta;
}

// Tahun ajaran aktif yang tahan data lama/kosong (self-heal PENGATURAN).
function tahunAjaranAktif_() {
  const peta = petaPengaturan_();
  let ta = teks_(peta.TahunAjaranAktif);
  if (!/^\d{4}\/\d{4}$/.test(ta)) {
    ta = '2026/2027';
    try {
      const ada = ubahBarisCocok_('PENGATURAN', function (r) {
        return teks_(r.Kunci) === 'TahunAjaranAktif';
      }, { Kunci: 'TahunAjaranAktif', Nilai: ta });
      if (!ada) tulisBaris_('PENGATURAN', { Kunci: 'TahunAjaranAktif', Nilai: ta });
    } catch (e) { /* biarkan */ }
  }
  return ta;
}

function getJenisBiaya() {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    const hasil = bacaTabel_('JENIS_BIAYA').map(barisJenisBiaya_);
    hasil.sort(function (a, b) {
      return a.urutan - b.urutan || a.kode.localeCompare(b.kode, 'id');
    });
    return { success: true, data: hasil };
  } catch (e) {
    return { success: false, message: 'Gagal membaca jenis biaya: ' + e.message };
  }
}

// Upsert pada kunci Kode: kode lama = perbarui, kode baru = tambah (B14).
// Tulis referensi memegang lock: dua admin yang menyimpan bersamaan tidak
// boleh menyisipkan baris kembar (kode/triplet tarif sama).
function simpanJenisBiaya(d) {
  return denganKunci_(function () { return simpanJenisBiayaIsi_(d); });
}

function simpanJenisBiayaIsi_(d) {
  try {
    const tolakAudit = cekPeriodeAudit_('Menyimpan jenis biaya');
    if (tolakAudit) return tolakAudit;
    const tolakan = wajibAdmin_('Menyimpan jenis biaya');
    if (tolakan) return tolakan;

    const data = d || {};
    const kode = String(data.kode === null || data.kode === undefined ? '' : data.kode).trim().toUpperCase();
    const nama = String(data.nama === null || data.nama === undefined ? '' : data.nama).trim();
    const periode = String(data.periode === null || data.periode === undefined ? '' : data.periode).trim();
    if (!kode) return { success: false, message: 'Kode jenis biaya wajib diisi.' };
    if (!nama) return { success: false, message: 'Nama jenis biaya wajib diisi.' };
    if (PERIODE_JENIS_BIAYA.indexOf(periode) === -1) {
      return { success: false, message: 'Periode harus Bulanan/Tahunan/Sekali.' };
    }

    let urutan = Math.round(Number(data.urutan));
    if (!isFinite(urutan) || urutan < 1) urutan = 999;

    const aktif = data.aktif === undefined || data.aktif === null || data.aktif === ''
      ? true : aktifBenar_(data.aktif);

    const baru = !bacaTabel_('JENIS_BIAYA').some(function (r) {
      return String(r.Kode === null || r.Kode === undefined ? '' : r.Kode).trim() === kode;
    });

    const baris = {
      Kode: kode, Nama: nama, Periode: periode,
      Urutan: urutan, Aktif: aktif ? 'Ya' : 'Tidak'
    };
    if (baru) {
      tulisBaris_('JENIS_BIAYA', baris);
    } else {
      ubahBaris_('JENIS_BIAYA', 'Kode', kode, baris);
    }

    catatLog_('Simpan jenis biaya', kode, { nama: nama, periode: periode, urutan: urutan, baru: baru });
    return { success: true, message: 'Jenis biaya tersimpan.', data: { kode: kode, baru: baru } };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan jenis biaya: ' + e.message };
  }
}

// Nonaktifkan jenis biaya (riwayat tetap tersimpan, tidak dihapus).
function nonaktifkanJenisBiaya(kode) {
  try {
    const tolakAudit = cekPeriodeAudit_('Menonaktifkan jenis biaya');
    if (tolakAudit) return tolakAudit;
    const tolakan = wajibAdmin_('Menonaktifkan jenis biaya');
    if (tolakan) return tolakan;

    const kodeBersih = String(kode === null || kode === undefined ? '' : kode).trim().toUpperCase();
    if (!kodeBersih) return { success: false, message: 'Kode jenis biaya wajib disertakan.' };
    if (!ubahBaris_('JENIS_BIAYA', 'Kode', kodeBersih, { Aktif: 'Tidak' })) {
      return { success: false, message: 'Kode ' + kodeBersih + ' tidak ditemukan.' };
    }

    catatLog_('Nonaktifkan jenis biaya', kodeBersih, {});
    return { success: true, message: 'Jenis biaya dinonaktifkan.', data: { kode: kodeBersih } };
  } catch (e) {
    return { success: false, message: 'Gagal menonaktifkan jenis biaya: ' + e.message };
  }
}

// Baris tarif berurut sesuai isi sheet, berkunci per triplet (B13).
function getTarif() {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;
    return { success: true, data: bacaTabel_('TARIF').map(barisTarif_) };
  } catch (e) {
    return { success: false, message: 'Gagal membaca tarif: ' + e.message };
  }
}

// Upsert pada triplet unik (JenisBiaya, Angkatan, TahunAjaran) (B13):
// triplet yang sudah ada ditimpa nominalnya, bukan dibariskan ganda.
function simpanTarif(d) {
  return denganKunci_(function () { return simpanTarifIsi_(d); });
}

function simpanTarifIsi_(d) {
  try {
    const tolakAudit = cekPeriodeAudit_('Menyimpan tarif');
    if (tolakAudit) return tolakAudit;
    const tolakan = wajibAdmin_('Menyimpan tarif');
    if (tolakan) return tolakan;

    const data = d || {};
    const jenisBiaya = String(data.jenisBiaya === null || data.jenisBiaya === undefined ? '' : data.jenisBiaya).trim().toUpperCase();
    if (!jenisBiaya) return { success: false, message: 'Jenis biaya wajib dipilih.' };
    if (!bacaTabel_('JENIS_BIAYA').some(function (r) {
      return String(r.Kode === null || r.Kode === undefined ? '' : r.Kode).trim() === jenisBiaya;
    })) {
      return { success: false, message: 'Jenis biaya ' + jenisBiaya + ' tidak dikenal.' };
    }

    const angkatan = String(data.angkatan === null || data.angkatan === undefined ? '' : data.angkatan).trim().replace(/\D/g, '');
    if (angkatan.length !== 4) {
      return { success: false, message: 'Angkatan harus 4 digit tahun (mis. 2026).' };
    }

    const tahunAjaran = String(data.tahunAjaran === null || data.tahunAjaran === undefined ? '' : data.tahunAjaran).trim();
    if (!/^\d{4}\/\d{4}$/.test(tahunAjaran)) {
      return { success: false, message: 'Tahun ajaran harus format 2026/2027.' };
    }

    const nominal = Number(data.nominal);
    if (!isFinite(nominal) || nominal < 0) {
      return { success: false, message: 'Nominal harus angka 0 atau lebih.' };
    }
    const nominalBulat = Math.round(nominal);

    const tripletCocok = function (r) {
      return String(r.JenisBiaya === null || r.JenisBiaya === undefined ? '' : r.JenisBiaya).trim() === jenisBiaya &&
        String(r.Angkatan === null || r.Angkatan === undefined ? '' : r.Angkatan).trim() === angkatan &&
        String(r.TahunAjaran === null || r.TahunAjaran === undefined ? '' : r.TahunAjaran).trim() === tahunAjaran;
    };

    const ada = bacaTabel_('TARIF').some(tripletCocok);
    if (ada) {
      ubahBarisCocok_('TARIF', tripletCocok, { Nominal: nominalBulat });
    } else {
      tulisBaris_('TARIF', {
        JenisBiaya: jenisBiaya, Angkatan: angkatan,
        TahunAjaran: tahunAjaran, Nominal: nominalBulat
      });
    }

    catatLog_('Simpan tarif', jenisBiaya, {
      angkatan: angkatan, tahunAjaran: tahunAjaran,
      nominal: nominalBulat, baru: !ada
    });
    return {
      success: true,
      message: 'Tarif tersimpan.',
      data: { jenisBiaya: jenisBiaya, angkatan: angkatan, tahunAjaran: tahunAjaran, nominal: nominalBulat }
    };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan tarif: ' + e.message };
  }
}

function getKategoriPengeluaran() {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;
    return { success: true, data: bacaTabel_('KATEGORI_PENGELUARAN').map(barisKategoriPengeluaran_) };
  } catch (e) {
    return { success: false, message: 'Gagal membaca kategori pengeluaran: ' + e.message };
  }
}

// Upsert pada Nama (tanpa peduli huruf besar-kecil): yang sudah ada
// hanya status aktifnya yang diperbarui.
function simpanKategoriPengeluaran(d) {
  return denganKunci_(function () { return simpanKategoriPengeluaranIsi_(d); });
}

function simpanKategoriPengeluaranIsi_(d) {
  try {
    const tolakAudit = cekPeriodeAudit_('Menyimpan kategori pengeluaran');
    if (tolakAudit) return tolakAudit;
    const tolakan = wajibAdmin_('Menyimpan kategori pengeluaran');
    if (tolakan) return tolakan;

    const data = d || {};
    const nama = String(data.nama === null || data.nama === undefined ? '' : data.nama).trim();
    if (!nama) return { success: false, message: 'Nama kategori wajib diisi.' };

    const aktif = data.aktif === undefined || data.aktif === null || data.aktif === ''
      ? true : aktifBenar_(data.aktif);
    const aktifTeks = aktif ? 'Ya' : 'Tidak';

    // Cocok rata tidak memandang huruf besar-kecil; ejaan lama dipertahankan.
    let ada = false;
    let namaAda = nama;
    bacaTabel_('KATEGORI_PENGELUARAN').forEach(function (r) {
      const k = String(r.Nama === null || r.Nama === undefined ? '' : r.Nama).trim();
      if (!ada && k.toLowerCase() === nama.toLowerCase()) {
        ada = true;
        namaAda = k;
      }
    });

    if (ada) {
      ubahBaris_('KATEGORI_PENGELUARAN', 'Nama', namaAda, { Aktif: aktifTeks });
    } else {
      tulisBaris_('KATEGORI_PENGELUARAN', { Nama: nama, Aktif: aktifTeks });
    }

    catatLog_('Simpan kategori pengeluaran', namaAda, { aktif: aktifTeks, baru: !ada });
    return { success: true, message: 'Kategori pengeluaran tersimpan.', data: { nama: namaAda } };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan kategori pengeluaran: ' + e.message };
  }
}

// Pengaturan global (B18): tahun ajaran, identitas sekolah, saldo awal.
// Mode siswa/ortu tidak boleh membacanya (wajibStaf_).
function getPengaturan() {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    const peta = petaPengaturan_();
    return {
      success: true,
      data: {
        tahunAjaranAktif: String(peta.TahunAjaranAktif === null || peta.TahunAjaranAktif === undefined ? '' : peta.TahunAjaranAktif).trim(),
        namaSekolah: String(peta.NamaSekolah === null || peta.NamaSekolah === undefined ? '' : peta.NamaSekolah).trim(),
        alamatSekolah: String(peta.AlamatSekolah === null || peta.AlamatSekolah === undefined ? '' : peta.AlamatSekolah).trim(),
        npsn: String(peta.NPSN === null || peta.NPSN === undefined ? '' : peta.NPSN).trim(),
        saldoAwalKas: Number(peta.SaldoAwalKas) || 0,
        saldoAwalBank: Number(peta.SaldoAwalBank) || 0,
        tanggalSaldoAwal: String(peta.TanggalSaldoAwal === null || peta.TanggalSaldoAwal === undefined ? '' : peta.TanggalSaldoAwal).trim()
      }
    };
  } catch (e) {
    return { success: false, message: 'Gagal membaca pengaturan: ' + e.message };
  }
}

// Simpan hanya kunci yang dikirim; kunci lain dibiarkan utuh.
function simpanPengaturan(d) {
  try {
    const tolakAudit = cekPeriodeAudit_('Menyimpan pengaturan');
    if (tolakAudit) return tolakAudit;
    const tolakan = wajibAdmin_('Menyimpan pengaturan');
    if (tolakan) return tolakan;

    const data = d || {};
    const perubahan = [];

    if (data.tahunAjaranAktif !== undefined) {
      const ta = String(data.tahunAjaranAktif === null || data.tahunAjaranAktif === undefined ? '' : data.tahunAjaranAktif).trim();
      if (!/^\d{4}\/\d{4}$/.test(ta)) {
        return { success: false, message: 'Tahun ajaran aktif harus berbentuk 2026/2027.' };
      }
      // Tahun lama wajib sudah diarsipkan agar pembukuan lama tetap bisa dibuka.
      const taLama = tahunAjaranAktif_();
      if (ta !== taLama) {
        const namaArsip = 'ARSIP KEUANGAN ' + taLama.replace('/', '-');
        if (!folderBackup_().getFilesByName(namaArsip).hasNext()) {
          return {
            success: false,
            message: 'Buat arsip tahun ajaran ' + taLama + ' dulu lewat tombol ' +
              '"Buat arsip tahun ajaran aktif", lalu simpan lagi.'
          };
        }
      }
      perubahan.push(['TahunAjaranAktif', ta]);
    }

    if (data.namaSekolah !== undefined) {
      const v = String(data.namaSekolah === null || data.namaSekolah === undefined ? '' : data.namaSekolah).trim();
      if (!v) return { success: false, message: 'Nama sekolah wajib diisi.' };
      perubahan.push(['NamaSekolah', v]);
    }

    if (data.alamatSekolah !== undefined) {
      const v = String(data.alamatSekolah === null || data.alamatSekolah === undefined ? '' : data.alamatSekolah).trim();
      perubahan.push(['AlamatSekolah', v]);
    }

    if (data.npsn !== undefined) {
      perubahan.push(['NPSN', String(data.npsn === null || data.npsn === undefined ? '' : data.npsn).trim()]);
    }

    const saldoKas = simpanSaldoAwalNilai_(data.saldoAwalKas, data.saldoAwalKas !== undefined);
    if (saldoKas.gagal) return { success: false, message: 'Saldo awal kas harus angka 0 atau lebih.' };
    if (saldoKas.set) perubahan.push(['SaldoAwalKas', saldoKas.nilai]);

    const saldoBank = simpanSaldoAwalNilai_(data.saldoAwalBank, data.saldoAwalBank !== undefined);
    if (saldoBank.gagal) return { success: false, message: 'Saldo awal bank harus angka 0 atau lebih.' };
    if (saldoBank.set) perubahan.push(['SaldoAwalBank', saldoBank.nilai]);

    if (data.tanggalSaldoAwal !== undefined) {
      const t = String(data.tanggalSaldoAwal === null || data.tanggalSaldoAwal === undefined ? '' : data.tanggalSaldoAwal).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        return { success: false, message: 'Tanggal saldo awal harus format 2026-07-01.' };
      }
      perubahan.push(['TanggalSaldoAwal', t]);
    }

    if (!perubahan.length) {
      return { success: false, message: 'Tidak ada pengaturan yang dikirim.' };
    }

    perubahan.forEach(function (p) {
      ubahBaris_('PENGATURAN', 'Kunci', p[0], { Nilai: p[1] });
    });

    hapusCacheDashboard_();
    catatLog_('Simpan pengaturan', 'PENGATURAN', { kunci: perubahan.map(function (p) { return p[0]; }) });
    return { success: true, message: 'Pengaturan tersimpan.', data: { kunci: perubahan.map(function (p) { return p[0]; }) } };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan pengaturan: ' + e.message };
  }
}

// Nilai saldo awal: kirim { set: true, nilai } bila kunci ikut disimpan,
// { gagal: true } bila bukan angka 0 atau lebih.
function simpanSaldoAwalNilai_(nilai, kirim) {
  if (!kirim) return { set: false };
  const n = Number(nilai);
  if (!isFinite(n) || n < 0) return { gagal: true };
  return { set: true, nilai: Math.round(n) };
}

// Ubah baris pertama yang lolos predikat (untuk kunci majemuk seperti
// triplet tarif). true = ketemu & diubah.
function ubahBarisCocok_(nama, cocok, obj) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(nama);
  if (!sheet || sheet.getLastRow() < 2) return false;

  const nilai = sheet.getDataRange().getValues();
  const headers = nilai[0].map(function (h) { return String(h).trim(); });

  for (let i = 1; i < nilai.length; i++) {
    const row = {};
    headers.forEach(function (h, j) {
      if (h) row[h] = nilai[i][j];
    });
    if (!cocok(row)) continue;

    const baris = nilai[i].slice();
    Object.keys(obj || {}).forEach(function (k) {
      const j = headers.indexOf(k);
      if (j !== -1) baris[j] = obj[k];
    });
    const keluaran = headers.map(function (_, j) {
      return baris[j] === undefined ? '' : periksaTeks_(baris[j]);
    });
    sheet.getRange(i + 1, 1, 1, headers.length).setValues([keluaran]);
    return true;
  }
  return false;
}
