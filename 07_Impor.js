// ============================================================
// IMPOR CSV/XLSX
// Berkas dikirim klien sebagai { nama, dataUrl } (base64).
// CSV lewat Utilities.parseCsv, XLSX lewat Utilities.unzip +
// XmlService — tanpa pustaka/CDN apa pun.
// ============================================================

const IMPOR_MAX_BARIS = 2000;
const IMPOR_MAX_BYTE = 5 * 1024 * 1024;

// Alias header -> field. Kunci sudah lewat imporKunciHeader_
// (huruf kecil, tanpa selain angka-huruf).
const IMPOR_ALIAS_TARUNA = {
  nisn: 'nisn', nit: 'nit',
  nama: 'nama', namalengkap: 'nama',
  jk: 'jk', jeniskelamin: 'jk',
  angkatan: 'angkatan', tahunmasuk: 'angkatan', tahunmasuksekolah: 'angkatan',
  tingkat: 'tingkat',
  program: 'program', programkeahlian: 'program', jurusan: 'program',
  rombel: 'rombel', rombonganbelajar: 'rombel',
  emailsiswa: 'emailsiswa', email: 'emailsiswa',
  emailortu: 'emailortu', emailorangtua: 'emailortu', emailwali: 'emailortu',
  status: 'status',
  tanggalmasuk: 'tanggalmasuk', tanggalmasuksekolah: 'tanggalmasuk',
  catatan: 'catatan', keterangan: 'catatan'
};

function imporKunciHeader_(v) {
  let s = String(v === null || v === undefined ? '' : v).toLowerCase();
  if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return s.replace(/[^a-z0-9]/g, '');
}

// CSV: deteksi pemisah koma vs titik koma dari 5 baris pertama.
function imporBacaCsv_(teks) {
  const potong = String(teks || '').split(/\r?\n/).slice(0, 5);
  let koma = 0, titikKoma = 0;
  potong.forEach(function (b) {
    koma += (b.match(/,/g) || []).length;
    titikKoma += (b.match(/;/g) || []).length;
  });
  return Utilities.parseCsv(teks, titikKoma > koma ? ';' : ',');
}

// XLSX: sharedStrings + lembar pertama (tanpa pustaka luar).
function imporBacaXlsx_(dataBase64, nama) {
  const blob = Utilities.newBlob(Utilities.base64Decode(dataBase64),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', nama || 'impor.xlsx');
  const files = Utilities.unzip(blob);
  const peta = {};
  files.forEach(function (f) { peta[f.getName()] = f; });

  const shared = [];
  const fShared = peta['xl/sharedStrings.xml'];
  if (fShared) {
    const doc = XmlService.parse(fShared.getDataAsString('UTF-8').replace(/^\uFEFF/, ''));
    doc.getRootElement().getChildren('si').forEach(function (si) {
      let teks = '';
      si.getDescendants('t').forEach(function (t) { teks += t.getText(); });
      shared.push(teks);
    });
  }

  const fSheet = peta['xl/worksheets/sheet1.xml'] ||
    peta[Object.keys(peta).filter(function (k) { return /worksheets?\/.+\.xml$/.test(k); })[0] || ''];
  if (!fSheet) throw new Error('Lembar kerja pertama tidak ditemukan di berkas XLSX');

  const doc = XmlService.parse(fSheet.getDataAsString('UTF-8').replace(/^\uFEFF/, ''));
  const matriks = [];
  doc.getRootElement().getDescendants('row').forEach(function (row) {
    const attrR = row.getAttribute('r');
    const nomor = attrR ? parseInt(attrR.getValue(), 10) : matriks.length + 1;
    const arr = [];
    row.getChildren('c').forEach(function (c) {
      const attrRef = c.getAttribute('r');
      let col = -1;
      if (attrRef) {
        const m = /^([A-Z]+)/i.exec(String(attrRef.getValue()));
        if (m) {
          let n = 0;
          const huruf = m[1].toUpperCase();
          for (let i = 0; i < huruf.length; i++) n = n * 26 + (huruf.charCodeAt(i) - 64);
          col = n - 1;
        }
      }
      if (col < 0) col = arr.length;
      const t = c.getAttribute('t') ? c.getAttribute('t').getValue() : '';
      let nilai;
      if (t === 's') {
        const v = c.getChild('v');
        const idx = v ? parseInt(v.getText(), 10) : -1;
        nilai = shared[idx] === undefined ? '' : shared[idx];
      } else if (t === 'inlineStr') {
        const is = c.getChild('is');
        nilai = '';
        if (is) is.getDescendants('t').forEach(function (x) { nilai += x.getText(); });
      } else {
        const v = c.getChild('v');
        nilai = v ? v.getText() : '';
      }
      arr[col] = nilai;
    });
    if (arr.length) matriks[Math.max(0, nomor - 1)] = arr;
  });
  for (let i = 0; i < matriks.length; i++) if (!matriks[i]) matriks[i] = [];
  return matriks;
}

// ============================================================
// TEMPLATE IMPOR XLSX
// Kolom NISN diformat sebagai TEKS (numFmt 49) sehingga angka
// berawalan "00" tidak dibuang Excel. Ditulis langsung sebagai ZIP
// (stored) + XML agar tidak perlu pustaka luar (B23).
// ============================================================
const KOLOM_TEMPLATE = {
  taruna: ['NISN*', 'Nama*', 'NIT', 'Jenis Kelamin', 'Tingkat*', 'Program*', 'Rombel',
    'Tahun Masuk', 'EmailSiswa', 'EmailOrtu', 'Status', 'TanggalMasuk', 'Catatan']
  // Impor pembayaran/pengeluaran belum ada; jangan tambahkan template yang tak bisa dipakai.
};

const CRC_TABEL_ = (function () {
  const tabel = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    tabel[n] = c >>> 0;
  }
  return tabel;
})();

function crc32_(bytes) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABEL_[(c ^ (bytes[i] & 0xFF)) & 0xFF] ^ (c >>> 8);
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function teksKeBytes_(teks) {
  return Utilities.newBlob(String(teks)).getBytes().map(function (b) {
    return b < 0 ? b + 256 : b;
  });
}

// ZIP tanpa kompresi (method 0) — cukup untuk XLSX kecil.
function zipStored_(daftar) {
  const lokal = [];
  const pusat = [];
  let offset = 0;

  const u16 = function (arr, v) { arr.push(v & 0xFF, (v >>> 8) & 0xFF); };
  const u32 = function (arr, v) {
    arr.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF);
  };

  daftar.forEach(function (f) {
    const nama = teksKeBytes_(f.nama);
    const data = teksKeBytes_(f.teks);
    const crc = crc32_(data);

    const kepala = [];
    u32(kepala, 0x04034b50); u16(kepala, 20); u16(kepala, 0); u16(kepala, 0);
    u16(kepala, 0); u16(kepala, 0);
    u32(kepala, crc); u32(kepala, data.length); u32(kepala, data.length);
    u16(kepala, nama.length); u16(kepala, 0);

    const mulai = offset;
    kepala.forEach(function (b) { lokal.push(b); });
    nama.forEach(function (b) { lokal.push(b); });
    data.forEach(function (b) { lokal.push(b); });
    offset = lokal.length;

    u32(pusat, 0x02014b50); u16(pusat, 20); u16(pusat, 20); u16(pusat, 0); u16(pusat, 0);
    u16(pusat, 0); u16(pusat, 0);
    u32(pusat, crc); u32(pusat, data.length); u32(pusat, data.length);
    u16(pusat, nama.length); u16(pusat, 0); u16(pusat, 0);
    u16(pusat, 0); u16(pusat, 0); u32(pusat, 0); u32(pusat, mulai);
    nama.forEach(function (b) { pusat.push(b); });
  });

  const akhir = [];
  u32(akhir, 0x06054b50); u16(akhir, 0); u16(akhir, 0);
  u16(akhir, daftar.length); u16(akhir, daftar.length);
  u32(akhir, pusat.length); u32(akhir, offset); u16(akhir, 0);

  return lokal.concat(pusat, akhir);
}

function escXml_(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function kolomHuruf_(n) {
  let s = '';
  let x = Number(n);
  while (x > 0) {
    const r = (x - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

// matriks[0] = header. Kolom A selalu teks; header tebal.
function buatXlsx_(matriks) {
  const baris = (matriks || []).map(function (row, ri) {
    const sel = row.map(function (v, ci) {
      const ref = kolomHuruf_(ci + 1) + (ri + 1);
      const gaya = ci === 0 ? ' s="1"' : (ri === 0 ? ' s="2"' : '');
      return '<c r="' + ref + '" t="inlineStr"' + gaya + '><is><t xml:space="preserve">' +
        escXml_(v) + '</t></is></c>';
    }).join('');
    return '<row r="' + (ri + 1) + '">' + sel + '</row>';
  }).join('');

  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<cols><col min="1" max="1" width="18" style="1" customWidth="1"/></cols>' +
    '<sheetData>' + baris + '</sheetData></worksheet>';

  const gaya = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
    '<fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  const berkas = [
    { nama: '[Content_Types].xml', teks: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>' },
    { nama: '_rels/.rels', teks: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>' },
    { nama: 'xl/workbook.xml', teks: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Taruna" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { nama: 'xl/_rels/workbook.xml.rels', teks: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>' },
    { nama: 'xl/worksheets/sheet1.xml', teks: sheet },
    { nama: 'xl/styles.xml', teks: gaya }
  ];

  return Utilities.base64Encode(zipStored_(berkas));
}

// Unduh template XLSX (kolom NISN teks) untuk staf.
function templateImporXlsx(jenis) {
  try {
    const tolakan = wajibStaf_();
    if (tolakan) return tolakan;
    const j = String(jenis || '').trim().toLowerCase();
    const kolom = KOLOM_TEMPLATE[j];
    if (!kolom) return { success: false, message: 'Template ' + j + ' belum tersedia.' };
    return {
      success: true,
      data: { nama: 'template-impor-' + j + '.xlsx', base64: buatXlsx_([kolom]) }
    };
  } catch (e) {
    return { success: false, message: 'Gagal membuat template XLSX: ' + e.message };
  }
}

// dataUrl/base64 -> { nama, tipe, matriks }. Melempar Error berlabel jelas.
function imporBacaBerkas_(berkas) {
  berkas = berkas || {};
  const nama = String(berkas.nama || '').trim();
  const ext = (nama.split('.').pop() || '').toLowerCase();
  if (ext !== 'xlsx' && ext !== 'csv') {
    throw new Error('Berkas harus berformat .xlsx atau .csv.');
  }

  let data = String(berkas.data || berkas.dataUrl || '');
  const koma = data.indexOf(',');
  if (data.slice(0, 5).toLowerCase() === 'data:' && koma > 0) data = data.slice(koma + 1);
  data = data.replace(/\s+/g, '');
  if (!data) throw new Error('Isi berkas kosong.');
  if (data.length * 3 / 4 > IMPOR_MAX_BYTE) {
    throw new Error('Berkas melebihi 5 MB. Kecilkan dulu sebelum diimpor.');
  }

  let matriks;
  if (ext === 'csv') {
    const teks = Utilities.newBlob(Utilities.base64Decode(data))
      .getDataAsString('UTF-8').replace(/^\uFEFF/, '');
    matriks = imporBacaCsv_(teks);
  } else {
    matriks = imporBacaXlsx_(data, nama);
  }
  return { nama: nama, tipe: ext, matriks: matriks };
}

// Cari baris header: baris dengan alias terbanyak di 10 baris pertama.
// Balikan: { idx, judul, kolom: [ field | '' ] }.
function imporMapKolom_(matriks, alias, minimum) {
  let idx = -1, skor = 0;
  const batas = Math.min(matriks.length, 10);
  for (let i = 0; i < batas; i++) {
    let s = 0;
    (matriks[i] || []).forEach(function (sel) {
      if (alias[imporKunciHeader_(sel)]) s++;
    });
    if (s > skor) { skor = s; idx = i; }
  }
  if (idx < 0 || skor < (minimum || 3)) {
    throw new Error('Baris header tidak dikenali. Unduh template CSV untuk melihat kolom yang dibutuhkan.');
  }

  const judul = matriks[idx] || [];
  const kolom = judul.map(function (j) {
    const field = alias[imporKunciHeader_(j)] || '';
    return field;
  });
  return { idx: idx, judul: judul, kolom: kolom };
}

// Matriks -> daftar { baris, nilai } (nilai = objek field mentah).
function imporBarisData_(baca, alias) {
  const peta = imporMapKolom_(baca.matriks, alias, 3);
  const hasil = [];
  for (let i = peta.idx + 1; i < baca.matriks.length; i++) {
    const arr = baca.matriks[i] || [];
    if (!arr.some(function (v) { return v !== '' && v !== null && v !== undefined; })) continue;
    const nilai = {};
    peta.kolom.forEach(function (field, j) {
      if (!field) return;
      nilai[field] = arr[j] === undefined || arr[j] === null ? '' : String(arr[j]).trim();
    });
    hasil.push({ baris: hasil.length + 1, nilai: nilai });
  }
  if (hasil.length > IMPOR_MAX_BARIS) {
    throw new Error('Impor maksimal 2.000 baris (berkas punya ' + hasil.length + ' baris).');
  }
  return hasil;
}

// ' 6/8/2009 ' -> '2009-08-06'; serial Excel ikut; '' bila tak bisa.
function imporTanggal_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim();
  if (!s) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(s);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  if (/^\d+(\.0+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(parseFloat(s)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return '';
}

// Jenis kelamin: L -> Laki-laki, P -> Perempuan.
function imporJk_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toLowerCase();
  if (!s) return '';
  if (/^(l|laki|lakilaki|laki-laki|pria)$/.test(s)) return 'Laki-laki';
  if (/^(p|perempuan|wanita|cewek)$/.test(s)) return 'Perempuan';
  return '';
}

// Normalisasi tingkat/program; '' bila tak lolos.
function imporTingkat_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  return ['X', 'XI', 'XII'].indexOf(s) !== -1 ? s : '';
}

function imporProgram_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  if (['NKPI', 'TKN', 'NKN'].indexOf(s) !== -1) return s;
  return '';
}

function imporStatus_(v) {
  const s = String(v === null || v === undefined ? '' : v).trim().toUpperCase();
  if (!s) return 'AKTIF';
  if (s === 'MENINGGAL') return 'WAFAT';
  return ['AKTIF', 'CUTI', 'LULUS', 'PINDAH', 'DO', 'WAFAT'].indexOf(s) !== -1 ? s : '';
}

// Sah -> { sah: true, baris }; tidak -> { sah: false, alasan }.
function validasiBarisTaruna_(nilai, tahunAjaran) {
  const nisn = String(nilai.nisn || '').trim();
  if (!/^\d{10}$/.test(nisn)) {
    return { sah: false, alasan: 'NISN harus 10 digit angka.' };
  }
  const nama = String(nilai.nama || '').trim();
  if (!nama) return { sah: false, alasan: 'Nama wajib diisi.' };
  const tingkat = imporTingkat_(nilai.tingkat);
  if (!tingkat) return { sah: false, alasan: 'Tingkat harus X/XI/XII.' };
  // Angkatan opsional: bila kolom kosong, turunkan dari tingkat + tahun ajaran.
  let angkatan = String(nilai.angkatan || '').replace(/\D/g, '');
  if (!angkatan) angkatan = angkatanDariTingkat_(tingkat, tahunAjaran);
  if (angkatan.length !== 4) return { sah: false, alasan: 'Tahun masuk harus 4 digit tahun.' };
  const program = imporProgram_(nilai.program);
  if (!program) return { sah: false, alasan: 'Program harus NKPI/TKN/NKN.' };
  const status = imporStatus_(nilai.status);
  if (!status) return { sah: false, alasan: 'Status harus AKTIF/CUTI/LULUS/PINDAH/DO/WAFAT.' };

  const rombel = String(nilai.rombel || '').trim().toUpperCase();
  if ([nama, nilai.nit, nilai.catatan, nilai.emailsiswa, nilai.emailortu].some(formulaBahayaKetat_)) {
    return { sah: false, alasan: 'Teks tidak boleh diawali = + - @.' };
  }
  return {
    sah: true,
    baris: {
      NISN: nisn,
      NIT: String(nilai.nit || '').trim(),
      Nama: nama,
      'Jenis Kelamin': imporJk_(nilai.jk),
      Angkatan: angkatan,
      Tingkat: tingkat,
      Program: program,
      Rombel: rombel,
      Kelas: kelasTaruna_(tingkat, program, rombel),
      EmailSiswa: keyEmail_(nilai.emailsiswa),
      EmailOrtu: keyEmail_(nilai.emailortu),
      Status: status,
      TanggalMasuk: imporTanggal_(nilai.tanggalmasuk),
      Catatan: String(nilai.catatan || '').trim()
    }
  };
}

// Tahap bersama pratinjau & eksekusi: baca berkas, validasi tiap baris.
// Balikan { success, data:{ baris, berhasil, dilewati, gagal } } dengan
// daftar dilengkapi deskripsi { baris, alasan }.
function prosesImpor_(jenis, eksekusi, berkas, selesaiWaktu) {
  try {
    if (jenis !== 'taruna') {
      return { success: false, message: 'Impor ' + jenis + ' menyusul pada pengembangan berikutnya.' };
    }

    const baca = imporBacaBerkas_(berkas);
    const mentah = imporBarisData_(baca, IMPOR_ALIAS_TARUNA);
    // Sekali per berkas, bukan sekali per baris.
    const tahunAjaran = tahunAjaranAktif_();

    const ada = {};
    bacaTabel_('TARUNA').forEach(function (r) {
      ada[String(r.NISN === null || r.NISN === undefined ? '' : r.NISN).trim()] = true;
    });

    const laporan = { baris: mentah.length, berhasil: 0, dilewati: [], gagal: [] };
    const tulis = [];
    const sudahDiBerkas = {};
    // Sekali per berkas: getSesi() membaca sheet, jangan dipanggil per baris.
    const pelaku = teks_((getSesi().data || {}).email) || emailAktif();

    mentah.forEach(function (k) {
      const hasilBaris = validasiBarisTaruna_(k.nilai, tahunAjaran);
      if (!hasilBaris.sah) {
        laporan.gagal.push({ baris: k.baris, alasan: hasilBaris.alasan });
        return;
      }
      if (sudahDiBerkas[hasilBaris.baris.NISN] || ada[hasilBaris.baris.NISN]) {
        laporan.dilewati.push({ baris: k.baris, alasan: 'NISN sudah terdaftar' });
        return;
      }
      sudahDiBerkas[hasilBaris.baris.NISN] = true;
      if (eksekusi) tulis.push(Object.assign({
        DicatatOleh: pelaku,
        Waktu: selesaiWaktu
      }, hasilBaris.baris));
      laporan.berhasil++;
    });

    if (eksekusi) {
      tulisBanyak_('TARUNA', tulis);
      // Nama kelas bergantung pada jumlah rombel per tingkat+program.
      hitungUlangKelas_();
      hapusCacheDashboard_();
      catatLog_('Impor taruna', 'TARUNA', {
        baris: laporan.baris, berhasil: laporan.berhasil,
        dilewati: laporan.dilewati.length, gagal: laporan.gagal.length
      });
    }

    return {
      success: true,
      message: eksekusi
        ? 'Impor selesai: ' + laporan.berhasil + ' berhasil, ' +
          laporan.dilewati.length + ' dilewati, ' + laporan.gagal.length + ' gagal.'
        : 'Pratinjau: ' + laporan.baris + ' baris, ' + laporan.berhasil +
          ' siap diimpor.',
      data: laporan
    };
  } catch (e) {
    return { success: false, message: 'Gagal membaca berkas impor: ' + e.message };
  }
}

// jenis: 'taruna' | 'pembayaran' | 'pengeluaran'
function pratinjauImpor(jenis, berkas) {
  const tolakan = wajibStaf_();
  if (tolakan) return tolakan;
  return prosesImpor_(jenis, false, berkas);
}

// opsi: { buatTagihan } (khusus pembayaran — menyusul pada task berikutnya).
function jalankanImpor(jenis, berkas, opsi) {
  const tolakan = wajibTulis_('Impor ' + jenis);
  if (tolakan) return tolakan;
  return prosesImpor_(jenis, true, berkas, waktuIso_());
}
