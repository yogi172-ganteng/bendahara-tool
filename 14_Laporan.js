// ============================================================
// LAPORAN (B19/B21) — semua peran staf boleh baca, mode siswa ditolak
// ============================================================
const JENIS_LAPORAN = ['bulanan', 'kategori', 'kelas', 'tunggakan'];

function getLaporan(r) {
  try {
    const tolakan = wajibStaf_();
    // Semua staf tetap boleh; Yayasan/Auditor lewat gerbang laporan khusus.
    if (tolakan && wajibLaporan_('lihat laporan')) return tolakan;

    const data = r || {};
    const jenis = teks_(data.jenis).toLowerCase();
    if (JENIS_LAPORAN.indexOf(jenis) === -1) {
      return { success: false, message: 'Jenis laporan harus bulanan/kategori/kelas/tunggakan.' };
    }
    const ta = teks_(data.tahunAjaran) || tahunAjaranAktif_();

    const pembayaran = bacaTabel_('PEMBAYARAN').map(barisPembayaran_).filter(function (p) {
      return p.status === 'Terverifikasi' &&
        dalamTahunAjaran_(bulanDariTanggal_(p.tanggal), ta);
    });
    const pengeluaran = bacaTabel_('PENGELUARAN').map(barisPengeluaran_).filter(function (p) {
      return (p.status === 'Terverifikasi' || p.status === 'DISETUJUI') &&
        dalamTahunAjaran_(bulanDariTanggal_(p.tanggal), ta);
    });

    let baris = [];
    if (jenis === 'bulanan') {
      baris = bulanTahunAjaran_(ta).map(function (b) {
        const masukBulan = pembayaran.filter(function (p) {
          return bulanDariTanggal_(p.tanggal) === b.kunci;
        }).reduce(function (a, d) { return a + d.jumlah; }, 0);
        const keluarBulan = pengeluaran.filter(function (p) {
          return bulanDariTanggal_(p.tanggal) === b.kunci;
        }).reduce(function (a, d) { return a + d.jumlah; }, 0);
        return {
          bulan: b.label, kunci: b.kunci,
          penerimaan: masukBulan, pengeluaran: keluarBulan,
          selisih: masukBulan - keluarBulan
        };
      });
    } else if (jenis === 'kategori') {
      const per = {};
      pembayaran.forEach(function (d) {
        const kunci = teks_(d.jenisBiaya) || 'Lain-lain';
        per[kunci] = (per[kunci] || 0) + d.jumlah;
      });
      baris = Object.keys(per).map(function (nama) {
        return { nama: nama, nominal: per[nama] };
      }).sort(function (a, b) {
        return b.nominal - a.nominal || String(a.nama).localeCompare(String(b.nama), 'id');
      });
    } else if (jenis === 'kelas') {
      const peta = {};
      bacaTabel_('TARUNA').map(barisanTaruna_).forEach(function (t) { peta[t.nisn] = t; });
      const per = {};
      bacaTabel_('TAGIHAN').map(barisTagihan_).filter(function (t) {
        return dalamTahunAjaran_(t.periode, ta);
      }).forEach(function (t) {
        const kelas = teks_((peta[t.nisn] || {}).kelas) || '-';
        if (!per[kelas]) {
          per[kelas] = { kelas: kelas, tagihan: 0, terbayar: 0, tunggakan: 0 };
        }
        per[kelas].tagihan += t.nominalAkhir;
        per[kelas].terbayar += Math.max(0, t.nominalAkhir - t.sisa);
        per[kelas].tunggakan += t.sisa;
      });
      baris = Object.keys(per).map(function (k) { return per[k]; }).map(function (b) {
        return {
          kelas: b.kelas, tagihan: b.tagihan, terbayar: b.terbayar,
          tunggakan: b.tunggakan,
          persen: b.tagihan > 0 ? Math.round((b.terbayar / b.tagihan) * 100) : 0
        };
      }).sort(function (a, b) { return String(a.kelas).localeCompare(String(b.kelas), 'id'); });
    } else {
      baris = getTunggakan(ta).data.baris;
    }

    const ringkas = {
      penerimaan: pembayaran.reduce(function (a, d) { return a + d.jumlah; }, 0),
      pengeluaran: pengeluaran.reduce(function (a, d) { return a + d.jumlah; }, 0)
    };
    ringkas.saldo = ringkas.penerimaan - ringkas.pengeluaran;

    return {
      success: true,
      data: { jenis: jenis, tahunAjaran: ta, baris: baris, ringkas: ringkas }
    };
  } catch (e) {
    return { success: false, message: 'Gagal menyusun laporan: ' + e.message };
  }
}
