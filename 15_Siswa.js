// ============================================================
// MODE SISWA / ORTU (B25) — data diambil dari sesi, bukan dari klien
// ============================================================
function getTagihanSiswa() {
  try {
    const sesi = getSesi().data || {};
    if (sesi.status !== 'ok') {
      return { success: false, message: 'Akun ini belum terdaftar. Hubungi admin sekolah.' };
    }
    const terkait = sesi.tarunaTerkait || [];
    if (!terkait.length) {
      return { success: false, message: 'Akun ini tidak terhubung ke data taruna.' };
    }

    const cocok = {};
    terkait.forEach(function (t) { cocok[t.nisn] = true; });
    const nama = {};
    terkait.forEach(function (t) { nama[t.nisn] = t.nama; });

    const tagihan = bacaTabel_('TAGIHAN').map(barisTagihan_).filter(function (t) {
      return cocok[t.nisn];
    }).map(function (t) {
      return {
        nisn: t.nisn, jenisBiaya: t.jenisBiaya, periode: t.periode,
        nominalAkhir: t.nominalAkhir, sisa: t.sisa, status: t.status
      };
    });

    const riwayat = bacaTabel_('PEMBAYARAN').map(barisPembayaran_).filter(function (p) {
      return cocok[p.nisn];
    }).map(function (p) {
      return {
        tanggal: p.tanggal, noBukti: p.noBukti, taruna: nama[p.nisn] || '',
        jumlah: p.jumlah, metode: p.metode, status: p.status
      };
    });
    riwayat.sort(function (a, b) {
      return String(b.tanggal).localeCompare(String(a.tanggal), 'id') ||
        String(b.noBukti).localeCompare(String(a.noBukti), 'id');
    });

    const totalTagihan = tagihan.reduce(function (a, t) { return a + t.nominalAkhir; }, 0);
    const totalBayar = tagihan.reduce(function (a, t) {
      return a + Math.max(0, t.nominalAkhir - t.sisa);
    }, 0);
    const tunggakan = tagihan.reduce(function (a, t) {
      return a + (t.status === 'Lunas' ? 0 : t.sisa);
    }, 0);

    return {
      success: true,
      data: {
        taruna: terkait.map(function (t) {
          return { nisn: t.nisn, nama: t.nama, kelas: t.kelas };
        }),
        tagihan: tagihan,
        riwayat: riwayat,
        ringkas: { totalTagihan: totalTagihan, totalBayar: totalBayar, tunggakan: tunggakan }
      }
    };
  } catch (e) {
    return { success: false, message: 'Gagal membaca tagihan siswa: ' + e.message };
  }
}
