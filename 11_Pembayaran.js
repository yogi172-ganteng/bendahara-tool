// ============================================================
// PEMBAYARAN (U4, B7/B8/B9/B10/B26)
// ============================================================
const METODE_BAYAR = ['Tunai', 'Transfer'];

// Versi cache dashboard disimpan di Script Properties agar invalidasi
// berlaku lintas eksekusi (array di memori selalu kosong di eksekusi baru).
function versiCacheDashboard_() {
  try {
    return PropertiesService.getScriptProperties().getProperty('DASH_VERSI') || '0';
  } catch (e) {
    return '0';
  }
}

// Naikkan versi: kunci dashboard lama otomatis tidak terpakai lagi.
function hapusCacheDashboard_() {
  Object.keys(CACHE_MEMORI_).forEach(function (k) {
    if (k.indexOf('DASH:') === 0) delete CACHE_MEMORI_[k];
  });
  try {
    const props = PropertiesService.getScriptProperties();
    const lama = Number(props.getProperty('DASH_VERSI')) || 0;
    props.setProperty('DASH_VERSI', String(lama + 1));
  } catch (e) {
    // cache gagal dibersihkan -> data tetap segar berikutnya
  }
}

// Naikkan counter di PENGATURAN lalu kembalikan nomor bukti (B10).
// Format: KW/2026/10/0001 — counter per prefix+tahun+bulan.
function nomorBukti_(prefix, tanggalIso) {
  const awalan = teks_(prefix);
  const m = /^(\d{4})-(\d{2})-\d{2}$/.exec(teks_(tanggalIso));
  const kini = new Date();
  const tahun = m ? m[1] : String(kini.getFullYear());
  const bulan = m ? m[2] : String(kini.getMonth() + 1).padStart(2, '0');
  const kunci = 'BUKTI:' + awalan + ':' + tahun + ':' + bulan;

  const lama = Number(petaPengaturan_()[kunci]) || 0;
  const baru = lama + 1;
  const diubah = ubahBarisCocok_('PENGATURAN', function (r) {
    return teks_(r.Kunci) === kunci;
  }, { Kunci: kunci, Nilai: String(baru) });
  if (!diubah) tulisBaris_('PENGATURAN', { Kunci: kunci, Nilai: String(baru) });

  return awalan + '/' + tahun + '/' + bulan + '/' + String(baru).padStart(4, '0');
}

function barisPembayaran_(r) {
  return {
    noBukti: teks_(r.NoBukti),
    tanggal: teks_(r.Tanggal),
    nisn: teks_(r.NISN),
    tagihanId: teks_(r.TagihanID),
    jenisBiaya: teks_(r.JenisBiaya),
    periode: teks_(r.Periode),
    jumlah: Number(r.Jumlah) || 0,
    metode: teks_(r.Metode),
    status: teks_(r.Status),
    keterangan: teks_(r.Keterangan),
    dicatatOleh: teks_(r.DicatatOleh),
    diverifikasiOleh: teks_(r.DiverifikasiOleh),
    waktuVerifikasi: teks_(r.WaktuVerifikasi),
    alasanBatalkan: teks_(r.AlasanBatalkan),
    sumber: teks_(r.Sumber)
  };
}

function tolakBayar_(pesan) {
  return { success: false, message: pesan };
}

// Tagihan yang masih bisa dibayar (status bukan Lunas dan sisa > 0).
function getTagihanTerbuka(nisn) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    const n = teks_(nisn);
    if (!n) return tolakBayar_('NISN wajib diisi.');
    const data = bacaTabel_('TAGIHAN').map(barisTagihan_).filter(function (t) {
      return t.nisn === n && t.status !== 'Lunas' && t.sisa > 0;
    }).map(function (t) {
      const menunggu = t.menungguVerifikasi || 0;
      return {
        id: t.id, jenisBiaya: t.jenisBiaya, periode: t.periode,
        sisa: t.sisa, menungguVerifikasi: menunggu,
        tersedia: Math.max(0, t.sisa - menunggu), nominalAkhir: t.nominalAkhir
      };
    });
    return { success: true, data: data };
  } catch (e) {
    return tolakBayar_('Gagal membaca tagihan terbuka: ' + e.message);
  }
}

// Catat pembayaran: satu baris per tagihan (B9), nomor bukti per baris (B10).
// Tunai -> Terverifikasi & sisa langsung berkurang; Transfer -> antre verifikasi (B7).
function simpanPembayaran(d) {
  try {
    const tolakAudit = cekPeriodeAudit_('Simpan pembayaran');
    if (tolakAudit) return tolakAudit;
    const sesiKas = getSesi().data || {};
    if (sesiKas.peran === 'Kasir') {
      // Kasir: hanya tunai, tanpa gerbang tulis transaksi Bendahara.
      if (teks_((d || {}).metode) !== 'Tunai') {
        return tolakBayar_('Kasir hanya boleh mencatat pembayaran tunai.');
      }
    } else {
      const tolakan = wajibTulis_('Simpan pembayaran');
      if (tolakan) return tolakan;

      const tolakPeran = wajibTransaksi_('simpan pembayaran');
      if (tolakPeran) return tolakPeran;
    }

    const data = d || {};
    const tanggal = teks_(data.tanggal);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return tolakBayar_('Tanggal pembayaran harus format 2026-10-05.');
    }
    const metode = teks_(data.metode);
    if (METODE_BAYAR.indexOf(metode) === -1) {
      return tolakBayar_('Metode pembayaran harus Tunai/Transfer.');
    }
    // B7: tanggal tidak boleh di masa depan (batas mundur menunggu keputusan pemilik).
    if (tanggal > tanggalLokalIso_()) {
      return tolakBayar_('Tanggal pembayaran tidak boleh di masa depan.');
    }
    // B5: kunci idempotensi wajib, dicek di dalam lock.
    const kunciIdem = teks_(data.idempotensiKey);
    if (!kunciIdem) return tolakBayar_('Kunci idempotensi wajib dikirim. Muat ulang halaman lalu coba lagi.');
    const keterangan = teks_(data.keterangan);
    const daftar = data.tagihan && data.tagihan.length ? data.tagihan : [];
    if (!daftar.length) return tolakBayar_('Pilih minimal satu tagihan.');

    const pelaku = teks_((getSesi().data || {}).email);

    // Baca saldo dan tulis di dalam lock: dua transfer bersamaan tidak boleh
    // memesan sisa tagihan yang sama.
    return denganKunci_(function () {
      // B5: kiriman ulang dengan kunci sama dikembalikan apa adanya, tanpa menulis.
      const sudahAda = bacaTabel_('PEMBAYARAN').filter(function (r) {
        return teks_(r.IdempotensiKey) === kunciIdem;
      });
      if (sudahAda.length) {
        return { success: true, data: { bukti: sudahAda.map(function (r) { return teks_(r.NoBukti); }), duplikat: true } };
      }
      const isiTagihan = bacaTabel_('TAGIHAN');
      const rencana = [];
      const dilihat = {};
      for (let i = 0; i < daftar.length; i++) {
        const item = daftar[i] || {};
        const id = teks_(item.tagihanId);
        const jumlah = Math.round(Number(item.jumlah));
        if (dilihat[id]) {
          return tolakBayar_('Tagihan yang sama tidak boleh dibayar dua kali dalam satu kiriman.');
        }
        const baris = isiTagihan.filter(function (r) { return teks_(r.ID) === id; })[0];
        if (!baris) return tolakBayar_('Tagihan ' + id + ' tidak ditemukan.');
        if (!isFinite(jumlah) || jumlah <= 0) {
          return tolakBayar_('Jumlah bayar harus angka lebih dari 0.');
        }
        const sisa = Number(baris.Sisa) || 0;
        const menunggu = Number(baris.MenungguVerifikasi) || 0;
        const tersedia = Math.max(0, sisa - menunggu);
        const dialokasi = Math.min(jumlah, tersedia);
        const kelebihan = jumlah - dialokasi;
        dilihat[id] = true;
        rencana.push({ id: id, jumlah: jumlah, dialokasi: dialokasi, kelebihan: kelebihan, baris: baris });
      }

      const bukti = [];
      const tertulis = [];
      try {
        rencana.forEach(function (r) {
          const noBukti = nomorBukti_('KW', tanggal);
          const status = metode === 'Tunai' ? 'Terverifikasi' : 'Menunggu verifikasi';
          tulisBaris_('PEMBAYARAN', {
            NoBukti: noBukti,
            Tanggal: tanggal,
            NISN: teks_(r.baris.NISN),
            TagihanID: r.id,
            JenisBiaya: teks_(r.baris.JenisBiaya),
            Periode: teks_(r.baris.Periode),
            Jumlah: r.dialokasi,
            Metode: metode,
            Status: status,
            Keterangan: keterangan,
            DicatatOleh: pelaku,
            DiverifikasiOleh: '',
            WaktuVerifikasi: '',
            AlasanBatalkan: '',
            Sumber: 'Manual',
            IdempotensiKey: kunciIdem
          });
          // Simpan keadaan sebelum diubah, untuk pembatalan bila baris
          // berikutnya gagal: tidak boleh ada pembayaran separuh.
          tertulis.push({
            noBukti: noBukti,
            tagihanId: r.id,
            nominal: Number(r.baris.NominalAkhir) || 0,
            sisaLama: Number(r.baris.Sisa) || 0,
            menungguLama: Number(r.baris.MenungguVerifikasi) || 0
          });
          if (metode === 'Tunai') {
            const nominal = Number(r.baris.NominalAkhir) || 0;
            const sisaBaru = (Number(r.baris.Sisa) || 0) - r.dialokasi;
            ubahBaris_('TAGIHAN', 'ID', r.id, {
              Sisa: sisaBaru,
              Status: statusTagihan_(nominal, sisaBaru)
            });
          } else {
            ubahBaris_('TAGIHAN', 'ID', r.id, {
              MenungguVerifikasi: (Number(r.baris.MenungguVerifikasi) || 0) + r.dialokasi
            });
          }
          if (r.kelebihan > 0) {
            tulisBaris_('BUKU_DEPOSIT', {
              Tanggal: tanggal, NISN: teks_(r.baris.NISN), Arah: 'MASUK', Jumlah: r.kelebihan,
              Jenis: 'PEMBAYARAN_LEBIH', NoRujukan: noBukti, Keterangan: 'Kelebihan bayar',
              Status: metode === 'Tunai' ? 'TERVERIFIKASI' : 'MENUNGGU', Waktu: waktuIso_(), Oleh: pelaku
            });
          }
          bukti.push(noBukti);
        });
      } catch (e) {
        batalkanTulisanPembayaran_(tertulis);
        throw new Error(e.message + ' (pembayaran yang sempat tercatat dibatalkan)');
      }

      catatLog_('Simpan pembayaran', metode + ' ' + tanggal, {
        bukti: bukti, tagihan: rencana.map(function (r) { return r.id; })
      });
      hapusCacheDashboard_();
      return { success: true, data: { bukti: bukti } };
    });
  } catch (e) {
    return tolakBayar_('Gagal menyimpan pembayaran: ' + e.message);
  }
}

// Batalkan baris pembayaran yang sudah tertulis bila penyimpanan gagal di
// tengah jalan, lalu kembalikan sisa tagihan ke keadaan semula.
function batalkanTulisanPembayaran_(tertulis) {
  (tertulis || []).forEach(function (t) {
    // B4: baris tidak dihapus (BR-01). Ditandai Dibatalkan agar nomor bukti tetap tercatat (BR-08).
    try {
      ubahBaris_('PEMBAYARAN', 'NoBukti', t.noBukti, {
        Status: 'Dibatalkan', AlasanBatalkan: 'Gagal simpan (dibatalkan otomatis)'
      });
    } catch (e) { /* lanjut */ }
    try {
      ubahBaris_('TAGIHAN', 'ID', t.tagihanId, {
        Sisa: t.sisaLama,
        Status: statusTagihan_(t.nominal, t.sisaLama),
        MenungguVerifikasi: t.menungguLama
      });
    } catch (e) { /* lanjut */ }
    try {
      ubahBaris_('BUKU_DEPOSIT', 'NoRujukan', t.noBukti, { Status: 'Dibatalkan' });
    } catch (e) { /* lanjut */ }
  });
}

function getPembayaran(filter) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    // Yayasan/Auditor adalah baca-laporan saja: tidak boleh baca per baris.
    const sesiLap = getSesi().data || {};
    if (PERAN_LAPORAN.indexOf(sesiLap.peran) !== -1) {
      return tolak_('baca pembayaran per baris', 'staf selain Yayasan/Auditor');
    }

    const f = filter || {};
    const q = teks_(f.q).toLowerCase();
    const status = teks_(f.status);
    const metode = teks_(f.metode);
    const bulan = teks_(f.bulan);
    const jenis = teks_(f.jenis);
    const noBukti = teks_(f.noBukti);

    const peta = {};
    bacaTabel_('TARUNA').map(barisanTaruna_).forEach(function (t) { peta[t.nisn] = t; });

    const hasil = bacaTabel_('PEMBAYARAN').map(barisPembayaran_).map(function (p) {
      const taruna = peta[p.nisn] || {};
      return {
        noBukti: p.noBukti, tanggal: p.tanggal, nisn: p.nisn, tagihanId: p.tagihanId,
        jenisBiaya: p.jenisBiaya, periode: p.periode, jumlah: p.jumlah, metode: p.metode,
        status: p.status, keterangan: p.keterangan, dicatatOleh: p.dicatatOleh,
        diverifikasiOleh: p.diverifikasiOleh, waktuVerifikasi: p.waktuVerifikasi,
        alasanBatalkan: p.alasanBatalkan, sumber: p.sumber,
        nama: teks_(taruna.nama), kelas: teks_(taruna.kelas)
      };
    }).filter(function (p) {
      // Kasir hanya melihat pembayaran yang ia catat sendiri (BR-11).
      const sesiKas = getSesi().data || {};
      if (sesiKas.peran === 'Kasir' && teks_(p.dicatatOleh) !== teks_(sesiKas.email)) return false;
      if (noBukti && p.noBukti !== noBukti) return false;
      if (status && p.status !== status) return false;
      if (metode && p.metode !== metode) return false;
      if (jenis && p.jenisBiaya !== jenis) return false;
      if (bulan && p.tanggal.indexOf(bulan) !== 0) return false;
      if (q) {
        const cari = (p.noBukti + ' ' + p.nisn + ' ' + p.nama).toLowerCase();
        if (cari.indexOf(q) === -1) return false;
      }
      return true;
    });

    hasil.sort(function (a, b) {
      return String(b.tanggal).localeCompare(String(a.tanggal), 'id') ||
        String(b.noBukti).localeCompare(String(a.noBukti), 'id');
    });
    return { success: true, data: halaman_(hasil, f) };
  } catch (e) {
    return tolakBayar_('Gagal membaca pembayaran: ' + e.message);
  }
}

// Verifikasi transfer (B8): verifikator tidak boleh sama dengan pencatat.
function verifikasiPembayaran(d) {
  try {
    const tolakan = wajibVerifikasi_('Verifikasi pembayaran');
    if (tolakan) return tolakan;

    const noBukti = teks_((d || {}).noBukti);
    if (!noBukti) return tolakBayar_('Nomor bukti wajib diisi.');

    return denganKunci_(function () {
      const baris = bacaTabel_('PEMBAYARAN').filter(function (r) {
        return teks_(r.NoBukti) === noBukti;
      })[0];
      if (!baris) return tolakBayar_('Pembayaran ' + noBukti + ' tidak ditemukan.');
      if (teks_(baris.Status) !== STATUS_MENUNGGU) {
        return tolakBayar_('Hanya pembayaran menunggu verifikasi yang bisa diverifikasi.');
      }
      const pelaku = teks_((getSesi().data || {}).email);
      if (teks_(baris.DicatatOleh) === pelaku) {
        return tolakBayar_('Verifikasi harus oleh petugas lain, bukan pencatat.');
      }

      const jumlah = Number(baris.Jumlah) || 0;
      const idTagihan = teks_(baris.TagihanID);
      const tagihan = bacaTabel_('TAGIHAN').filter(function (r) {
        return teks_(r.ID) === idTagihan;
      })[0];
      if (!tagihan) {
        return tolakBayar_('Tagihan ' + idTagihan + ' tidak ditemukan; pembayaran tidak bisa diverifikasi.');
      }
      if (jumlah > (Number(tagihan.Sisa) || 0)) {
        return tolakBayar_('Jumlah pembayaran melebihi sisa tagihan. Periksa pembayaran lain.');
      }

      ubahBaris_('PEMBAYARAN', 'NoBukti', noBukti, {
        Status: 'Terverifikasi',
        DiverifikasiOleh: pelaku,
        WaktuVerifikasi: waktuIso_()
      });
      ubahBaris_('BUKU_DEPOSIT', 'NoRujukan', noBukti, { Status: 'TERVERIFIKASI' });

      if (tagihan) {
        const nominal = Number(tagihan.NominalAkhir) || 0;
        const sisaBaru = (Number(tagihan.Sisa) || 0) - jumlah;
        ubahBaris_('TAGIHAN', 'ID', idTagihan, {
          Sisa: sisaBaru,
          Status: statusTagihan_(nominal, sisaBaru),
          MenungguVerifikasi: Math.max(0, (Number(tagihan.MenungguVerifikasi) || 0) - jumlah)
        });
      }

      catatLog_('Verifikasi pembayaran', noBukti, { jumlah: jumlah });
      hapusCacheDashboard_();
      return { success: true, message: 'Pembayaran diverifikasi.' };
    });
  } catch (e) {
    return tolakBayar_('Gagal memverifikasi pembayaran: ' + e.message);
  }
}

// Batal: alasan wajib; bila sudah terverifikasi, sisa tagihan dikembalikan.
function batalkanPembayaran(d) {
  try {
    const tolakan = wajibTulis_('Batalkan pembayaran');
    if (tolakan) return tolakan;

    const tolakPeran = wajibTransaksi_('batalkan pembayaran');
    if (tolakPeran) return tolakPeran;

    const data = d || {};
    const noBukti = teks_(data.noBukti);
    const alasan = teks_(data.alasan);
    if (!noBukti) return tolakBayar_('Nomor bukti wajib diisi.');
    if (!alasan) return tolakBayar_('Alasan pembatalan wajib diisi.');

    return denganKunci_(function () {
      const baris = bacaTabel_('PEMBAYARAN').filter(function (r) {
        return teks_(r.NoBukti) === noBukti;
      })[0];
      if (!baris) return tolakBayar_('Pembayaran ' + noBukti + ' tidak ditemukan.');
      const statusLama = teks_(baris.Status);
      if (statusLama === 'Dibatalkan') return tolakBayar_('Pembayaran ini sudah dibatalkan.');
      if (statusLama !== STATUS_MENUNGGU && statusLama !== 'Terverifikasi') {
        return tolakBayar_('Status pembayaran tidak bisa dibatalkan.');
      }

      const jumlah = Number(baris.Jumlah) || 0;
      const idTagihan = teks_(baris.TagihanID);
      ubahBaris_('PEMBAYARAN', 'NoBukti', noBukti, {
        Status: 'Dibatalkan',
        AlasanBatalkan: alasan,
        DiverifikasiOleh: teks_(baris.DiverifikasiOleh),
        WaktuVerifikasi: teks_(baris.WaktuVerifikasi)
      });

      const tagihan = bacaTabel_('TAGIHAN').filter(function (r) {
        return teks_(r.ID) === idTagihan;
      })[0];
      if (tagihan) {
        const nominal = Number(tagihan.NominalAkhir) || 0;
        if (statusLama === 'Terverifikasi') {
          const sisaBaru = (Number(tagihan.Sisa) || 0) + jumlah;
          ubahBaris_('TAGIHAN', 'ID', idTagihan, {
            Sisa: sisaBaru,
            Status: statusTagihan_(nominal, sisaBaru)
          });
        } else {
          ubahBaris_('TAGIHAN', 'ID', idTagihan, {
            MenungguVerifikasi: Math.max(0, (Number(tagihan.MenungguVerifikasi) || 0) - jumlah)
          });
        }
      }

      ubahBaris_('BUKU_DEPOSIT', 'NoRujukan', noBukti, { Status: 'Dibatalkan' });
      catatLog_('Batalkan pembayaran', noBukti, { alasan: alasan, jumlah: jumlah });
      hapusCacheDashboard_();
      return { success: true, message: 'Pembayaran dibatalkan.' };
    });
  } catch (e) {
    return tolakBayar_('Gagal membatalkan pembayaran: ' + e.message);
  }
}

// Data kuitansi A4 berkop (B26) — cetak tidak menulis data.
function getKuitansi(noBukti) {
  try {
    const tolakKuitansi = wajibCetakPerTaruna_('cetak kuitansi');
    if (tolakKuitansi) return tolakKuitansi;

    const id = teks_(noBukti);
    const baris = bacaTabel_('PEMBAYARAN').filter(function (r) {
      return teks_(r.NoBukti) === id;
    })[0];
    if (!baris) return tolakBayar_('Kuitansi ' + id + ' tidak ditemukan.');

    const taruna = bacaTabel_('TARUNA').map(barisanTaruna_).filter(function (t) {
      return t.nisn === teks_(baris.NISN);
    })[0] || {};
    const tagihan = bacaTabel_('TAGIHAN').map(barisTagihan_).filter(function (t) {
      return t.id === teks_(baris.TagihanID);
    })[0] || {};
    const peta = petaPengaturan_();

    return {
      success: true,
      data: {
        sekolah: {
          nama: teks_(peta.NamaSekolah),
          alamat: teks_(peta.AlamatSekolah),
          npsn: teks_(peta.NPSN)
        },
        pembayaran: barisPembayaran_(baris),
        taruna: { nisn: teks_(taruna.nisn), nama: teks_(taruna.nama), kelas: teks_(taruna.kelas) },
        tagihan: {
          id: teks_(tagihan.id), jenisBiaya: teks_(tagihan.jenisBiaya),
          periode: teks_(tagihan.periode), nominalAkhir: Number(tagihan.nominalAkhir) || 0,
          sisa: Number(tagihan.sisa) || 0
        }
      }
    };
  } catch (e) {
    return tolakBayar_('Gagal membaca kuitansi: ' + e.message);
  }
}
