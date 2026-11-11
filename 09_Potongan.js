// ============================================================
// POTONGAN (beasiswa / keringanan / pembebasan) — U10, B15/B16/B17
// ============================================================

const JENIS_POTONGAN = ['Beasiswa', 'Keringanan', 'Pembebasan'];
const TIPE_NILAI = ['Persen', 'Nominal'];
const JENIS_BIAYA_SEMAUA = 'Semua';

// Satu baris sheet POTONGAN -> objek untuk klien (tanpa kolom audit).
// nisn -> nama taruna, untuk kolom tampilan (potongan & kuitansi).
function petaNamaTaruna_() {
  const peta = {};
  try {
    bacaTabel_('TARUNA').forEach(function (r) {
      const b = barisanTaruna_(r);
      if (b.nisn) peta[b.nisn] = b.nama;
    });
  } catch (e) { /* nama opsional; biarkan kosong */ }
  return peta;
}

function barisPotongan_(r) {
  return {
    id: String(r.ID === null || r.ID === undefined ? '' : r.ID).trim(),
    nisn: String(r.NISN === null || r.NISN === undefined ? '' : r.NISN).trim(),
    jenis: String(r.Jenis === null || r.Jenis === undefined ? '' : r.Jenis).trim(),
    namaProgram: String(r.NamaProgram === null || r.NamaProgram === undefined ? '' : r.NamaProgram).trim(),
    jenisBiaya: String(r.JenisBiaya === null || r.JenisBiaya === undefined ? '' : r.JenisBiaya).trim(),
    tipeNilai: String(r.TipeNilai === null || r.TipeNilai === undefined ? '' : r.TipeNilai).trim(),
    nilai: Number(r.Nilai) || 0,
    berlakuDari: String(r.BerlakuDari === null || r.BerlakuDari === undefined ? '' : r.BerlakuDari).trim(),
    berlakuSampai: String(r.BerlakuSampai === null || r.BerlakuSampai === undefined ? '' : r.BerlakuSampai).trim(),
    alasan: String(r.Alasan === null || r.Alasan === undefined ? '' : r.Alasan).trim(),
    disetujuiOleh: String(r.DisetujuiOleh === null || r.DisetujuiOleh === undefined ? '' : r.DisetujuiOleh).trim(),
    aktif: aktifBenar_(r.Aktif)
  };
}

// Daftar potongan dengan filter: q (NISN/nama program), jenis, aktif.
function getPotongan(filter) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    const data = filter || {};
    const q = String(data.q === null || data.q === undefined ? '' : data.q).trim().toLowerCase();
    const jenis = String(data.jenis === null || data.jenis === undefined ? '' : data.jenis).trim();
    const aktifRaw = data.aktif;
    const aktif = aktifRaw === undefined || aktifRaw === null || aktifRaw === ''
      ? null : aktifBenar_(aktifRaw);

    const petaNama = petaNamaTaruna_();
    const hasil = bacaTabel_('POTONGAN').map(barisPotongan_).map(function (p) {
      p.namaTaruna = petaNama[p.nisn] || '';
      return p;
    }).filter(function (p) {
      if (q) {
        const teks = String(p.nisn + ' ' + (p.namaTaruna || '') + ' ' + p.namaProgram).toLowerCase();
        if (teks.indexOf(q) === -1) return false;
      }
      if (jenis && p.jenis !== jenis) return false;
      if (aktif !== null && p.aktif !== aktif) return false;
      return true;
    });

    hasil.sort(function (a, b) {
      return (b.berlakuDari || '').localeCompare(a.berlakuDari || '', 'id') ||
        String(b.id).localeCompare(String(a.id), 'id');
    });
    return { success: true, data: hasil };
  } catch (e) {
    return { success: false, message: 'Gagal membaca potongan: ' + e.message };
  }
}

// Simpan (baru) atau ubah potongan berdasarkan ID. ID baru dihasilkan uid_().
// Tulis potongan memegang script lock agar simpan bersamaan tidak
// saling menimpa (dan agar baca-ubah-tulis tetap atomik).
function simpanPotongan(d) {
  return denganKunci_(function () { return simpanPotonganIsi_(d); });
}

function simpanPotonganIsi_(d) {
  try {
    const tolakan = wajibTulis_('Menyimpan potongan');
    if (tolakan) return tolakan;

    const data = d || {};
    const id = String(data.id === null || data.id === undefined ? '' : data.id).trim();
    const nisn = String(data.nisn === null || data.nisn === undefined ? '' : data.nisn).trim();
    const jenis = String(data.jenis === null || data.jenis === undefined ? '' : data.jenis).trim();
    const namaProgram = String(data.namaProgram === null || data.namaProgram === undefined ? '' : data.namaProgram).trim();
    const jenisBiaya = String(data.jenisBiaya === null || data.jenisBiaya === undefined ? '' : data.jenisBiaya).trim().toUpperCase();
    const tipeNilai = String(data.tipeNilai === null || data.tipeNilai === undefined ? '' : data.tipeNilai).trim();
    const nilai = Number(data.nilai);
    const berlakuDari = String(data.berlakuDari === null || data.berlakuDari === undefined ? '' : data.berlakuDari).trim();
    const berlakuSampai = String(data.berlakuSampai === null || data.berlakuSampai === undefined ? '' : data.berlakuSampai).trim();
    const alasan = String(data.alasan === null || data.alasan === undefined ? '' : data.alasan).trim();
    const disetujuiOleh = String(data.disetujuiOleh === null || data.disetujuiOleh === undefined ? '' : data.disetujuiOleh).trim();
    const aktif = data.aktif === undefined || data.aktif === null || data.aktif === ''
      ? true : aktifBenar_(data.aktif);

    if (!nisn || !/^\d{10}$/.test(nisn)) {
      return { success: false, message: 'NISN harus 10 digit angka.' };
    }
    if (!bacaTabel_('TARUNA').some(function (r) {
      return String(r.NISN === null || r.NISN === undefined ? '' : r.NISN).trim() === nisn;
    })) {
      return { success: false, message: 'NISN ' + nisn + ' tidak terdaftar di data taruna.' };
    }
    if (JENIS_POTONGAN.indexOf(jenis) === -1) {
      return { success: false, message: 'Jenis potongan harus Beasiswa/Keringanan/Pembebasan.' };
    }
    if (!namaProgram) {
      return { success: false, message: 'Nama program wajib diisi.' };
    }
    if (jenisBiaya !== JENIS_BIAYA_SEMAUA.toUpperCase() &&
        !bacaTabel_('JENIS_BIAYA').some(function (r) {
          return String(r.Kode === null || r.Kode === undefined ? '' : r.Kode).trim() === jenisBiaya;
        })) {
      return { success: false, message: 'Jenis biaya ' + jenisBiaya + ' tidak dikenal.' };
    }
    if (TIPE_NILAI.indexOf(tipeNilai) === -1) {
      return { success: false, message: 'Tipe nilai harus Persen/Nominal.' };
    }
    if (!isFinite(nilai) || nilai <= 0) {
      return { success: false, message: 'Nilai harus angka lebih dari 0.' };
    }
    if (tipeNilai === 'Persen' && nilai > 100) {
      return { success: false, message: 'Nilai persen maksimal 100.' };
    }
    if (!berlakuDari || !/^\d{4}-\d{2}-\d{2}$/.test(berlakuDari)) {
      return { success: false, message: 'Tanggal berlaku dari harus format 2026-07-01.' };
    }
    if (!berlakuSampai || !/^\d{4}-\d{2}-\d{2}$/.test(berlakuSampai)) {
      return { success: false, message: 'Tanggal berlaku sampai harus format 2026-07-01.' };
    }
    if (berlakuSampai < berlakuDari) {
      return { success: false, message: 'Tanggal berlaku sampai tidak boleh sebelum berlaku dari.' };
    }
    if (!alasan) {
      return { success: false, message: 'Alasan wajib diisi.' };
    }

    const sesi = getSesi().data || {};
    const pelaku = String(sesi.email === null || sesi.email === undefined ? '' : sesi.email);

    const jenisBiayaSimpan = jenisBiaya === JENIS_BIAYA_SEMAUA.toUpperCase()
      ? JENIS_BIAYA_SEMAUA : jenisBiaya;

    const baris = {
      ID: id || uid_(),
      NISN: nisn, Jenis: jenis, NamaProgram: namaProgram, JenisBiaya: jenisBiayaSimpan,
      TipeNilai: tipeNilai, Nilai: Math.round(nilai),
      BerlakuDari: berlakuDari, BerlakuSampai: berlakuSampai, Alasan: alasan,
      DisetujuiOleh: disetujuiOleh || pelaku,
      Aktif: aktif ? 'Ya' : 'Tidak',
      DicatatOleh: pelaku, Waktu: waktuIso_()
    };

    const baru = !id;
    if (baru) {
      tulisBaris_('POTONGAN', baris);
    } else {
      if (!ubahBaris_('POTONGAN', 'ID', id, baris)) {
        return { success: false, message: 'Potongan ID ' + id + ' tidak ditemukan.' };
      }
    }

    catatLog_(baru ? 'Simpan potongan' : 'Ubah potongan', baris.ID, {
      nisn: nisn, jenis: jenis, namaProgram: namaProgram, nilai: Math.round(nilai), baru: baru
    });
    hapusCacheDashboard_();
    return {
      success: true,
      message: baru ? 'Potongan tersimpan.' : 'Perubahan potongan tersimpan.',
      data: { id: baris.ID, baru: baru }
    };
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan potongan: ' + e.message };
  }
}

// Nonaktifkan potongan (riwayat tetap tersimpan, tidak dihapus).
function nonaktifkanPotongan(id) {
  return denganKunci_(function () { return nonaktifkanPotonganIsi_(id); });
}

function nonaktifkanPotonganIsi_(id) {
  try {
    const tolakan = wajibTulis_('Menonaktifkan potongan');
    if (tolakan) return tolakan;

    const idBersih = String(id === null || id === undefined ? '' : id).trim();
    if (!idBersih) return { success: false, message: 'ID potongan wajib disertakan.' };
    if (!ubahBaris_('POTONGAN', 'ID', idBersih, { Aktif: 'Tidak' })) {
      return { success: false, message: 'ID potongan ' + idBersih + ' tidak ditemukan.' };
    }

    catatLog_('Nonaktifkan potongan', idBersih, {});
    return { success: true, message: 'Potongan dinonaktifkan.', data: { id: idBersih } };
  } catch (e) {
    return { success: false, message: 'Gagal menonaktifkan potongan: ' + e.message };
  }
}

// Periode '2026-10' (bulanan), '2026/2027' (tahun ajaran), atau 'YYYY-MM-DD' (tunggal).
function periodeDalamRentang_(dari, sampai, periode) {
  if (!dari || !sampai || !periode) return false;
  const m = /^(\d{4})-(\d{2})$/.exec(String(periode));
  if (m) {
    const akhirTanggal = new Date(Number(m[1]), Number(m[2]), 0).getDate();
    const awal = m[1] + '-' + m[2] + '-01';
    const akhir = m[1] + '-' + m[2] + '-' + String(akhirTanggal).padStart(2, '0');
    return dari <= akhir && sampai >= awal;
  }
  const ta = /^(\d{4})\/(\d{4})$/.exec(String(periode));
  if (ta) {
    const awal = ta[1] + '-07-01';
    const akhir = ta[2] + '-06-30';
    return dari <= akhir && sampai >= awal;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(periode)) {
    return dari <= periode && sampai >= periode;
  }
  return false;
}

// Daftar potongan aktif untuk satu taruna, jenis biaya, dan periode (B15).
// daftarPotongan opsional = hasil bacaTabel_('POTONGAN') sekali per eksekusi.
function potonganAktif_(nisn, kodeBiaya, periode, daftarPotongan) {
  const hasil = [];
  (daftarPotongan || bacaTabel_('POTONGAN')).forEach(function (r) {
    if (!aktifBenar_(r.Aktif)) return;
    if (String(r.NISN).trim() !== String(nisn).trim()) return;
    if (r.JenisBiaya !== JENIS_BIAYA_SEMAUA &&
        String(r.JenisBiaya).trim() !== String(kodeBiaya).trim()) return;
    if (!periodeDalamRentang_(r.BerlakuDari, r.BerlakuSampai, periode)) return;
    hasil.push(barisPotongan_(r));
  });
  return hasil;
}

// Hitung nominal akhir setelah menerapkan daftar potongan (B15/B16).
// potongan nonaktif diabaikan; nominalAkhir tidak pernah negatif (dibatasi 0).
// Pembebasan = potongan yang membuat nominalAkhir 0.
function hitungPotongan_(tarif, daftarPotongan) {
  var nominalAkhir = Number(tarif) || 0;
  var rincian = [];
  var idPotongan = [];

  (daftarPotongan || []).forEach(function (p) {
    if (!aktifBenar_(p.aktif)) return;
    var tipe = String(p.tipeNilai === null || p.tipeNilai === undefined ? '' : p.tipeNilai).trim();
    var nilai = Number(p.nilai) || 0;
    var sebelum = nominalAkhir;
    var sesudah = sebelum;
    if (tipe === 'Persen') {
      sesudah = sebelum * (1 - nilai / 100);
    } else if (tipe === 'Nominal') {
      sesudah = sebelum - nilai;
    } else {
      return;
    }
    if (sesudah < 0) sesudah = 0;
    nominalAkhir = sesudah;
    var id = String(p.id === null || p.id === undefined ? '' : p.id).trim();
    if (id) idPotongan.push(id);
    rincian.push({
      jenis: String(p.jenis || '').trim(),
      namaProgram: String(p.namaProgram || '').trim(),
      tipeNilai: tipe,
      nilai: nilai,
      nominalSebelum: Math.round(sebelum * 100) / 100,
      nominalSesudah: Math.round(sesudah * 100) / 100
    });
  });

  return {
    nominalAkhir: Math.round(nominalAkhir * 100) / 100,
    potonganId: idPotongan.length ? idPotongan.join(',') : null,
    rincian: rincian
  };
}
