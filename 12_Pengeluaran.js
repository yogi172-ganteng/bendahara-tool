// ============================================================
// PENGELUARAN (B7 konsisten, B10 nomor KK, B8 verifikator)
// ============================================================
function tolakKeluar_(pesan) {
  return { success: false, message: pesan };
}

function barisPengeluaran_(r) {
  return {
    noBukti: teks_(r.NoBukti),
    tanggal: teks_(r.Tanggal),
    kategori: teks_(r.Kategori),
    keterangan: teks_(r.Keterangan),
    jumlah: Number(r.Jumlah) || 0,
    metode: teks_(r.Metode),
    status: teks_(r.Status),
    dicatatOleh: teks_(r.DicatatOleh),
    diverifikasiOleh: teks_(r.DiverifikasiOleh),
    alasanBatalkan: teks_(r.AlasanBatalkan),
    sumber: teks_(r.Sumber),
    disetujuiOleh: teks_(r.DisetujuiOleh)
  };
}

// Kategori pengeluaran harus terdaftar & aktif di referensi.
function kategoriSah_(nama) {
  const cari = teks_(nama);
  if (!cari) return false;
  return bacaTabel_('KATEGORI_PENGELUARAN').some(function (r) {
    return teks_(r.Nama) === cari && aktifBenar_(r.Aktif);
  });
}

// Catat pengeluaran: selalu DIAJUKAN (E1), disetujui lewat setujuiPengeluaran.
// DIAJUKAN tidak mengurangi saldo kas (E2).
function simpanPengeluaran(d) {
  try {
    const tolakan = wajibTulis_('Simpan pengeluaran');
    if (tolakan) return tolakan;

    const tolakPeran = wajibTransaksi_('simpan pengeluaran');
    if (tolakPeran) return tolakPeran;

    const data = d || {};
    const tanggal = teks_(data.tanggal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return tolakKeluar_('Tanggal pengeluaran harus format 2026-10-05.');
    }
    // B7: tanggal tidak boleh di masa depan.
    if (tanggal > tanggalLokalIso_()) {
      return tolakKeluar_('Tanggal pengeluaran tidak boleh di masa depan.');
    }
    const kategori = teks_(data.kategori);
    if (!kategori) return tolakKeluar_('Kategori pengeluaran wajib dipilih.');
    if (!kategoriSah_(kategori)) {
      return tolakKeluar_('Kategori pengeluaran ' + kategori + ' tidak terdaftar.');
    }
    const keterangan = teks_(data.keterangan);
    if (!keterangan) return tolakKeluar_('Keterangan pengeluaran wajib diisi.');
    const jumlah = Math.round(Number(data.jumlah));
    if (!isFinite(jumlah) || jumlah <= 0) {
      return tolakKeluar_('Jumlah pengeluaran harus angka lebih dari 0.');
    }
    const metode = teks_(data.metode);
    if (METODE_BAYAR.indexOf(metode) === -1) {
      return tolakKeluar_('Metode pengeluaran harus Tunai/Transfer.');
    }

    const pelaku = teks_((getSesi().data || {}).email);

    // Seluruh logika di dalam lock: nomor bukti dan penulisan transaksi
    // harus terlindungi dari permintaan serentak. Jika lock gagal,
    // denganKunci_ menghentikan operasi dan meminta pengguna mencoba lagi.
    return denganKunci_(function () {
      const noBukti = nomorBukti_('KK', tanggal);
      const status = 'DIAJUKAN';
      tulisBaris_('PENGELUARAN', {
        NoBukti: noBukti,
        Tanggal: tanggal,
        Kategori: kategori,
        Keterangan: keterangan,
        Jumlah: jumlah,
        Metode: metode,
        Status: status,
        DicatatOleh: pelaku,
        DiverifikasiOleh: '',
        AlasanBatalkan: '',
        Sumber: 'Manual'
      });
      catatLog_('Simpan pengeluaran', noBukti, { jumlah: jumlah, kategori: kategori });
      hapusCacheDashboard_();
      return { success: true, data: { noBukti: noBukti, status: status } };
    });
  } catch (e) {
    return tolakKeluar_('Gagal menyimpan pengeluaran: ' + e.message);
  }
}

// Persetujuan pengeluaran (E1–E4): DIAJUKAN -> DISETUJUI / DITOLAK.
// Kepsek menyetujui sampai ambang, Yayasan di atas ambang; BR-12: penyetuju
// tidak boleh sama dengan pencatat.
function bacaPengeluaranNoBukti_(noBukti) {
  return bacaTabel_('PENGELUARAN').filter(function (r) {
    return teks_(r.NoBukti) === teks_(noBukti);
  })[0];
}

function gerbangSetuju_(sesi, baris) {
  if (sesi.status !== 'ok') return tolakKeluar_('Login diperlukan untuk menyetujui pengeluaran.');
  if (teks_(baris.DicatatOleh) === teks_(sesi.email)) {
    return tolakKeluar_('Pencatat tidak boleh menyetujui pengeluarannya sendiri (BR-12).');
  }
  const jumlah = Number(baris.Jumlah) || 0;
  const boleh = jumlah > AMBANG_KEPSEK_PENGELUARAN
    ? sesi.peran === 'Yayasan'
    : (sesi.peran === 'Kepsek' || sesi.peran === 'Yayasan');
  if (!boleh) return tolakKeluar_('Peran Anda tidak berwenang menyetujui nilai ini.');
  return null;
}

function setujuiPengeluaran(d) {
  try {
    const tolakAuditSetuju = cekPeriodeAudit_('setujui pengeluaran');
    if (tolakAuditSetuju) return tolakAuditSetuju;
    const noBukti = teks_((d || {}).noBukti);
    if (!noBukti) return tolakKeluar_('Nomor bukti wajib diisi.');
    return denganKunci_(function () {
      const baris = bacaPengeluaranNoBukti_(noBukti);
      if (!baris) return tolakKeluar_('Pengeluaran tidak ditemukan.');
      if (teks_(baris.Status) !== 'DIAJUKAN') {
        return tolakKeluar_('Hanya pengeluaran DIAJUKAN yang bisa disetujui.');
      }
      const sesi = getSesi().data || {};
      const tolak = gerbangSetuju_(sesi, baris);
      if (tolak) return tolak;
      ubahBaris_('PENGELUARAN', 'NoBukti', noBukti, {
        Status: 'DISETUJUI', DisetujuiOleh: sesi.email
      });
      catatLog_('Setujui pengeluaran', noBukti, {
        jumlah: Number(baris.Jumlah) || 0, oleh: sesi.email
      });
      hapusCacheDashboard_();
      return { success: true, message: 'Pengeluaran disetujui.' };
    });
  } catch (e) {
    return tolakKeluar_('Gagal menyetujui pengeluaran: ' + e.message);
  }
}

function tolakPengeluaran(d) {
  try {
    const tolakAuditTolak = cekPeriodeAudit_('tolak pengeluaran');
    if (tolakAuditTolak) return tolakAuditTolak;
    const noBukti = teks_((d || {}).noBukti);
    const alasan = teks_((d || {}).alasan);
    if (!noBukti) return tolakKeluar_('Nomor bukti wajib diisi.');
    if (!alasan) return tolakKeluar_('Alasan penolakan wajib diisi.');
    return denganKunci_(function () {
      const baris = bacaPengeluaranNoBukti_(noBukti);
      if (!baris) return tolakKeluar_('Pengeluaran tidak ditemukan.');
      if (teks_(baris.Status) !== 'DIAJUKAN') {
        return tolakKeluar_('Hanya pengeluaran DIAJUKAN yang bisa ditolak.');
      }
      const sesi = getSesi().data || {};
      const tolak = gerbangSetuju_(sesi, baris);
      if (tolak) return tolak;
      ubahBaris_('PENGELUARAN', 'NoBukti', noBukti, {
        Status: 'DITOLAK', AlasanBatalkan: alasan, DisetujuiOleh: sesi.email
      });
      catatLog_('Tolak pengeluaran', noBukti, {
        jumlah: Number(baris.Jumlah) || 0, alasan: alasan, oleh: sesi.email
      });
      hapusCacheDashboard_();
      return { success: true, message: 'Pengeluaran ditolak.' };
    });
  } catch (e) {
    return tolakKeluar_('Gagal menolak pengeluaran: ' + e.message);
  }
}

function getPengeluaran(filter) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    // Yayasan/Auditor adalah baca-laporan saja: tidak boleh baca per baris.
    const sesiLap = getSesi().data || {};
    if (PERAN_LAPORAN.indexOf(sesiLap.peran) !== -1) {
      return tolak_('baca pengeluaran per baris', 'staf selain Yayasan/Auditor');
    }

    const f = filter || {};
    const q = teks_(f.q).toLowerCase();
    const status = teks_(f.status);
    const metode = teks_(f.metode);
    const kategori = teks_(f.kategori);
    const bulan = teks_(f.bulan);
    const noBukti = teks_(f.noBukti);

    const hasil = bacaTabel_('PENGELUARAN').map(barisPengeluaran_).filter(function (p) {
      if (noBukti && p.noBukti !== noBukti) return false;
      if (status && p.status !== status) return false;
      if (metode && p.metode !== metode) return false;
      if (kategori && p.kategori !== kategori) return false;
      if (bulan && p.tanggal.indexOf(bulan) !== 0) return false;
      if (q) {
        const cari = (p.noBukti + ' ' + p.kategori + ' ' + p.keterangan).toLowerCase();
        if (cari.indexOf(q) === -1) return false;
      }
      return true;
    });

    hasil.sort(function (a, b) {
      return String(b.tanggal).localeCompare(String(a.tanggal), 'id') ||
        String(b.noBukti).localeCompare(String(a.noBukti), 'id');
    });
    return { success: true, data: hasil };
  } catch (e) {
    return tolakKeluar_('Gagal membaca pengeluaran: ' + e.message);
  }
}

// Verifikasi transfer keluar (B8): verifikator tidak boleh sama dengan pencatat.
function verifikasiPengeluaran(d) {
  try {
    const tolakan = wajibVerifikasi_('Verifikasi pengeluaran');
    if (tolakan) return tolakan;

    const noBukti = teks_((d || {}).noBukti);
    if (!noBukti) return tolakKeluar_('Nomor bukti wajib diisi.');

    return denganKunci_(function () {
      const baris = bacaTabel_('PENGELUARAN').filter(function (r) {
        return teks_(r.NoBukti) === noBukti;
      })[0];
      if (!baris) return tolakKeluar_('Pengeluaran ' + noBukti + ' tidak ditemukan.');
      if (teks_(baris.Status) !== STATUS_MENUNGGU) {
        return tolakKeluar_('Hanya pengeluaran menunggu verifikasi yang bisa diverifikasi.');
      }
      const pelaku = teks_((getSesi().data || {}).email);
      if (teks_(baris.DicatatOleh) === pelaku) {
        return tolakKeluar_('Verifikasi harus oleh petugas lain, bukan pencatat.');
      }

      ubahBaris_('PENGELUARAN', 'NoBukti', noBukti, {
        Status: 'Terverifikasi',
        DiverifikasiOleh: pelaku
      });
      catatLog_('Verifikasi pengeluaran', noBukti, { jumlah: Number(baris.Jumlah) || 0 });
      hapusCacheDashboard_();
      return { success: true, message: 'Pengeluaran diverifikasi.' };
    });
  } catch (e) {
    return tolakKeluar_('Gagal memverifikasi pengeluaran: ' + e.message);
  }
}

function batalkanPengeluaran(d) {
  try {
    const tolakan = wajibTulis_('Batalkan pengeluaran');
    if (tolakan) return tolakan;

    const tolakPeran = wajibTransaksi_('batalkan pengeluaran');
    if (tolakPeran) return tolakPeran;

    const data = d || {};
    const noBukti = teks_(data.noBukti);
    const alasan = teks_(data.alasan);
    if (!noBukti) return tolakKeluar_('Nomor bukti wajib diisi.');
    if (!alasan) return tolakKeluar_('Alasan pembatalan wajib diisi.');

    return denganKunci_(function () {
      const baris = bacaTabel_('PENGELUARAN').filter(function (r) {
        return teks_(r.NoBukti) === noBukti;
      })[0];
      if (!baris) return tolakKeluar_('Pengeluaran ' + noBukti + ' tidak ditemukan.');
      const statusLama = teks_(baris.Status);
      if (statusLama === 'Dibatalkan') return tolakKeluar_('Pengeluaran ini sudah dibatalkan.');
      if (statusLama !== STATUS_MENUNGGU && statusLama !== 'Terverifikasi' &&
          statusLama !== 'DIAJUKAN' && statusLama !== 'DISETUJUI') {
        return tolakKeluar_('Status pengeluaran tidak bisa dibatalkan.');
      }

      ubahBaris_('PENGELUARAN', 'NoBukti', noBukti, {
        Status: 'Dibatalkan',
        AlasanBatalkan: alasan
      });
      catatLog_('Batalkan pengeluaran', noBukti, { alasan: alasan, jumlah: Number(baris.Jumlah) || 0 });
      hapusCacheDashboard_();
      return { success: true, message: 'Pengeluaran dibatalkan.' };
    });
  } catch (e) {
    return tolakKeluar_('Gagal membatalkan pengeluaran: ' + e.message);
  }
}
