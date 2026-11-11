// ============================================================
// DASHBOARD (B18 saldo, B22 cache 5 menit)
// ============================================================
const BULAN_TA = ['Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun'];

// 12 bulan tahun ajaran Juli -> Juni: [{kunci:'2026-07', label:'Jul'}, ...].
function bulanTahunAjaran_(tahunAjaran) {
  const m = /^(\d{4})\/(\d{4})$/.exec(teks_(tahunAjaran));
  const tahunAwal = m ? Number(m[1]) : new Date().getFullYear();
  const hasil = [];
  for (let i = 0; i < 12; i++) {
    const nomor = 7 + i;
    const tahun = tahunAwal + (nomor > 12 ? 1 : 0);
    const bulan = nomor > 12 ? nomor - 12 : nomor;
    hasil.push({ kunci: tahun + '-' + String(bulan).padStart(2, '0'), label: BULAN_TA[i] });
  }
  return hasil;
}

function bulanDariTanggal_(tanggal) {
  return teks_(tanggal).slice(0, 7);
}

// Periode tagihan dalam tahun ajaran tertentu.
function dalamTahunAjaran_(periode, tahunAjaran) {
  const bulan = bulanTahunAjaran_(tahunAjaran);
  const p = teks_(periode);
  if (/^\d{4}-\d{2}$/.test(p)) return p >= bulan[0].kunci && p <= bulan[11].kunci;
  if (/^\d{4}\/\d{4}$/.test(p)) return p === teks_(tahunAjaran);
  return false;
}

// Bulan berjalan untuk KPI: periode SPP terbaru; fallback bulan hari ini.
function periodeBerjalanSpp_() {
  const daftar = bacaTabel_('TAGIHAN').map(barisTagihan_).filter(function (t) {
    return t.jenisBiaya === 'SPP' && /^\d{4}-\d{2}$/.test(t.periode);
  }).map(function (t) { return t.periode; }).sort();
  const d = new Date();
  const kini = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (daftar.length) {
    // Tagihan bulan depan boleh sudah dibuat, tapi KPI tetap bulan berjalan.
    const terakhir = daftar[daftar.length - 1];
    return terakhir > kini ? kini : terakhir;
  }
  return kini;
}

function hariIniIso_() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function jumlahMetode_(daftar, metode) {
  return daftar.filter(function (d) { return d.metode === metode; })
    .reduce(function (a, d) { return a + (Number(d.jumlah) || 0); }, 0);
}

// Susun seluruh angka dashboard (tanpa cache).
function hitungDashboard_(tahunAjaran) {
  const pengaturan = petaPengaturan_();
  const awalKas = Number(pengaturan.SaldoAwalKas) || 0;
  const awalBank = Number(pengaturan.SaldoAwalBank) || 0;

  const pembayaran = bacaTabel_('PEMBAYARAN').map(barisPembayaran_);
  const pengeluaran = bacaTabel_('PENGELUARAN').map(barisPengeluaran_);
  const menungguVerifikasi = bacaTabel_('PEMBAYARAN').filter(function (r) {
    return teks_(r.Status) === STATUS_MENUNGGU && teks_(r.Metode).toLowerCase() === 'transfer';
  }).length;
  const masuk = pembayaran.filter(function (p) { return p.status === 'Terverifikasi'; });
  const keluar = pengeluaran.filter(function (p) { return p.status === 'Terverifikasi' || p.status === 'DISETUJUI'; });

  // B18: saldo tanpa filter tanggal (backfill mulai Juli 2026 = tanggal saldo awal).
  const saldoKas = awalKas + jumlahMetode_(masuk, 'Tunai') - jumlahMetode_(keluar, 'Tunai');
  const saldoBank = awalBank + jumlahMetode_(masuk, 'Transfer') - jumlahMetode_(keluar, 'Transfer');

  const periode = periodeBerjalanSpp_();
  const padaPeriode = function (d) { return bulanDariTanggal_(d.tanggal) === periode; };

  const grafik = bulanTahunAjaran_(tahunAjaran).map(function (b) {
    const nilai = masuk.filter(function (d) {
      return bulanDariTanggal_(d.tanggal) === b.kunci;
    }).reduce(function (a, d) { return a + d.jumlah; }, 0);
    const keluarBulan = keluar.filter(function (d) {
      return bulanDariTanggal_(d.tanggal) === b.kunci;
    }).reduce(function (a, d) { return a + d.jumlah; }, 0);
    return { bulan: b.label, nilai: nilai, keluar: keluarBulan, kosong: nilai === 0 && keluarBulan === 0 };
  });

  // Penerimaan per kategori jenis biaya (spec Dashboard), urut nominal turun.
  const perKategori = {};
  masuk.filter(function (d) {
    return dalamTahunAjaran_(bulanDariTanggal_(d.tanggal), tahunAjaran);
  }).forEach(function (d) {
    const kunci = teks_(d.jenisBiaya) || 'Lain-lain';
    perKategori[kunci] = (perKategori[kunci] || 0) + d.jumlah;
  });
  const kategori = Object.keys(perKategori).map(function (nama) {
    return { nama: nama, nominal: perKategori[nama] };
  }).sort(function (a, b) {
    return b.nominal - a.nominal || String(a.nama).localeCompare(String(b.nama), 'id');
  });

  const petaTaruna = {};
  bacaTabel_('TARUNA').map(barisanTaruna_).forEach(function (t) { petaTaruna[t.nisn] = t; });

  const perKelas = {};
  const tagihan = bacaTabel_('TAGIHAN').map(barisTagihan_);
  tagihan.forEach(function (t) {
    if (t.jenisBiaya !== 'SPP' || t.periode !== periode) return;
    const kelas = teks_((petaTaruna[t.nisn] || {}).kelas) || '-';
    if (!perKelas[kelas]) perKelas[kelas] = { kelas: kelas, tagihan: 0, terbayar: 0 };
    perKelas[kelas].tagihan += t.nominalAkhir;
    perKelas[kelas].terbayar += Math.max(0, t.nominalAkhir - t.sisa);
  });
  const sppKelas = Object.keys(perKelas).map(function (k) { return perKelas[k]; })
    .filter(function (b) { return b.tagihan > 0; })
    .map(function (b) {
      const persen = Math.round((b.terbayar / b.tagihan) * 100);
      return { kelas: b.kelas, persen: persen, rendah: persen < 80 };
    })
    .sort(function (a, b) { return String(a.kelas).localeCompare(String(b.kelas), 'id'); });

  const potongan = bacaTabel_('POTONGAN').map(barisPotongan_);
  const potonganTaruna = {};
  potongan.forEach(function (p) { potonganTaruna[p.nisn] = true; });
  const potonganTahunIni = tagihan.filter(function (t) {
    return dalamTahunAjaran_(t.periode, tahunAjaran);
  }).reduce(function (a, t) {
    return a + Math.max(0, t.nominalAwal - t.nominalAkhir);
  }, 0);

  const daftarTransaksi = [];
  masuk.concat(pembayaran.filter(function (p) { return p.status !== 'Terverifikasi'; }))
    .forEach(function (p) {
      const taruna = petaTaruna[p.nisn] || {};
      daftarTransaksi.push({
        tanggal: p.tanggal, noBukti: p.noBukti,
        tarunaKeterangan: teks_(taruna.nama),
        kategori: p.jenisBiaya + ' ' + p.periode,
        metode: p.metode, jumlah: p.jumlah, status: p.status
      });
    });
  pengeluaran.forEach(function (p) {
    daftarTransaksi.push({
      tanggal: p.tanggal, noBukti: p.noBukti,
      tarunaKeterangan: p.keterangan, kategori: p.kategori,
      metode: p.metode, jumlah: p.jumlah, status: p.status
    });
  });
  daftarTransaksi.sort(function (a, b) {
    return String(b.tanggal).localeCompare(String(a.tanggal), 'id') ||
      String(b.noBukti).localeCompare(String(a.noBukti), 'id');
  });

  const belumLunas = tagihan.filter(function (t) {
    return t.status !== 'Lunas' && t.sisa > 0;
  });
  const tarunaMenunggak = {};
  belumLunas.forEach(function (t) { tarunaMenunggak[t.nisn] = true; });

  return {
    periode: { tahunAjaran: teks_(tahunAjaran), perTanggal: hariIniIso_(), periodeSpp: periode },
    kpi: {
      penerimaanBulanIni: masuk.filter(padaPeriode).reduce(function (a, d) { return a + d.jumlah; }, 0),
      penerimaanTotal: masuk.reduce(function (a, d) { return a + d.jumlah; }, 0),
      pengeluaranBulanIni: keluar.filter(padaPeriode).reduce(function (a, d) { return a + d.jumlah; }, 0),
      pengeluaranTotal: keluar.reduce(function (a, d) { return a + d.jumlah; }, 0),
      saldoKas: saldoKas,
      saldoBank: saldoBank,
      saldoTotal: saldoKas + saldoBank,
      rincianTunai: saldoKas,
      rincianBank: saldoBank
    },
    tunggakan: {
      nominal: belumLunas.reduce(function (a, t) { return a + t.sisa; }, 0),
      jumlahTaruna: Object.keys(tarunaMenunggak).length
    },
    menungguVerifikasi: menungguVerifikasi,
    grafik: grafik,
    kategori: kategori,
    sppKelas: sppKelas,
    metode: {
      tunai: masuk.filter(function (p) { return padaPeriode(p) && p.metode === 'Tunai'; })
        .reduce(function (a, d) { return a + d.jumlah; }, 0),
      transfer: masuk.filter(function (p) { return padaPeriode(p) && p.metode === 'Transfer'; })
        .reduce(function (a, d) { return a + d.jumlah; }, 0)
    },
    beasiswa: {
      beasiswa: potongan.filter(function (p) { return p.jenis === 'Beasiswa'; }).length,
      keringanan: potongan.filter(function (p) { return p.jenis === 'Keringanan'; }).length,
      pembebasan: potongan.filter(function (p) { return p.jenis === 'Pembebasan'; }).length,
      potonganTahunIni: potonganTahunIni,
      jumlahTaruna: Object.keys(potonganTaruna).length
    },
    transaksi: daftarTransaksi.slice(0, 7)
  };
}

// Dashboard dengan cache 5 menit (B22). Cache dibersihkan tiap mutasi transaksi.
function getDashboard(opts) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;

    const ta = teks_((opts || {}).tahunAjaran) || tahunAjaranAktif_();
    const kunci = 'DASH:' + versiCacheDashboard_() + ':' + ta;
    const bucket = cacheBucket_();
    const tersimpan = bucket.get(kunci);
    if (tersimpan) {
      try {
        return { success: true, data: JSON.parse(tersimpan) };
      } catch (e) {
        // cache rusak -> hitung ulang
      }
    }

    const data = hitungDashboard_(ta);
    try {
      bucket.put(kunci, JSON.stringify(data), 300);
    } catch (e) {
      // cache gagal -> tetap kembalikan data segar
    }
    return { success: true, data: data };
  } catch (e) {
    return { success: false, message: 'Gagal membaca dashboard: ' + e.message };
  }
}
