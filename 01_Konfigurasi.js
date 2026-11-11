// ============================================================
// KONFIGURASI
// ============================================================
// Isi dengan ID spreadsheet bila ingin memakai spreadsheet yang sudah ada.
// Kosong = getSpreadsheet()/setupDatabase() membuat spreadsheet baru.
const SPREADSHEET_ID = '';

const PROP_SS_ID = 'SPREADSHEET_ID';
const NAMA_SPREADSHEET = 'KEUANGAN SEKOLAH SMK MARITIM NUSANTARA KUPANG';
const WARNA_HEADER = '#12776B';
const BACKUP_FOLDER = 'Backup Keuangan';
const BACKUP_SIMPAN_HARI = 30;

const PERAN_STAF = ['Admin', 'Bendahara', 'Kepsek', 'Viewer', 'Wali Kelas', 'Super Admin', 'Kasir', 'Yayasan', 'Auditor'];
const PERAN_TULIS = ['Admin', 'Bendahara'];
const STATUS_MENUNGGU = 'Menunggu verifikasi';
const AMBANG_KEPSEK_PENGELUARAN = 200000000; // 200 Jt (E3)

// ============================================================
// SKEMA SHEET (persis tabel "Model data" di spec)
// ============================================================
const SHEET_HEADERS = {
  PENGGUNA: ['Email', 'Nama', 'Peran', 'Kelas', 'Aktif', 'DicatatOleh', 'Waktu',
    'PIN', 'Salt', 'NISN', 'Gagal', 'TerkunciSampai', 'WajibGantiPin'],
  TARUNA: ['NISN', 'NIT', 'Nama', 'Jenis Kelamin', 'Angkatan', 'Tingkat', 'Program',
    'Rombel', 'Kelas', 'EmailSiswa', 'EmailOrtu', 'Status', 'TanggalMasuk', 'Catatan',
    'DicatatOleh', 'Waktu'],
  JENIS_BIAYA: ['Kode', 'Nama', 'Periode', 'Urutan', 'Aktif'],
  TARIF: ['JenisBiaya', 'Angkatan', 'TahunAjaran', 'Nominal'],
  TAGIHAN: ['ID', 'NISN', 'JenisBiaya', 'Periode', 'NominalAwal', 'NominalAkhir',
    'PotonganID', 'AlasanPenyesuaian', 'Sisa', 'Status', 'MenungguVerifikasi',
    'DibuatOleh', 'Waktu', 'Keterangan'],
  PEMBAYARAN: ['NoBukti', 'Tanggal', 'NISN', 'TagihanID', 'JenisBiaya', 'Periode',
    'Jumlah', 'Metode', 'Status', 'Keterangan', 'DicatatOleh', 'DiverifikasiOleh',
    'WaktuVerifikasi', 'AlasanBatalkan', 'Sumber', 'IdempotensiKey'],
  PENGELUARAN: ['NoBukti', 'Tanggal', 'Kategori', 'Keterangan', 'Jumlah', 'Metode',
    'Status', 'DicatatOleh', 'DiverifikasiOleh', 'AlasanBatalkan', 'Sumber', 'DisetujuiOleh'],
  KATEGORI_PENGELUARAN: ['Nama', 'Aktif'],
  POTONGAN: ['ID', 'NISN', 'Jenis', 'NamaProgram', 'JenisBiaya', 'TipeNilai', 'Nilai',
    'BerlakuDari', 'BerlakuSampai', 'Alasan', 'DisetujuiOleh', 'Aktif', 'DicatatOleh', 'Waktu'],
  PEMUTIHAN: ['NoPemutihan', 'Tanggal', 'NISN', 'Jumlah', 'Alasan', 'Status',
    'DiajukanOleh', 'DisetujuiOleh', 'Waktu'],
  BUKU_DEPOSIT: ['Tanggal', 'NISN', 'Arah', 'Jumlah', 'Jenis', 'NoRujukan', 'Keterangan', 'Status', 'Waktu', 'Oleh'],
  REFUND: ['NoRefund', 'Tanggal', 'NISN', 'Kotor', 'Tagihan', 'Netto', 'Status',
    'DiajukanOleh', 'DisetujuiOleh', 'Waktu'],
  PENGATURAN: ['Kunci', 'Nilai'],
  LOG: ['Waktu', 'Akun', 'Aksi', 'Objek', 'Detail']
};

// Kolom yang wajib berformat teks agar angka 0 di depan tidak hilang.
const KOLOM_TEKS = ['NISN', 'NIT'];

const JENIS_BIAYA_DEFAULT = [
  ['SPP', 'SPP', 'Bulanan', 1, 'Ya'],
  ['KOMITE', 'Komite', 'Tahunan', 2, 'Ya'],
  ['ASURANSI', 'Asuransi', 'Sekali', 3, 'Ya'],
  ['OSIS', 'OSIS', 'Tahunan', 4, 'Ya'],
  ['SERAGAM', 'Seragam', 'Sekali', 5, 'Ya'],
  ['PKL', 'PKL', 'Tahunan', 6, 'Ya'],
  ['MPLS', 'MPLS', 'Sekali', 7, 'Ya'],
  ['SARPRAS', 'Sarana Prasarana', 'Tahunan', 8, 'Ya']
];

const KATEGORI_DEFAULT = [
  ['Operasional', 'Ya'],
  ['Sarana prasarana', 'Ya'],
  ['Honor/kegiatan', 'Ya'],
  ['ATK', 'Ya'],
  ['Lain-lain', 'Ya']
];

const PENGATURAN_DEFAULT = [
  ['TahunAjaranAktif', '2026/2027'],
  ['NamaSekolah', 'SMK Maritim Nusantara Kupang'],
  ['AlamatSekolah', 'Kupang, Nusa Tenggara Timur'],
  ['NPSN', ''],
  ['SaldoAwalKas', '0'],
  ['SaldoAwalBank', '0'],
  ['TanggalSaldoAwal', '2026-07-01']
];
