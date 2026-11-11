// ============================================================
// TAGIHAN
// ============================================================
const STATUS_TAGIHAN = ['Belum', 'Sebagian', 'Lunas'];

function teks_(v) {
  return String(v === null || v === undefined ? '' : v).trim();
}

// ID deterministik (Global Constraints): NISN|JenisBiaya|Periode (B11).
function tagihanId_(nisn, jenisBiaya, periode) {
  return teks_(nisn) + '|' + teks_(jenisBiaya) + '|' + teks_(periode);
}

function barisTagihan_(r) {
  return {
    id: teks_(r.ID),
    nisn: teks_(r.NISN),
    jenisBiaya: teks_(r.JenisBiaya),
    periode: teks_(r.Periode),
    nominalAwal: Number(r.NominalAwal) || 0,
    nominalAkhir: Number(r.NominalAkhir) || 0,
    potonganId: teks_(r.PotonganID),
    alasanPenyesuaian: teks_(r.AlasanPenyesuaian),
    sisa: Number(r.Sisa) || 0,
    status: teks_(r.Status),
    menungguVerifikasi: Number(r.MenungguVerifikasi) || 0,
    dibuatOleh: teks_(r.DibuatOleh),
    waktu: teks_(r.Waktu),
    keterangan: teks_(r.Keterangan)
  };
}

// Saldo deposit masuk (F): hanya baris TERVERIFIKASI; MASUK +, KELUAR -.
function saldoDeposit_(nisn) {
  return bacaTabel_('BUKU_DEPOSIT')
    .filter(function (r) { return teks_(r.NISN) === nisn && teks_(r.Status) === 'TERVERIFIKASI'; })
    .reduce(function (a, r) {
      const j = Number(r.Jumlah) || 0;
      return a + (teks_(r.Arah) === 'MASUK' ? j : -j);
    }, 0);
}

// Status tagihan dari nominal & sisa: 0 -> Lunas, sisa >= nominal -> Belum.
function statusTagihan_(nominal, sisa) {
  const n = Number(nominal) || 0;
  const s = Number(sisa) || 0;
  if (n <= 0 || s <= 0) return 'Lunas';
  if (s >= n) return 'Belum';
  return 'Sebagian';
}

// Periode sah (B12): Bulanan 'YYYY-MM', Tahunan/Sekali 'YYYY/YYYY'.
function periodeSah_(jenisBiaya, periode) {
  const kode = teks_(jenisBiaya);
  const jenis = bacaTabel_('JENIS_BIAYA').filter(function (r) {
    return teks_(r.Kode) === kode;
  })[0];
  if (!jenis) return { sah: false, pesan: 'Jenis biaya ' + kode + ' tidak dikenal.' };
  const p = teks_(periode);
  if (!p) return { sah: false, pesan: 'Periode wajib diisi.' };
  if (teks_(jenis.Periode) === 'Bulanan') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(p)) {
      return { sah: false, pesan: 'Periode ' + kode + ' harus format bulanan 2026-10.' };
    }
  } else if (!/^\d{4}\/\d{4}$/.test(p)) {
    return { sah: false, pesan: 'Periode ' + kode + ' harus format tahun ajaran 2026/2027.' };
  }
  return { sah: true };
}

// Nominal tarif untuk (jenis, angkatan, tahun ajaran); null bila belum diset (B13).
// daftarTarif opsional = hasil bacaTabel_('TARIF') sekali per eksekusi.
function tarifUntuk_(jenisBiaya, angkatan, tahunAjaran, daftarTarif) {
  const baris = (daftarTarif || bacaTabel_('TARIF')).filter(function (r) {
    return teks_(r.JenisBiaya) === jenisBiaya &&
      teks_(r.Angkatan) === angkatan &&
      teks_(r.TahunAjaran) === tahunAjaran;
  })[0];
  return baris ? Number(baris.Nominal) || 0 : null;
}

// Taruna sasaran generate: aktif dan cocok filter angkatan/rombel.
function tarunaSasaran_(data) {
  const f = data || {};
  const angkatan = teks_(f.angkatan);
  const rombel = teks_(f.rombel);
  return bacaTabel_('TARUNA').map(barisanTaruna_).filter(function (t) {
    const st = String(t.status || '').trim().toUpperCase();
    if (st !== 'AKTIF' && st !== 'CUTI') return false;
    if (angkatan && t.angkatan !== angkatan) return false;
    if (rombel && t.rombel !== rombel) return false;
    return t.nisn !== '';
  });
}

// Hitung rencana tagihan tanpa menulis apa pun (dipakai pratinjau & eksekusi).
function siapkanGenerate_(p) {
  const data = p || {};
  const jenisBiaya = teks_(data.jenisBiaya).toUpperCase();
  const periode = teks_(data.periode);
  if (!jenisBiaya) return { error: 'Jenis biaya wajib dipilih.' };
  const cekPeriode = periodeSah_(jenisBiaya, periode);
  if (!cekPeriode.sah) return { error: cekPeriode.pesan };

  const tahunAjaran = teks_(data.tahunAjaran) || tahunAjaranAktif_();
  const sasaran = tarunaSasaran_(data);
  if (!sasaran.length) return { error: 'Tidak ada taruna aktif yang cocok dengan filter.' };

  const sudahAda = {};
  bacaTabel_('TAGIHAN').forEach(function (r) { sudahAda[teks_(r.ID)] = true; });
  // Dibaca sekali untuk seluruh loop, bukan per taruna.
  const daftarTarif = bacaTabel_('TARIF');
  const daftarPotongan = bacaTabel_('POTONGAN');

  const siap = [];
  const dilewati = [];
  let total = 0;
  sasaran.forEach(function (t) {
    const id = tagihanId_(t.nisn, jenisBiaya, periode);
    if (sudahAda[id]) {
      dilewati.push({ nisn: t.nisn, nama: t.nama, alasan: 'Sudah ada' });
      return;
    }
    const tarif = tarifUntuk_(jenisBiaya, t.angkatan, tahunAjaran, daftarTarif);
    if (tarif === null) {
      dilewati.push({ nisn: t.nisn, nama: t.nama, alasan: 'Tarif belum diset' });
      return;
    }
    const pot = hitungPotongan_(tarif, potonganAktif_(t.nisn, jenisBiaya, periode, daftarPotongan));
    siap.push({
      id: id,
      nisn: t.nisn,
      nama: t.nama,
      nominalAwal: tarif,
      nominalAkhir: pot.nominalAkhir,
      potonganId: pot.potonganId || '',
      bebas: pot.nominalAkhir <= 0
    });
    total += pot.nominalAkhir;
  });
  return {
    jenisBiaya: jenisBiaya, periode: periode, tahunAjaran: tahunAjaran,
    taruna: siap, dilewati: dilewati, total: total
  };
}

// Pratinjau: jumlah, total, dan daftar yang akan dilewati (tanpa menulis).
function pratinjauGenerateTagihan(p) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;
    const s = siapkanGenerate_(p);
    if (s.error) return { success: false, message: s.error };
    return {
      success: true,
      data: {
        jenisBiaya: s.jenisBiaya, periode: s.periode, tahunAjaran: s.tahunAjaran,
        jumlah: s.taruna.length, total: s.total, dilewati: s.dilewati
      }
    };
  } catch (e) {
    return { success: false, message: 'Gagal pratinjau tagihan: ' + e.message };
  }
}

// Eksekusi generate: kunci LockService, tulis TAGIHAN, satu baris LOG massal.
function jalankanGenerateTagihan(p) {
  try {
    const tolakan = wajibTulis_('Generate tagihan');
    if (tolakan) return tolakan;

    const tolakPeran = wajibTransaksi_('generate tagihan');
    if (tolakPeran) return tolakPeran;

    const lock = LockService.getScriptLock();
    let kunci = false;
    try {
      kunci = lock && lock.tryLock ? lock.tryLock(10000) : false;
      if (!kunci && lock && lock.waitLock) { lock.waitLock(10000); kunci = true; }
    } catch (e) {
      kunci = false;
    }
    if (!kunci) {
      return { success: false, message: 'Server sedang sibuk. Coba lagi beberapa saat.' };
    }
    try {
      const s = siapkanGenerate_(p);
      if (s.error) return { success: false, message: s.error };

      const sesi = getSesi().data || {};
      const pelaku = teks_(sesi.email);
      const waktu = waktuIso_();
      const daftar = s.taruna.map(function (t) {
        return {
          ID: t.id,
          NISN: t.nisn,
          JenisBiaya: s.jenisBiaya,
          Periode: s.periode,
          NominalAwal: t.nominalAwal,
          NominalAkhir: t.nominalAkhir,
          PotonganID: t.potonganId,
          AlasanPenyesuaian: '',
          Sisa: t.nominalAkhir,
          Status: statusTagihan_(t.nominalAkhir, t.nominalAkhir),
          MenungguVerifikasi: 0,
          DibuatOleh: pelaku,
          Waktu: waktu,
          Keterangan: t.bebas ? 'Pembebasan penuh' : ''
        };
      });
      tulisBanyak_('TAGIHAN', daftar);

      if (s.taruna.length) {
        catatLog_('Generate tagihan', s.jenisBiaya + ' ' + s.periode, {
          dibuat: s.taruna.length, dilewati: s.dilewati.length, total: s.total
        });
      }
      return {
        success: true,
        data: {
          dibuat: s.taruna.length, dilewati: s.dilewati.length,
          total: s.total, daftarDilewati: s.dilewati
        }
      };
    } finally {
      if (kunci && lock && lock.releaseLock) {
        try { lock.releaseLock(); } catch (e) { /* abaikan */ }
      }
    }
  } catch (e) {
    return { success: false, message: 'Gagal generate tagihan: ' + e.message };
  }
}

// Catat tagihan manual untuk kasus khusus (B11); tetap unik per triplet.
function simpanTagihanManual(d) {
  try {
    const tolakan = wajibTulis_('Simpan tagihan manual');
    if (tolakan) return tolakan;

    const tolakPeran = wajibTransaksi_('simpan tagihan manual');
    if (tolakPeran) return tolakPeran;

    return denganKunci_(function () {
    const data = d || {};
    const nisn = teks_(data.nisn);
    const jenisBiaya = teks_(data.jenisBiaya).toUpperCase();
    const periode = teks_(data.periode);
    const nominal = data.nominal !== undefined ? data.nominal : data.nominalAkhir;
    const keterangan = teks_(data.keterangan);

    if (!/^\d{10}$/.test(nisn)) {
      return { success: false, message: 'NISN harus 10 digit angka.' };
    }
    const taruna = bacaTabel_('TARUNA').map(barisanTaruna_).filter(function (t) {
      return t.nisn === nisn;
    })[0];
    if (!taruna) {
      return { success: false, message: 'NISN ' + nisn + ' tidak terdaftar di data taruna.' };
    }
    const cekPeriode = periodeSah_(jenisBiaya, periode);
    if (!cekPeriode.sah) {
      return { success: false, message: cekPeriode.pesan };
    }
    const nilai = Math.round(Number(nominal));
    if (!isFinite(nilai) || nilai <= 0) {
      return { success: false, message: 'Nominal tagihan harus angka lebih dari 0.' };
    }

    const id = tagihanId_(nisn, jenisBiaya, periode);
    const ada = bacaTabel_('TAGIHAN').some(function (r) { return teks_(r.ID) === id; });
    if (ada) {
      return { success: false, message: 'Tagihan ' + jenisBiaya + ' ' + periode + ' untuk NISN ' + nisn + ' sudah ada.' };
    }

    const sesi = getSesi().data || {};
    const pelaku = teks_(sesi.email);
    tulisBaris_('TAGIHAN', {
      ID: id,
      NISN: nisn,
      JenisBiaya: jenisBiaya,
      Periode: periode,
      NominalAwal: nilai,
      NominalAkhir: nilai,
      PotonganID: '',
      AlasanPenyesuaian: '',
      Sisa: nilai,
      Status: 'Belum',
      MenungguVerifikasi: 0,
      DibuatOleh: pelaku,
      Waktu: waktuIso_(),
      Keterangan: keterangan
    });
    catatLog_('Simpan tagihan manual', id, { nominal: nilai, keterangan: keterangan });
    return { success: true, data: { id: id, nominalAkhir: nilai, sisa: nilai } };
    });
  } catch (e) {
    return { success: false, message: 'Gagal menyimpan tagihan manual: ' + e.message };
  }
}

// Penyesuaian tagihan (B17): alasan wajib, tidak boleh di bawah yang sudah terbayar.
function sesuaikanTagihan(d) {
  try {
    const tolakan = wajibTulis_('Sesuaikan tagihan');
    if (tolakan) return tolakan;

    return denganKunci_(function () {
    const data = d || {};
    const id = teks_(data.id);
    const alasan = teks_(data.alasan);
    const nominalBaru = Number(data.nominalAkhir);

    if (!alasan) {
      return { success: false, message: 'Alasan penyesuaian wajib diisi.' };
    }
    if (!isFinite(nominalBaru) || nominalBaru < 0) {
      return { success: false, message: 'Nominal penyesuaian harus angka 0 atau lebih.' };
    }

    const baris = bacaTabel_('TAGIHAN').filter(function (r) { return teks_(r.ID) === id; })[0];
    if (!baris) {
      return { success: false, message: 'Tagihan ' + id + ' tidak ditemukan.' };
    }
    const nominalLama = Number(baris.NominalAkhir) || 0;
    const sisaLama = Number(baris.Sisa) || 0;
    const menunggu = Number(baris.MenungguVerifikasi) || 0;
    const terbayar = Math.max(0, nominalLama - sisaLama);
    // Nominal baru tidak boleh turun di bawah total yang sudah dibayar (terverifikasi)
    // ditambah pembayaran transfer yang masih menunggu verifikasi. Jika turun di bawah
    // itu, pembayaran tertunda bisa menjadi lebih besar dari sisa tagihan dan gagal
    // diverifikasi.
    const komitmen = terbayar + menunggu;
    if (nominalBaru < komitmen) {
      return {
        success: false,
        message: 'Nominal tidak boleh di bawah yang sudah dibayar ditambah menunggu verifikasi (Rp ' +
          terbayar + ' + Rp ' + menunggu + ' = Rp ' + komitmen + ').'
      };
    }

    const sisaBaru = nominalBaru - terbayar;
    ubahBaris_('TAGIHAN', 'ID', id, {
      NominalAkhir: nominalBaru,
      Sisa: sisaBaru,
      Status: statusTagihan_(nominalBaru, sisaBaru),
      AlasanPenyesuaian: alasan
    });
    catatLog_('Sesuaikan tagihan', id, {
      dari: nominalLama, ke: nominalBaru, terbayar: terbayar, alasan: alasan
    });
    return {
      success: true,
      data: { id: id, nominalAkhir: nominalBaru, sisa: sisaBaru,
        status: statusTagihan_(nominalBaru, sisaBaru) }
    };
    });
  } catch (e) {
    return { success: false, message: 'Gagal menyesuaikan tagihan: ' + e.message };
  }
}

// Daftar tagihan + join nama/kelas taruna.
function getTagihan(filter) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    // Yayasan/Auditor adalah baca-laporan saja: tidak boleh baca per baris.
    const sesiLap = getSesi().data || {};
    if (PERAN_LAPORAN.indexOf(sesiLap.peran) !== -1) {
      return tolak_('baca tagihan per baris', 'staf selain Yayasan/Auditor');
    }

    const f = filter || {};
    const q = teks_(f.q).toLowerCase();
    const nisn = teks_(f.nisn);
    const jenis = teks_(f.jenis);
    const periode = teks_(f.periode);
    const status = teks_(f.status);
    const angkatan = teks_(f.angkatan);

    const peta = {};
    bacaTabel_('TARUNA').map(barisanTaruna_).forEach(function (t) { peta[t.nisn] = t; });

    const hasil = bacaTabel_('TAGIHAN').map(barisTagihan_).map(function (t) {
      const taruna = peta[t.nisn] || {};
      return {
        id: t.id, nisn: t.nisn, jenisBiaya: t.jenisBiaya, periode: t.periode,
        nominalAwal: t.nominalAwal, nominalAkhir: t.nominalAkhir,
        potonganId: t.potonganId, alasanPenyesuaian: t.alasanPenyesuaian,
        sisa: t.sisa, status: t.status, menungguVerifikasi: t.menungguVerifikasi,
        dibuatOleh: t.dibuatOleh, waktu: t.waktu, keterangan: t.keterangan,
        nama: teks_(taruna.nama), kelas: teks_(taruna.kelas),
        angkatan: teks_(taruna.angkatan)
      };
    }).filter(function (t) {
      if (nisn && t.nisn !== nisn) return false;
      if (jenis && t.jenisBiaya !== jenis) return false;
      if (periode && t.periode !== periode) return false;
      if (status && t.status !== status) return false;
      if (angkatan && t.angkatan !== angkatan) return false;
      if (q) {
        const teksCari = (t.nisn + ' ' + t.nama).toLowerCase();
        if (teksCari.indexOf(q) === -1) return false;
      }
      return true;
    });

    hasil.sort(function (a, b) {
      return (b.periode || '').localeCompare(a.periode || '', 'id') ||
        String(a.nisn).localeCompare(String(b.nisn), 'id');
    });
    return { success: true, data: halaman_(hasil, f) };
  } catch (e) {
    return { success: false, message: 'Gagal membaca tagihan: ' + e.message };
  }
}

// Rekap tunggakan per taruna: status != Lunas dan sisa > 0.
// tahunAjaran opsional: bila diisi, hanya tagihan periode dalam tahun ajaran
// tersebut yang dihitung. Bila kosong, memakai tahun ajaran aktif.
function getTunggakan(tahunAjaran) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    // Yayasan/Auditor adalah baca-laporan saja: tidak boleh baca per baris.
    const sesiLap = getSesi().data || {};
    if (PERAN_LAPORAN.indexOf(sesiLap.peran) !== -1) {
      return tolak_('baca tunggakan per baris', 'staf selain Yayasan/Auditor');
    }

    const ta = teks_(tahunAjaran) || tahunAjaranAktif_();

    const peta = {};
    bacaTabel_('TARUNA').map(barisanTaruna_).forEach(function (t) { peta[t.nisn] = t; });

    const per = {};
    let nominal = 0;
    bacaTabel_('TAGIHAN').map(barisTagihan_).filter(function (t) {
      return dalamTahunAjaran_(t.periode, ta);
    }).forEach(function (t) {
      if (t.status === 'Lunas' || t.sisa <= 0) return;
      if (!per[t.nisn]) {
        const taruna = peta[t.nisn] || {};
        per[t.nisn] = {
          nisn: t.nisn, nama: teks_(taruna.nama), kelas: teks_(taruna.kelas),
          tunggakan: 0, terbayar: 0
        };
      }
      per[t.nisn].tunggakan += t.sisa;
      per[t.nisn].terbayar += Math.max(0, t.nominalAkhir - t.sisa);
      nominal += t.sisa;
    });

    const baris = Object.keys(per).map(function (k) { return per[k]; })
      .sort(function (a, b) {
        return b.tunggakan - a.tunggakan || String(a.nama).localeCompare(String(b.nama), 'id');
      });
    return {
      success: true,
      data: { baris: baris, ringkas: { nominal: nominal, jumlahTaruna: baris.length } }
    };
  } catch (e) {
    return { success: false, message: 'Gagal membaca tunggakan: ' + e.message };
  }
}

// Surat tunggakan personal: data lengkap satu taruna untuk dicetak A4.
// Nomor surat deterministik ST/TAHUN/BULAN/NISN agar sama bila dicetak ulang.
function getSuratTunggakan(nisn, tenggatIso) {
  try {
    const tolakCetak = wajibCetakPerTaruna_('cetak surat tunggakan');
    if (tolakCetak) return tolakCetak;

    const nisnBersih = teks_(nisn);
    if (!nisnBersih) {
      return { success: false, message: 'NISN wajib diisi.' };
    }

    const taruna = bacaTabel_('TARUNA').map(barisanTaruna_)
      .filter(function (t) { return t.nisn === nisnBersih; })[0];
    if (!taruna) {
      return { success: false, message: 'Taruna NISN ' + nisnBersih + ' tidak ditemukan.' };
    }

    const baris = bacaTabel_('TAGIHAN').map(barisTagihan_)
      .filter(function (t) {
        return t.nisn === nisnBersih && t.status !== 'Lunas' && t.sisa > 0;
      })
      .map(function (t) {
        return {
          id: t.id,
          jenisBiaya: t.jenisBiaya,
          periode: t.periode,
          nominalAkhir: t.nominalAkhir,
          terbayar: Math.max(0, t.nominalAkhir - t.sisa),
          sisa: t.sisa,
          status: t.status
        };
      })
      .sort(function (a, b) {
        return String(a.periode).localeCompare(String(b.periode), 'id') ||
          String(a.jenisBiaya).localeCompare(String(b.jenisBiaya), 'id');
      });

    if (!baris.length) {
      return { success: false, message: 'Taruna ' + taruna.nama + ' tidak memiliki tunggakan.' };
    }

    const total = baris.reduce(function (a, b) { return a + b.sisa; }, 0);

    // Tenggat: parameter sah (YYYY-MM-DD, tidak di masa lalu) dipakai;
    // selain itu default hari ini + 14 hari.
    const hariIni = hariIniIso_();
    let tenggat = teks_(tenggatIso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tenggat) || tenggat < hariIni) {
      const d = new Date();
      d.setDate(d.getDate() + 14);
      tenggat = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
        '-' + String(d.getDate()).padStart(2, '0');
    }

    const pengaturan = petaPengaturan_();
    const sekolah = {
      nama: teks_(pengaturan.NamaSekolah) || 'SMK Maritim Nusantara Kupang',
      alamat: teks_(pengaturan.AlamatSekolah),
      telepon: teks_(pengaturan.Telepon),
      email: teks_(pengaturan.Email)
    };

    const sesi = getSesi().data || {};
    const kini = new Date();

    return {
      success: true,
      data: {
        sekolah: sekolah,
        taruna: {
          nisn: taruna.nisn,
          nama: taruna.nama,
          kelas: taruna.kelas,
          emailOrtu: teks_(taruna.emailOrtu)
        },
        baris: baris,
        total: total,
        nomorSurat: 'ST/' + kini.getFullYear() + '/' +
          String(kini.getMonth() + 1).padStart(2, '0') + '/' + nisnBersih,
        tanggalCetak: hariIni,
        tenggat: tenggat,
        pencatat: teks_(sesi.email)
      }
    };
  } catch (e) {
    return { success: false, message: 'Gagal membuat surat tunggakan: ' + e.message };
  }
}

// C3: cek konsistensi tagihan. READ-ONLY: tidak menulis apa pun.
// Memeriksa: ID ganda, sisa negatif, sisa > nominal, Status tidak sesuai
// nominal & sisa, dan NISN yang tidak ada di TARUNA.
function cekKonsistensiTagihan_() {
  const temuan = [];
  const nisnTaruna = {};
  bacaTabel_('TARUNA').map(barisanTaruna_).forEach(function (t) { nisnTaruna[t.nisn] = true; });
  const sudahAda = {};
  bacaTabel_('TAGIHAN').map(barisTagihan_).forEach(function (t, i) {
    const baris = i + 2;
    const catat = function (masalah) { temuan.push({ baris: baris, id: t.id, masalah: masalah }); };
    if (t.id && sudahAda[t.id]) catat('ID tagihan ganda.');
    sudahAda[t.id] = true;
    if (t.nominalAkhir < 0) catat('Nominal akhir negatif.');
    if (t.sisa < 0) catat('Sisa negatif.');
    if (t.sisa > t.nominalAkhir) catat('Sisa lebih besar dari nominal akhir.');
    if (t.menungguVerifikasi < 0) catat('Menunggu verifikasi negatif.');
    const seharusnya = statusTagihan_(t.nominalAkhir, t.sisa);
    if (t.status !== seharusnya) {
      catat('Status "' + t.status + '" tidak sesuai nominal/sisa (seharusnya "' + seharusnya + '").');
    }
    if (!nisnTaruna[t.nisn]) catat('NISN ' + t.nisn + ' tidak ada di TARUNA.');
  });
  return { jumlah: temuan.length, temuan: temuan };
}

// Pembungkus klien: hanya Admin yang boleh melihat hasil cek.
function cekKonsistensiTagihan() {
  const sesi = getSesi().data || {};
  if (sesi.status !== 'ok' || sesi.peran !== 'Admin') {
    return { success: false, message: 'Hanya Admin yang bisa menjalankan cek konsistensi.' };
  }
  return { success: true, data: cekKonsistensiTagihan_() };
}

// ============================================================
// PEMUTIHAN (D-38): pengajuan -> persetujuan Kepsek; kurangi sisa tertua.
// ============================================================
const PERAN_AJUKAN_PEMUTIHAN = ['Admin', 'Bendahara'];

// Kunci urut tertua: YYYY-MM tetap; YYYY/YYYY -> YYYY-13 (tahunan/sekali
// dianggap paling akhir di tahunnya).
function kunciUrutPeriode_(periode) {
  const s = String(periode || '');
  const bulanan = s.match(/^(\d{4})-(\d{2})$/);
  if (bulanan) return bulanan[1] + '-' + bulanan[2];
  const tahunan = s.match(/^(\d{4})\/(\d{4})$/);
  if (tahunan) return tahunan[1] + '-13';
  return '9999-99';
}

function ajukanPemutihan(d) {
  try {
    return denganKunci_(function () {
      const sesi = getSesi().data || {};
      const tolak = wajibPeranDalam_(sesi, PERAN_AJUKAN_PEMUTIHAN, 'ajukan pemutihan');
      if (tolak) return tolak;
      const nisn = teks_((d || {}).nisn);
      const jumlah = Math.round(Number((d || {}).jumlah));
      if (!nisn || !isFinite(jumlah) || jumlah <= 0) {
        return { success: false, message: 'NISN dan jumlah wajib diisi.' };
      }
      const sisaTotal = bacaTabel_('TAGIHAN').map(barisTagihan_)
        .filter(function (t) { return t.nisn === nisn; })
        .reduce(function (a, t) { return a + (t.sisa > 0 ? t.sisa : 0); }, 0);
      if (jumlah > sisaTotal) {
        return { success: false, message: 'Jumlah pemutihan melebihi sisa tunggakan (Rp ' + sisaTotal + ').' };
      }
      const kini = tanggalLokalIso_();
      const yyyyMM = kini.slice(0, 4) + '/' + kini.slice(5, 7);
      const no = 'PMT/' + yyyyMM + '/' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
      tulisBaris_('PEMUTIHAN', { NoPemutihan: no, Tanggal: kini, NISN: nisn,
        Jumlah: jumlah, Alasan: teks_(d.alasan), Status: 'DIAJUKAN',
        DiajukanOleh: sesi.email, DisetujuiOleh: '', Waktu: waktuIso_() });
      catatLog_('Ajukan pemutihan', no, { nisn: nisn, jumlah: jumlah });
      return { success: true, data: { noPemutihan: no } };
    });
  } catch (e) {
    return { success: false, message: 'Gagal mengajukan pemutihan: ' + e.message };
  }
}

function setujuiPemutihan(d) {
  try {
    const tolakAudit = cekPeriodeAudit_('setujui pemutihan');
    if (tolakAudit) return tolakAudit;
    return denganKunci_(function () {
      const sesi = getSesi().data || {};
      if (sesi.status !== 'ok' || sesi.peran !== 'Kepsek') {
        return { success: false, message: 'Hanya Kepsek yang bisa menyetujui pemutihan.' };
      }
      const p = bacaTabel_('PEMUTIHAN').filter(function (r) {
        return teks_(r.NoPemutihan) === teks_((d || {}).noPemutihan);
      })[0];
      if (!p) return { success: false, message: 'Pemutihan tidak ditemukan.' };
      if (teks_(p.Status) !== 'DIAJUKAN') {
        return { success: false, message: 'Pemutihan sudah diproses.' };
      }
      if (teks_(p.DiajukanOleh) === teks_(sesi.email)) {
        return { success: false, message: 'Pengaju tidak boleh menyetujui sendiri.' };
      }
      // Kurangi sisa dari tagihan tertua
      let sisaTerpakai = Number(p.Jumlah) || 0;
      bacaTabel_('TAGIHAN').map(barisTagihan_)
        .filter(function (t) { return t.nisn === teks_(p.NISN) && t.sisa > 0; })
        .sort(function (a, b) {
          const ka = kunciUrutPeriode_(a.periode);
          const kb = kunciUrutPeriode_(b.periode);
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        })
        .forEach(function (t) {
          if (sisaTerpakai <= 0) return;
          const kurang = Math.min(t.sisa, sisaTerpakai);
          const sisaBaru = t.sisa - kurang;
          sisaTerpakai -= kurang;
          ubahBaris_('TAGIHAN', 'ID', t.id, {
            Sisa: sisaBaru, Status: statusTagihan_(t.nominalAkhir, sisaBaru)
          });
        });
      ubahBaris_('PEMUTIHAN', 'NoPemutihan', p.NoPemutihan, {
        Status: 'DISETUJUI', DisetujuiOleh: sesi.email
      });
      catatLog_('Setujui pemutihan', p.NoPemutihan, {
        nisn: teks_(p.NISN), jumlah: Number(p.Jumlah) || 0
      });
      hapusCacheDashboard_();
      return { success: true, message: 'Pemutihan disetujui.' };
    });
  } catch (e) {
    return { success: false, message: 'Gagal menyetujui pemutihan: ' + e.message };
  }
}

// ============================================================
// REFUND (F bagian 2): kotor -> tutup tagihan -> netto dibayar.
// ============================================================
function totalTagihanTerbuka_(nisn) {
  const n = teks_(nisn);
  return bacaTabel_('TAGIHAN').map(barisTagihan_)
    .filter(function (t) { return t.nisn === n && t.status !== 'Lunas' && t.sisa > 0; })
    .reduce(function (a, t) { return a + t.sisa; }, 0);
}

function ajukanRefund(d) {
  try {
    return denganKunci_(function () {
      const sesi = getSesi().data || {};
      const tolak = wajibPeranDalam_(sesi, ['Bendahara'], 'ajukan refund');
      if (tolak) return tolak;
      const nisn = teks_((d || {}).nisn);
      if (!nisn) return { success: false, message: 'NISN wajib diisi.' };
      const taruna = bacaTabel_('TARUNA').map(barisanTaruna_).filter(function (t) {
        return t.nisn === nisn;
      })[0];
      if (!taruna) return { success: false, message: 'Taruna NISN ' + nisn + ' tidak ditemukan.' };
      const st = teks_(taruna.status).toUpperCase();
      if (['DO', 'WAFAT', 'LULUS'].indexOf(st) === -1) {
        return { success: false, message: 'Refund hanya untuk taruna DO/WAFAT/Lulus.' };
      }
      const kotor = saldoDeposit_(nisn);
      if (kotor <= 0) return { success: false, message: 'Saldo deposit nol.' };
      const tagihan = Math.min(kotor, totalTagihanTerbuka_(nisn));
      const netto = kotor - tagihan;
      const kini = tanggalLokalIso_();
      const yyyyMM = kini.slice(0, 4) + '/' + kini.slice(5, 7);
      const no = 'RFD/' + yyyyMM + '/' + Utilities.getUuid().replace(/-/g, '').slice(0, 6).toUpperCase();
      tulisBaris_('REFUND', { NoRefund: no, Tanggal: kini, NISN: nisn,
        Kotor: kotor, Tagihan: tagihan, Netto: netto, Status: 'DIAJUKAN',
        DiajukanOleh: sesi.email, DisetujuiOleh: '', Waktu: waktuIso_() });
      catatLog_('Ajukan refund', no, { nisn: nisn, kotor: kotor, tagihan: tagihan, netto: netto });
      return { success: true, data: { noRefund: no, kotor: kotor, tagihan: tagihan, netto: netto } };
    });
  } catch (e) {
    return { success: false, message: 'Gagal mengajukan refund: ' + e.message };
  }
}

function setujuiRefund(d) {
  try {
    return denganKunci_(function () {
      const sesi = getSesi().data || {};
      const tolak = wajibPeranDalam_(sesi, ['Kepsek'], 'setujui refund');
      if (tolak) return tolak;
      const p = bacaTabel_('REFUND').filter(function (r) {
        return teks_(r.NoRefund) === teks_((d || {}).noRefund);
      })[0];
      if (!p) return { success: false, message: 'Refund tidak ditemukan.' };
      if (teks_(p.Status) !== 'DIAJUKAN') {
        return { success: false, message: 'Refund sudah diproses.' };
      }
      if (teks_(p.DiajukanOleh) === teks_(sesi.email)) {
        return { success: false, message: 'Pengaju tidak boleh menyetujui sendiri.' };
      }
      const nisn = teks_(p.NISN);
      let sisaTerpakai = Number(p.Tagihan) || 0;
      bacaTabel_('TAGIHAN').map(barisTagihan_)
        .filter(function (t) { return t.nisn === nisn && t.sisa > 0; })
        .sort(function (a, b) {
          const ka = kunciUrutPeriode_(a.periode);
          const kb = kunciUrutPeriode_(b.periode);
          return ka < kb ? -1 : ka > kb ? 1 : 0;
        })
        .forEach(function (t) {
          if (sisaTerpakai <= 0) return;
          const kurang = Math.min(t.sisa, sisaTerpakai);
          const sisaBaru = t.sisa - kurang;
          sisaTerpakai -= kurang;
          ubahBaris_('TAGIHAN', 'ID', t.id, {
            Sisa: sisaBaru, Status: statusTagihan_(t.nominalAkhir, sisaBaru)
          });
        });
      if ((Number(p.Tagihan) || 0) > 0) {
        tulisBaris_('BUKU_DEPOSIT', {
          Tanggal: tanggalLokalIso_(), NISN: nisn, Arah: 'KELUAR', Jumlah: Number(p.Tagihan) || 0,
          Jenis: 'ALOKASI_TAGIHAN', NoRujukan: teks_(p.NoRefund), Keterangan: 'Alokasi tagihan',
          Status: 'TERVERIFIKASI', Waktu: waktuIso_(), Oleh: sesi.email
        });
      }
      ubahBaris_('REFUND', 'NoRefund', p.NoRefund, {
        Status: 'DISETUJUI', DisetujuiOleh: sesi.email
      });
      catatLog_('Setujui refund', p.NoRefund, {
        nisn: nisn, tagihan: Number(p.Tagihan) || 0, netto: Number(p.Netto) || 0
      });
      hapusCacheDashboard_();
      return { success: true, message: 'Refund disetujui.' };
    });
  } catch (e) {
    return { success: false, message: 'Gagal menyetujui refund: ' + e.message };
  }
}

function bayarRefund(d) {
  try {
    return denganKunci_(function () {
      const sesi = getSesi().data || {};
      const tolak = wajibPeranDalam_(sesi, ['Bendahara'], 'bayar refund');
      if (tolak) return tolak;
      const p = bacaTabel_('REFUND').filter(function (r) {
        return teks_(r.NoRefund) === teks_((d || {}).noRefund);
      })[0];
      if (!p) return { success: false, message: 'Refund tidak ditemukan.' };
      if (teks_(p.Status) !== 'DISETUJUI') {
        return { success: false, message: 'Refund sudah diproses.' };
      }
      const nisn = teks_(p.NISN);
      const netto = Number(p.Netto) || 0;
      if (saldoDeposit_(nisn) < netto) {
        return { success: false, message: 'Saldo deposit tidak cukup untuk refund.' };
      }
      if (netto > 0) {
        tulisBaris_('BUKU_DEPOSIT', {
          Tanggal: tanggalLokalIso_(), NISN: nisn, Arah: 'KELUAR', Jumlah: netto,
          Jenis: 'REFUND', NoRujukan: teks_(p.NoRefund), Keterangan: 'Bayar refund',
          Status: 'TERVERIFIKASI', Waktu: waktuIso_(), Oleh: sesi.email
        });
      }
      ubahBaris_('REFUND', 'NoRefund', p.NoRefund, { Status: 'DIBAYAR' });
      catatLog_('Bayar refund', p.NoRefund, { nisn: nisn, netto: netto });
      return { success: true, message: 'Refund dibayar.' };
    });
  } catch (e) {
    return { success: false, message: 'Gagal membayar refund: ' + e.message };
  }
}
